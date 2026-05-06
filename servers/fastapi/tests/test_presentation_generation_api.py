"""Tests for the /generate endpoint's input validation."""
import asyncio
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from fastapi import FastAPI
from pydantic import ValidationError

from api.v1.ppt.endpoints.presentation import PRESENTATION_ROUTER, generate_presentation_sync
from models.generate_presentation_request import GeneratePresentationRequest
from models.presentation_and_path import PresentationPathAndEditPath
from services.database import get_async_session
from utils.llm_calls.generate_slide_content import (
    get_messages as get_slide_content_messages,
    get_system_prompt as get_slide_content_system_prompt,
    get_user_prompt as get_slide_content_user_prompt,
)


class FakeAsyncSession:
    async def get(self, *_args, **_kwargs):
        return None

    def add(self, *_args, **_kwargs):
        return None

    def add_all(self, *_args, **_kwargs):
        return None

    async def commit(self):
        return None


@pytest.fixture
def app():
    app = FastAPI()
    app.include_router(PRESENTATION_ROUTER, prefix="/api/v1/ppt")

    mock_session = AsyncMock()
    mock_session.get = AsyncMock(return_value=None)
    mock_session.add = MagicMock()
    mock_session.commit = AsyncMock()
    mock_session.execute = AsyncMock()

    async def override_session():
        yield mock_session

    app.dependency_overrides[get_async_session] = override_session
    return app


@pytest.fixture
def client(app):
    return TestClient(app, raise_server_exceptions=False)


