import asyncio
import json
import logging
import os
import uuid
from collections.abc import AsyncGenerator
from dataclasses import dataclass
from typing import Any, Literal

from fastapi import HTTPException
from llmai import get_client  # type: ignore[import-not-found]
from llmai.shared import (  # type: ignore[import-not-found]
    AssistantMessage,
    Message,
    SystemMessage,
    TextContentPart,
    ToolResponseMessage,
    UserMessage,
    WebSearchTool
)
from sqlalchemy.ext.asyncio import AsyncSession

from models.sql.presentation import PresentationModel
from services.chat.conversation_store import ChatConversationStore
from services.chat.presentation_context_store import PresentationContextStore
from services.chat.prompts import build_system_prompt
from services.chat.tools import ChatTools
from utils.llm_client_error_handler import handle_llm_client_exceptions
from utils.llm_config import get_llm_config
from utils.llm_provider import get_model
from utils.llm_utils import (
    extract_text,
    get_generate_kwargs,
    stream_generate_events,
)

LOGGER = logging.getLogger(__name__)
MAX_TOOL_ROUNDS = 16

# Per-turn wall-clock cap. The 16-round tool loop can chain LLM streaming +
# tool execution unbounded; this enforces a hard ceiling so a runaway turn
# can't silently hold the SSE connection open. Tunable via env var for ops
# escalation; defaults to 90s (Phase 9.5 plan). Tests override via env var.
CHAT_TURN_TIMEOUT_SECONDS_ENV = "CHAT_TURN_TIMEOUT_SECONDS"
DEFAULT_CHAT_TURN_TIMEOUT_SECONDS = 90.0

# Per-turn saveSlide budget. The 6th attempt is rejected as a tool-level
# error so the LLM gets the result and can recover gracefully (rather than
# breaking the whole turn). Tunable via env var.
MAX_SLIDES_PER_TURN_ENV = "CHAT_MAX_SLIDES_PER_TURN"
DEFAULT_MAX_SLIDES_PER_TURN = 5


@dataclass(frozen=True)
class ChatTurnResult:
    conversation_id: uuid.UUID
    response_text: str
    tool_calls: list[str]


ChatStreamEventType = Literal["chunk", "complete", "status", "trace", "error"]
ChatStreamEventValue = str | ChatTurnResult | dict[str, Any]


def _read_env_float(name: str, default: float) -> float:
    raw = os.getenv(name)
    if not raw:
        return default
    try:
        return float(raw)
    except (TypeError, ValueError):
        return default


def _read_env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if not raw:
        return default
    try:
        return int(raw)
    except (TypeError, ValueError):
        return default


