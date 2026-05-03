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


def test_openapi_operation_ids_are_unique_and_include_required_tools():
    spec = _load_openapi_spec()
    operation_ids = _collect_operation_ids(spec)

    assert operation_ids, "Expected at least one operationId in openai_spec.json"
    assert len(operation_ids) == len(set(operation_ids)), (
        "openai_spec.json contains duplicate operationIds"
    )

    expected_operation_ids = {
        "generate_campaign",
        "get_campaign_status",
        "generate_recap",
        "get_agent_profile",
        "update_agent_profile",
        "get_campaign_presets",
        "update_campaign_presets",
        "get_activity_feed",
        "get_narration_voices",
        "bulk_generate_narration",
        "narration_estimate",
    }
    missing = expected_operation_ids - set(operation_ids)
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

    missing_operation_tools = operation_ids - tool_names
    assert not missing_operation_tools, (
        "FastMCP did not register tools for operationIds: "
        f"{sorted(missing_operation_tools)}"
    )

    expected_operation_ids = {
        "generate_campaign",
        "get_campaign_status",
        "generate_recap",
        "get_agent_profile",
        "update_agent_profile",
        "get_campaign_presets",
        "update_campaign_presets",
        "get_activity_feed",
        "get_narration_voices",
        "bulk_generate_narration",
        "narration_estimate",
    }
    missing_expected_tools = expected_operation_ids - tool_names
    assert not missing_expected_tools, (
        "FastMCP missing expected tools: "
        f"{sorted(missing_expected_tools)}"
    )