class TestPresentationGenerationAPI:
    def test_generate_presentation_export_as_pdf(self):
        request = GeneratePresentationRequest(
            content="Create a presentation about artificial intelligence and machine learning",
            n_slides=5,
            language="English",
            export_as="pdf",
            template="general",
        )
        response_payload = PresentationPathAndEditPath(
            presentation_id=uuid.uuid4(),
            path="/tmp/exports/test.pdf",
            edit_path="/presentation?id=test",
        )

        with patch(
            "api.v1.ppt.endpoints.presentation.generate_presentation_handler",
            new=AsyncMock(return_value=response_payload),
        ) as mock_handler:
            response = asyncio.run(
                generate_presentation_sync(request, sql_session=FakeAsyncSession())
            )

        assert response == response_payload
        mock_handler.assert_awaited_once()

    def test_generate_presentation_export_as_pptx(self):
        request = GeneratePresentationRequest(
            content="Create a presentation about artificial intelligence and machine learning",
            n_slides=5,
            language="English",
            export_as="pptx",
            template="general",
        )
        response_payload = PresentationPathAndEditPath(
            presentation_id=uuid.uuid4(),
            path="/tmp/exports/test.pptx",
            edit_path="/presentation?id=test",
        )

        with patch(
            "api.v1.ppt.endpoints.presentation.generate_presentation_handler",
            new=AsyncMock(return_value=response_payload),
        ) as mock_handler:
            response = asyncio.run(
                generate_presentation_sync(request, sql_session=FakeAsyncSession())
            )

        assert response == response_payload
        mock_handler.assert_awaited_once()

    def test_generate_presentation_with_no_content(self, client):
        response = client.post(
            "/api/v1/ppt/presentation/generate",
            json={
                "n_slides": 5,
                "language": "English",
                "export_as": "pdf",
                "template": "general",
            },
        )
        assert response.status_code == 422

    def test_generate_presentation_with_n_slides_less_than_one(self, client):
        response = client.post(
            "/api/v1/ppt/presentation/generate",
            json={
                "content": "Create a presentation about AI",
                "n_slides": 0,
                "language": "English",
                "export_as": "pdf",
                "template": "general",
            },
        )
        assert response.status_code in (400, 422, 500)

    def test_generate_presentation_with_invalid_export_type(self, client):
        response = client.post(
            "/api/v1/ppt/presentation/generate",
            json={
                "content": "Create a presentation about AI",
                "n_slides": 5,
                "language": "English",
                "export_as": "invalid_type",
                "template": "general",
            },
        )
        assert response.status_code == 422

    def test_generate_presentation_with_invalid_template(self, client):
        response = client.post(
            "/api/v1/ppt/presentation/generate",
            json={
                "content": "Create a presentation about AI",
                "n_slides": 5,
                "language": "English",
                "export_as": "pptx",
                "template": "nonexistent",
            },
        )
        assert response.status_code in (400, 500)

    def test_recap_endpoint_requires_source(self, client):
        response = client.post(
            "/api/v1/ppt/presentation/recap",
            json={
                "mode": "welcome_home",
            },
        )
        assert response.status_code == 422
        assert "source_presentation_id" in response.text or "source_json" in response.text

    def test_recap_endpoint_applies_anniversary_defaults(self, client):
        recap_presentation_id = uuid.uuid4()
        response_payload = PresentationPathAndEditPath(
            presentation_id=recap_presentation_id,
            path="/tmp/exports/recap.pptx",
            edit_path=f"/presentation?id={recap_presentation_id}",
        )

        with patch(
            "api.v1.ppt.endpoints.presentation.check_if_api_request_is_valid",
            new=AsyncMock(return_value=(recap_presentation_id,)),
        ), patch(
            "api.v1.ppt.endpoints.presentation.generate_presentation_handler",
            new=AsyncMock(return_value=response_payload),
        ) as mock_handler:
            response = client.post(
                "/api/v1/ppt/presentation/recap",
                json={
                    "mode": "anniversary",
                    "source_json": {
                        "title": "Iceland Winter Escape",
                        "slides": [{"title": "Blue Lagoon"}],
                    },
                },
            )

        assert response.status_code == 200
        called_request = mock_handler.await_args.args[0]
        assert called_request.narration_tone == "hype_reel"
        assert "anniversary" in (called_request.instructions or "").lower()
        assert "source context" in called_request.content.lower()
        response_json = response.json()
        assert response_json["mode"] == "anniversary"
        assert response_json["presentation_id"] == str(recap_presentation_id)

    def test_recap_endpoint_applies_welcome_home_defaults(self, client):
        recap_presentation_id = uuid.uuid4()
        response_payload = PresentationPathAndEditPath(
            presentation_id=recap_presentation_id,
            path="/tmp/exports/recap-welcome.pptx",
            edit_path=f"/presentation?id={recap_presentation_id}",
        )

        with patch(
            "api.v1.ppt.endpoints.presentation.check_if_api_request_is_valid",
            new=AsyncMock(return_value=(recap_presentation_id,)),
        ), patch(
            "api.v1.ppt.endpoints.presentation.generate_presentation_handler",
            new=AsyncMock(return_value=response_payload),
        ) as mock_handler:
            response = client.post(
                "/api/v1/ppt/presentation/recap",
                json={
                    "mode": "welcome_home",
                    "source_json": {"title": "Italian Summer Escape"},
                },
            )

        assert response.status_code == 200
        called_request = mock_handler.await_args.args[0]
        assert called_request.narration_tone == "documentary"
        assert "welcome-home" in (called_request.instructions or "").lower()
        assert "source context" in called_request.content.lower()

    def test_recap_endpoint_applies_next_planning_window_defaults(self, client):
        recap_presentation_id = uuid.uuid4()
        response_payload = PresentationPathAndEditPath(
            presentation_id=recap_presentation_id,
            path="/tmp/exports/recap-next.pptx",
            edit_path=f"/presentation?id={recap_presentation_id}",
        )

        with patch(
            "api.v1.ppt.endpoints.presentation.check_if_api_request_is_valid",
            new=AsyncMock(return_value=(recap_presentation_id,)),
        ), patch(
            "api.v1.ppt.endpoints.presentation.generate_presentation_handler",
            new=AsyncMock(return_value=response_payload),
        ) as mock_handler:
            response = client.post(
                "/api/v1/ppt/presentation/recap",
                json={
                    "mode": "next_planning_window",
                    "source_json": {"title": "Greek Island Hopper"},
                },
            )

        assert response.status_code == 200
        called_request = mock_handler.await_args.args[0]
        assert called_request.narration_tone == "travel_companion"
        assert "next planning window" in (called_request.instructions or "").lower()
        assert "source context" in called_request.content.lower()

    # ----- main-workflow.md Section 6 issue E (RESOLVED) -----
    # Issue E was: enriched_context lived in the USER prompt for Call 1
    # (generate_presentation_outlines) but the SYSTEM prompt for Call 3
    # (generate_slide_content), via a caller-side concatenation
    # `instructions = instructions + enriched_context` in /stream and /generate.
    # Resolution: enriched_context now flows through Call 3's USER prompt
    # under a "Verified Context" section. The caller passes it as a separate
    # kwarg and never splices it into instructions. These tests guard that
    # contract so the canonical site doesn't drift again.

    def test_call3_user_prompt_carries_enriched_context_block(self):
        prompt = get_slide_content_user_prompt(
            outline="Day 1: Kyoto temple walk",
            language="English",
            previous_slide_title="Welcome",
            next_slide_title="Day 2",
            presentation_synopsis="A Kyoto cultural week",
            enriched_context="HOTEL_RATE: $280/night. FLIGHT: NRT->KIX 90min.",
        )
        assert "Verified Context" in prompt
        assert "HOTEL_RATE: $280/night" in prompt
        assert "FLIGHT: NRT->KIX 90min" in prompt

    def test_call3_user_prompt_omits_block_when_no_enriched_context(self):
        prompt = get_slide_content_user_prompt(
            outline="Generic outline",
            language="English",
        )
        assert "Verified Context" not in prompt

    def test_call3_system_prompt_does_not_contain_enriched_context(self):
        # The enriched_context payload should NEVER reach the system prompt.
        # If a future caller regresses by splicing enriched_context into
        # `instructions`, this guard does not fire (system prompt would
        # legitimately contain instructions text). It DOES catch the bug
        # we're fixing today: get_system_prompt has no enriched_context
        # parameter, and instructions stays user-supplied only.
        system_prompt = get_slide_content_system_prompt(
            tone="luxury",
            verbosity="standard",
            instructions="Speak in present tense.",
            response_schema={"type": "object"},
            template="travel-itinerary",
        )
        assert "Verified Context" not in system_prompt

    def test_call3_get_messages_routes_enriched_context_to_user_message_only(self):
        messages = get_slide_content_messages(
            outline="Day 3 in Lisbon",
            language="English",
            tone="adventurous",
            verbosity="standard",
            instructions="Keep voice conversational.",
            response_schema={"type": "object"},
            template="travel-itinerary",
            previous_slide_title="Day 2 in Lisbon",
            next_slide_title="Day 4 in Lisbon",
            presentation_synopsis="A 5-day Lisbon trip",
            tone_preset="travel_companion",
            enriched_context="LISBON_VISA: 90-day Schengen. CURRENCY: EUR.",
        )
        assert len(messages) == 2
        system_message, user_message = messages
        # Each LLM message has a `content` attribute carrying the rendered text.
        system_text = getattr(system_message, "content", "") or ""
        user_text = getattr(user_message, "content", "") or ""
        assert "LISBON_VISA" not in system_text, (
            "enriched_context must NOT appear in the system prompt"
        )
        assert "LISBON_VISA" in user_text, (
            "enriched_context must appear in the user prompt under Verified Context"
        )
        # User instructions still flow through the system prompt — they're
        # not enriched data.
        assert "Keep voice conversational." in system_text

    def test_recap_endpoint_source_presentation_id_uses_db_context(self, client):
        source_presentation_id = uuid.uuid4()
        recap_presentation_id = uuid.uuid4()
        response_payload = PresentationPathAndEditPath(
            presentation_id=recap_presentation_id,
            path="/tmp/exports/recap-source-id.pptx",
            edit_path=f"/presentation?id={recap_presentation_id}",
        )
        source_presentation = SimpleNamespace(
            id=source_presentation_id,
            title="Iceland Winter Escape",
            content="A memory-forward recap",
            language="English",
            layout={"name": "travel-itinerary"},
            n_slides=2,
            origin="JFK",
            currency="USD",
            enriched_data={"destination": "Iceland"},
        )
        source_slide = SimpleNamespace(
            index=0,
            layout="travel-destination-hero",
            layout_group="travel",
            content={"title": "Blue Lagoon"},
            speaker_note="Relaxing lagoon stop",
        )
        generated_presentation = SimpleNamespace(
            narration_tone=None,
            narration_voice_id=None,
        )

        mock_session = AsyncMock()

        async def _session_get(_model, item_id):
            if item_id == source_presentation_id:
                return source_presentation
            if item_id == recap_presentation_id:
                return generated_presentation
            return None

        mock_session.get = AsyncMock(side_effect=_session_get)
        mock_session.scalars = AsyncMock(return_value=[source_slide])
        mock_session.add = MagicMock()
        mock_session.commit = AsyncMock()
        mock_session.execute = AsyncMock()

        async def override_session():
            yield mock_session

        previous_override = client.app.dependency_overrides.get(get_async_session)
        client.app.dependency_overrides[get_async_session] = override_session

        try:
            with patch(
                "api.v1.ppt.endpoints.presentation.check_if_api_request_is_valid",
                new=AsyncMock(return_value=(recap_presentation_id,)),
            ), patch(
                "api.v1.ppt.endpoints.presentation.generate_presentation_handler",
                new=AsyncMock(return_value=response_payload),
            ) as mock_handler:
                response = client.post(
                    "/api/v1/ppt/presentation/recap",
                    json={
                        "mode": "welcome_home",
                        "source_presentation_id": str(source_presentation_id),
                    },
                )
        finally:
            if previous_override is None:
                client.app.dependency_overrides.pop(get_async_session, None)
            else:
                client.app.dependency_overrides[get_async_session] = previous_override

        assert response.status_code == 200
        called_request = mock_handler.await_args.args[0]
        assert "source_presentation" in called_request.content
        assert "Iceland Winter Escape" in called_request.content
        assert called_request.language == "English"
        assert called_request.origin == "JFK"
        assert called_request.currency == "USD"
        assert generated_presentation.narration_tone == called_request.narration_tone
        assert response.json()["source_presentation_id"] == str(source_presentation_id)