class PresentationChatService:
    def __init__(
        self,
        sql_session: AsyncSession,
        presentation_id: uuid.UUID,
        conversation_id: uuid.UUID | None,
    ):
        self._sql_session = sql_session
        self._presentation_id = presentation_id
        self._conversation_id = conversation_id

        self._conversation_store = ChatConversationStore(sql_session)
        self._memory = PresentationContextStore(sql_session, presentation_id)
        self._tools = ChatTools(self._memory)

    async def generate_reply(self, user_message: str) -> ChatTurnResult:
        conversation_id, messages = await self._prepare_turn_context(user_message)
        response_text, tool_calls = await self._run_llm_with_tools(messages)
        return await self._persist_turn(
            conversation_id=conversation_id,
            user_message=user_message,
            response_text=response_text,
            tool_calls=tool_calls,
        )

    async def stream_reply(
        self, user_message: str
    ) -> AsyncGenerator[tuple[ChatStreamEventType, ChatStreamEventValue], None]:
        yield "status", "Reading deck context"
        conversation_id, messages = await self._prepare_turn_context(user_message)

        timeout_seconds = _read_env_float(
            CHAT_TURN_TIMEOUT_SECONDS_ENV, DEFAULT_CHAT_TURN_TIMEOUT_SECONDS
        )

        # Producer/consumer queue lets us bound the entire tool loop with a
        # single deadline (asyncio.wait_for on each queue.get() with the
        # remaining budget). A direct asyncio.wait_for around an async
        # generator wouldn't work because the generator yields incrementally.
        final_state: dict[str, Any] = {
            "response_text": None,
            "called_tools": [],
        }
        loop = asyncio.get_event_loop()
        queue: asyncio.Queue[Any] = asyncio.Queue()
        sentinel: object = object()

        async def producer() -> None:
            try:
                async for event in self._iterate_tool_loop_events(
                    messages, final_state
                ):
                    await queue.put(event)
            except BaseException as exc:  # noqa: BLE001
                await queue.put(("__exception__", exc))
            finally:
                await queue.put(sentinel)

        producer_task = asyncio.create_task(producer())
        deadline = loop.time() + timeout_seconds
        timed_out = False
        producer_exc: BaseException | None = None

        try:
            while True:
                remaining = deadline - loop.time()
                if remaining <= 0:
                    timed_out = True
                    break
                try:
                    item = await asyncio.wait_for(queue.get(), timeout=remaining)
                except asyncio.TimeoutError:
                    timed_out = True
                    break
                if item is sentinel:
                    break
                if (
                    isinstance(item, tuple)
                    and len(item) == 2
                    and item[0] == "__exception__"
                ):
                    producer_exc = item[1]
                    break
                yield item
        finally:
            if not producer_task.done():
                producer_task.cancel()
                try:
                    await producer_task
                except (asyncio.CancelledError, BaseException):
                    pass

        if producer_exc is not None:
            if isinstance(producer_exc, HTTPException):
                raise producer_exc
            raise producer_exc

        if timed_out:
            LOGGER.warning(
                "Chat turn exceeded %.1fs timeout; emitting error frame",
                timeout_seconds,
            )
            yield "error", "Chat turn exceeded 90s timeout"
            return

        response_text = final_state.get("response_text") or (
            "I could not generate a response for that request."
        )
        called_tools = final_state.get("called_tools") or []

        yield "status", "Saving chat"
        result = await self._persist_turn(
            conversation_id=conversation_id,
            user_message=user_message,
            response_text=response_text,
            tool_calls=called_tools,
        )
        yield "complete", result

    async def _iterate_tool_loop_events(
        self,
        messages: list[Message],
        final_state: dict[str, Any],
    ) -> AsyncGenerator[tuple[ChatStreamEventType, ChatStreamEventValue], None]:
        """Tool-call loop body extracted from ``stream_reply`` so the parent
        can wrap it in a wall-clock-aware producer/consumer.

        ``final_state`` is mutated to expose the final ``response_text`` and
        accumulated ``called_tools`` once the loop terminates normally.
        """

        client = get_client(config=get_llm_config())
        model = get_model()
        tools = self._tools.get_tool_definitions()
        tools.append(WebSearchTool())

        max_slides_per_turn = _read_env_int(
            MAX_SLIDES_PER_TURN_ENV, DEFAULT_MAX_SLIDES_PER_TURN
        )
        save_slide_count = 0

        called_tools: list[str] = []
        last_tool_results: list[dict[str, Any]] = []
        response_text: str | None = None

        for round_index in range(MAX_TOOL_ROUNDS):
            completion_chunk: Any | None = None
            round_content_chunks: list[str] = []
            thinking_chunks: list[str] = []

            try:
                async for event in stream_generate_events(
                    client,
                    **get_generate_kwargs(
                        model=model,
                        messages=messages,
                        tools=tools,
                        stream=True,
                    ),
                ):
                    event_type = getattr(event, "type", None)
                    if event_type == "content":
                        chunk = getattr(event, "chunk", None)
                        if chunk:
                            round_content_chunks.append(chunk)
                            yield "chunk", chunk
                    elif event_type == "thinking":
                        thinking_text = self._event_text(event)
                        if thinking_text:
                            thinking_chunks.append(thinking_text)
                    elif event_type == "completion":
                        completion_chunk = event
            except Exception as exc:
                raise handle_llm_client_exceptions(exc)

            thinking_summary = self._summarize_model_note(thinking_chunks)
            if thinking_summary:
                yield "trace", {
                    "kind": "model_note",
                    "round": round_index + 1,
                    "status": "info",
                    "message": thinking_summary,
                }

            completion_tool_calls = list(
                getattr(completion_chunk, "tool_calls", []) or []
            )
            if completion_tool_calls:
                tool_names = [tool_call.name for tool_call in completion_tool_calls]
                called_tools.extend(tool_names)
                yield "trace", {
                    "kind": "tool_plan",
                    "round": round_index + 1,
                    "tools": tool_names,
                    "message": f"Using tools: {', '.join(tool_names)}",
                }
                messages = (
                    list(getattr(completion_chunk, "messages", []) or [])
                    if getattr(completion_chunk, "messages", None)
                    else list(messages)
                )

                last_tool_results = []
                for tool_call in completion_tool_calls:
                    yield "trace", {
                        "kind": "tool_call",
                        "round": round_index + 1,
                        "tool": tool_call.name,
                        "status": "start",
                        "message": self._tool_start_message(tool_call.name),
                    }
                    is_save_slide = tool_call.name == "saveSlide"
                    if is_save_slide and save_slide_count >= max_slides_per_turn:
                        # Refuse the over-budget call as a tool-level error so
                        # the LLM keeps control of the turn and can stop or
                        # apologize, rather than the service breaking.
                        tool_result = {
                            "ok": False,
                            "tool": "saveSlide",
                            "error": (
                                "saveSlide budget exhausted: "
                                f"{max_slides_per_turn} slides per turn "
                                f"(env {MAX_SLIDES_PER_TURN_ENV}). "
                                "Stop saving more slides this turn."
                            ),
                        }
                    else:
                        if is_save_slide:
                            save_slide_count += 1
                        tool_result = await self._tools.execute_tool_call(tool_call)
                    last_tool_results.append(tool_result)
                    yield "trace", {
                        "kind": "tool_call",
                        "round": round_index + 1,
                        "tool": tool_call.name,
                        "status": "success" if tool_result.get("ok") else "error",
                        "message": self._summarize_tool_result(
                            tool_call.name, tool_result
                        ),
                    }
                    tool_response_content = json.dumps(tool_result, ensure_ascii=False)
                    messages.append(
                        ToolResponseMessage(
                            id=tool_call.id,
                            content=[TextContentPart(text=tool_response_content)],
                        )
                    )
                continue

            response_text = "".join(round_content_chunks)
            if not response_text and completion_chunk:
                response_text = extract_text(getattr(completion_chunk, "content", None))
            if not response_text:
                response_text = "I could not generate a response for that request."

            if not round_content_chunks:
                yield "chunk", response_text
            break
        else:
            LOGGER.warning("Max tool rounds reached in chat stream flow")
            yield "trace", {
                "kind": "limit",
                "message": (
                    "Reached tool-call limit before final answer; "
                    "attempting best-effort summary."
                ),
            }
            yield "status", "Finalizing response"
            response_text = await self._try_final_response_without_tools(
                client=client,
                model=model,
                messages=messages,
            )
            if not response_text:
                response_text = self._build_tool_limit_fallback(last_tool_results)
            yield "chunk", response_text

        final_state["response_text"] = (
            response_text or "I could not generate a response for that request."
        )
        final_state["called_tools"] = called_tools

    async def _prepare_turn_context(
        self, user_message: str
    ) -> tuple[uuid.UUID, list[Message]]:
        if not (user_message or "").strip():
            raise HTTPException(status_code=400, detail="Message is required")

        presentation = await self._sql_session.get(PresentationModel, self._presentation_id)
        if not presentation:
            raise HTTPException(status_code=404, detail="Presentation not found")

        conversation_id = await self._conversation_store.ensure_conversation_id(
            self._conversation_id
        )
        history = await self._conversation_store.load_history(
            presentation_id=self._presentation_id,
            conversation_id=conversation_id,
        )
        history_messages = self._convert_history_to_messages(history)

        presentation_memory = await self._memory.retrieve_context(user_message)
        chat_memory = await self._conversation_store.retrieve_semantic_context(
            presentation_id=self._presentation_id,
            conversation_id=conversation_id,
            query=user_message,
        )
        messages: list[Message] = [
            SystemMessage(
                content=build_system_prompt(
                    presentation_memory_context=presentation_memory,
                    chat_memory_context=chat_memory,
                )
            ),
            *history_messages,
            UserMessage(content=user_message),
        ]
        return conversation_id, messages

    async def _persist_turn(
        self,
        *,
        conversation_id: uuid.UUID,
        user_message: str,
        response_text: str,
        tool_calls: list[str],
    ) -> ChatTurnResult:
        await self._conversation_store.append_turn(
            presentation_id=self._presentation_id,
            conversation_id=conversation_id,
            user_message=user_message,
            assistant_message=response_text,
            tool_calls=tool_calls,
        )
        await self._sql_session.commit()

        return ChatTurnResult(
            conversation_id=conversation_id,
            response_text=response_text,
            tool_calls=tool_calls,
        )

    async def _run_llm_with_tools(self, messages: list[Message]) -> tuple[str, list[str]]:
        client = get_client(config=get_llm_config())
        model = get_model()
        tools = self._tools.get_tool_definitions()

        called_tools: list[str] = []
        last_tool_results: list[dict[str, Any]] = []

        for _ in range(MAX_TOOL_ROUNDS):
            try:
                response = await asyncio.to_thread(
                    client.generate,
                    **get_generate_kwargs(
                        model=model,
                        messages=messages,
                        tools=tools,
                    ),
                )
            except Exception as exc:
                raise handle_llm_client_exceptions(exc)

            if not response.tool_calls:
                response_text = extract_text(response.content) or (
                    "I could not generate a response for that request."
                )
                return response_text, called_tools

            called_tools.extend([tool_call.name for tool_call in response.tool_calls])
            messages = list(response.messages) if response.messages else list(messages)

            last_tool_results = []
            for tool_call in response.tool_calls:
                tool_result = await self._tools.execute_tool_call(tool_call)
                last_tool_results.append(tool_result)
                tool_response_content = json.dumps(tool_result, ensure_ascii=False)
                messages.append(
                    ToolResponseMessage(
                        id=tool_call.id,
                        content=[TextContentPart(text=tool_response_content)],
                    )
                )

        LOGGER.warning("Max tool rounds reached in chat flow")
        final_response = await self._try_final_response_without_tools(
            client=client,
            model=model,
            messages=messages,
        )
        if final_response:
            return final_response, called_tools

        return self._build_tool_limit_fallback(last_tool_results), called_tools

    async def _try_final_response_without_tools(
        self,
        *,
        client: Any,
        model: str,
        messages: list[Message],
    ) -> str | None:
        try:
            response = await asyncio.to_thread(
                client.generate,
                **get_generate_kwargs(
                    model=model,
                    messages=messages,
                ),
            )
        except Exception:
            LOGGER.warning("Final no-tool synthesis call failed", exc_info=True)
            return None

        return extract_text(response.content)

    @staticmethod
    def _summarize_model_note(chunks: list[str]) -> str:
        text = "".join(chunks).strip()
        if not text or text in {"{}", "[]"}:
            return ""

        compact = " ".join(text.split())
        if compact.lower() in {"start", "end"}:
            return ""
        if len(compact) > 600:
            return f"{compact[:600].rstrip()}..."
        return compact

    @staticmethod
    def _event_text(event: Any) -> str:
        for attr in ("chunk", "delta", "text", "content"):
            value = getattr(event, attr, None)
            if isinstance(value, str):
                return value
        return ""

    @staticmethod
    def _tool_start_message(tool_name: str) -> str:
        labels = {
            "getPresentationOutline": "Reading the presentation outline",
            "searchSlides": "Searching relevant slides",
            "getSlideAtIndex": "Opening the requested slide",
            "getAvailableLayouts": "Checking available layouts",
            "getContentSchemaFromLayoutId": "Checking the layout schema",
            "generateAssets": "Generating slide assets",
            "saveSlide": "Saving the slide",
            "deleteSlide": "Deleting the slide",
        }
        return labels.get(tool_name, f"Running {tool_name}")

    @staticmethod
    def _build_tool_limit_fallback(last_tool_results: list[dict[str, Any]]) -> str:
        for entry in reversed(last_tool_results):
            if not isinstance(entry, dict):
                continue
            if not entry.get("ok"):
                continue
            result = entry.get("result")
            if not isinstance(result, dict):
                continue
            message = result.get("message")
            if isinstance(message, str) and message.strip():
                return message.strip()

        return (
            "I completed several tool operations but could not finalize the response "
            "within the tool limit. Please ask a follow-up and I will continue."
        )

    @staticmethod
    def _summarize_tool_result(tool_name: str, tool_result: dict[str, Any]) -> str:
        if not tool_result.get("ok"):
            error = tool_result.get("error")
            if isinstance(error, str) and error.strip():
                return f"{tool_name} failed: {error.strip()}"
            return f"{tool_name} failed."

        result = tool_result.get("result")
        if isinstance(result, dict):
            message = result.get("message")
            if isinstance(message, str) and message.strip():
                return message.strip()

            note = result.get("note")
            if isinstance(note, str) and note.strip():
                return note.strip()

            count = result.get("count")
            if isinstance(count, int):
                return f"{tool_name} returned {count} result(s)."

            found = result.get("found")
            if isinstance(found, bool):
                return (
                    f"{tool_name} found requested data."
                    if found
                    else f"{tool_name} did not find matching data."
                )

        return f"{tool_name} completed."

    @staticmethod
    def _convert_history_to_messages(history: list[dict[str, str]]) -> list[Message]:
        messages: list[Message] = []
        for item in history:
            role = item.get("role")
            content = item.get("content")
            if not content:
                continue
            if role == "user":
                messages.append(UserMessage(content=content))
            elif role == "assistant":
                messages.append(AssistantMessage(content=[content]))
        return messages
