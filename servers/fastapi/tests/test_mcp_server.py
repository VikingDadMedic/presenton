import json
from pathlib import Path

import httpx
import pytest
from fastmcp import FastMCP


OPENAPI_SPEC_PATH = Path(__file__).resolve().parents[1] / "openai_spec.json"
OPERATION_METHODS = {"get", "post", "put", "patch", "delete"}


def _load_openapi_spec() -> dict:
    with OPENAPI_SPEC_PATH.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def _collect_operation_ids(spec: dict) -> list[str]:
    operation_ids: list[str] = []
    for path_item in spec.get("paths", {}).values():
        for method_name, operation in path_item.items():
            if method_name.lower() not in OPERATION_METHODS:
                continue
            operation_id = operation.get("operationId")
            if operation_id:
                operation_ids.append(operation_id)
    return operation_ids


EXPECTED_MCP_TOOL_COUNT = 27

EXPECTED_OPERATION_IDS = {
    "bulk_generate_narration",
    "delete_slide",
    "edit_slide_field",
    "export_json",
    "export_presentation",
    "generate_async",
    "generate_campaign",
    "generate_presentation",
    "generate_recap",
    "get_activity_feed",
    "get_agent_profile",
    "get_campaign_presets",
    "get_campaign_status",
    "get_chat_history",
    "get_embed_url",
    "get_enricher_status",
    "get_narration_status",
    "get_narration_voices",
    "get_presentation",
    "list_chat_conversations",
    "list_presentations",
    "narration_estimate",
    "send_chat_message",
    "stream_chat_message",
    "templates_list",
    "update_agent_profile",
    "update_campaign_presets",
}


def test_openapi_operation_ids_are_unique_and_include_required_tools():
    spec = _load_openapi_spec()
    operation_ids = _collect_operation_ids(spec)

    assert operation_ids, "Expected at least one operationId in openai_spec.json"
    assert len(operation_ids) == len(set(operation_ids)), (
        "openai_spec.json contains duplicate operationIds"
    )
    assert len(operation_ids) == EXPECTED_MCP_TOOL_COUNT, (
        f"Expected {EXPECTED_MCP_TOOL_COUNT} operationIds in openai_spec.json "
        f"but found {len(operation_ids)}: {sorted(operation_ids)}"
    )

    missing = EXPECTED_OPERATION_IDS - set(operation_ids)
    assert not missing, f"Missing expected operationIds in OpenAPI spec: {sorted(missing)}"


@pytest.mark.asyncio
async def test_fastmcp_registers_expected_openapi_tools():
    spec = _load_openapi_spec()
    operation_ids = set(_collect_operation_ids(spec))

    client = httpx.AsyncClient(base_url="http://127.0.0.1:8000", timeout=60.0)
    try:
        mcp = FastMCP.from_openapi(
            openapi_spec=spec,
            client=client,
            name="TripStory Test MCP",
        )
        tools = await mcp.list_tools(run_middleware=False)
    finally:
        await client.aclose()

    tool_names = {tool.name for tool in tools}
    assert tool_names, "Expected FastMCP to register at least one tool"

    assert len(tool_names) == EXPECTED_MCP_TOOL_COUNT, (
        f"Expected FastMCP to register {EXPECTED_MCP_TOOL_COUNT} tools "
        f"but registered {len(tool_names)}: {sorted(tool_names)}"
    )

    missing_operation_tools = operation_ids - tool_names
    assert not missing_operation_tools, (
        "FastMCP did not register tools for operationIds: "
        f"{sorted(missing_operation_tools)}"
    )

    missing_expected_tools = EXPECTED_OPERATION_IDS - tool_names
    assert not missing_expected_tools, (
        "FastMCP missing expected tools: "
        f"{sorted(missing_expected_tools)}"
    )
