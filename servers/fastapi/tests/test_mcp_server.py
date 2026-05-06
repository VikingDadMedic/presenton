import base64
import json
import os
import uuid
from pathlib import Path
from unittest.mock import patch

import httpx
import pytest
from fastapi import FastAPI
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


def test_openapi_spec_declares_basic_auth_security_scheme():
    """Phase 11.4 — every operationId in this spec is admin-gated when
    auth is configured on the FastAPI app. The spec must declare
    `securitySchemes.basicAuth` (http/basic) and apply it as a top-level
    `security` requirement so MCP clients consuming the spec generate
    Basic-auth-aware bindings."""
    spec = _load_openapi_spec()

    components = spec.get("components") or {}
    schemes = components.get("securitySchemes") or {}
    assert "basicAuth" in schemes, (
        "openai_spec.json must declare a `basicAuth` security scheme so "
        "MCP-callable operations advertise their auth requirement"
    )
    basic = schemes["basicAuth"]
    assert basic.get("type") == "http"
    assert basic.get("scheme") == "basic"

    top_level_security = spec.get("security")
    assert isinstance(top_level_security, list) and len(top_level_security) == 1, (
        "openai_spec.json must declare a top-level `security` array with the "
        "single `basicAuth: []` requirement so every operation inherits it"
    )
    assert top_level_security[0] == {"basicAuth": []}


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


# ---------------------------------------------------------------------------
# Chat operationId auth-enforcement probe (Phase 11.0b.3)
# ---------------------------------------------------------------------------
#
# Documents the MCP loopback session-token gap. ``mcp_server.py`` registers
# tools via ``FastMCP.from_openapi`` with an ``httpx.AsyncClient`` pointed at
# the local FastAPI process. When admin auth is configured (production
# default), every request through that loopback client lacks the
# ``presenton_session`` cookie or a Basic Authorization header, so the
# ``SessionAuthMiddleware`` returns ``401 Unauthorized`` BEFORE the chat
# (or any other) operationId handler executes.
#
# The probe asserts:
#   1. Calling ``/api/v1/ppt/chat/conversations`` without auth on a
#      configured app yields ``401`` (middleware short-circuit).
#   2. Calling the same endpoint with a valid Basic Authorization header
#      lets the request reach the route handler (and therefore would let an
#      MCP tool succeed if the loopback client forwarded auth).
#
# The underlying gap (loopback session-token forwarding) is intentionally
# left unfixed here — that lives in the Phase 11.x deferred batch. This
# probe is the regression net so a future change cannot accidentally relax
# the middleware against unauthenticated MCP loopback traffic without
# anyone noticing.


@pytest.fixture
def configured_user_config(tmp_path, monkeypatch):
    """Write a valid AUTH_USERNAME / AUTH_PASSWORD_HASH / AUTH_SECRET_KEY
    to a temp userConfig.json so ``is_auth_configured()`` returns True
    for the duration of the probe.
    """
    config_path = tmp_path / "userConfig.json"
    monkeypatch.setenv("USER_CONFIG_PATH", str(config_path))

    # `setup_initial_credentials` derives a pbkdf2 hash + signing secret in
    # one call and writes them to disk; reuse rather than reproducing the
    # encoding here.
    from utils.simple_auth import setup_initial_credentials

    setup_initial_credentials("admin-probe", "probe-password-1")
    return config_path


def _build_chat_only_app() -> FastAPI:
    """Minimal FastAPI app with the SessionAuthMiddleware in front of the
    chat router. We import the router lazily because ``api.v1.ppt.endpoints
    .chat`` pulls in the SQL session machinery, which we override below.
    """
    from api.middlewares import SessionAuthMiddleware
    from api.v1.ppt.endpoints.chat import CHAT_ROUTER
    from services.database import get_async_session

    app = FastAPI()
    app.include_router(CHAT_ROUTER, prefix="/api/v1/ppt")
    app.add_middleware(SessionAuthMiddleware)

    async def _no_db():
        # Middleware enforces auth ahead of the route handler. The 401 path
        # never touches the DB; the 200 path is mocked at the
        # `list_conversations` callsite, so this stub session is never read.
        yield None

    app.dependency_overrides[get_async_session] = _no_db
    return app


@pytest.mark.asyncio
async def test_chat_operationid_returns_401_without_auth(configured_user_config):
    app = _build_chat_only_app()
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(
        transport=transport, base_url="http://testserver"
    ) as client:
        response = await client.get(
            "/api/v1/ppt/chat/conversations",
            params={"presentation_id": str(uuid.uuid4())},
        )

    assert response.status_code == 401, (
        f"Expected 401 from MCP loopback (no session cookie / Basic auth) "
        f"against a configured app; got {response.status_code}: "
        f"{response.text[:200]}. This regression would silently let MCP "
        f"tools call chat endpoints without auth."
    )


@pytest.mark.asyncio
async def test_chat_operationid_returns_200_with_basic_auth(configured_user_config):
    app = _build_chat_only_app()

    # Mock the DB read so the 200 path doesn't need a real chat_history table.
    async def _empty_conversations(*args, **kwargs):
        return []

    transport = httpx.ASGITransport(app=app)
    basic_value = base64.b64encode(b"admin-probe:probe-password-1").decode("ascii")

    with patch(
        "api.v1.ppt.endpoints.chat.sql_chat_history.list_conversations",
        new=_empty_conversations,
    ):
        async with httpx.AsyncClient(
            transport=transport, base_url="http://testserver"
        ) as client:
            response = await client.get(
                "/api/v1/ppt/chat/conversations",
                params={"presentation_id": str(uuid.uuid4())},
                headers={"Authorization": f"Basic {basic_value}"},
            )

    assert response.status_code == 200, (
        f"Expected 200 with valid Basic auth on a configured app; got "
        f"{response.status_code}: {response.text[:200]}. If this fails, the "
        f"middleware Basic-auth fallback path is regressed."
    )
    assert response.json() == [], (
        "list_conversations was patched to return []; route should pass "
        "the empty list through unchanged."
    )
