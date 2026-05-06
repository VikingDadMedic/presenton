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


# ---------------------------------------------------------------------------
# Phase 11.4 — MCP loopback Authorization-header forwarding shim
# ---------------------------------------------------------------------------
#
# The `MCPLoopbackAuth` httpx.Auth subclass in `mcp_server.py` resolves the
# Authorization header in this order: (1) header already on the outbound
# request, (2) inbound MCP request via FastMCP `get_http_headers`, (3)
# `MCP_LOOPBACK_AUTH=basic:user:pass` env-var fallback, (4) no header.
# These tests exercise each branch in isolation so the shim's behavior is
# regression-locked even if the FastMCP request-context API moves.

import sys as _sys  # noqa: E402  (kept after asyncio_async tests above)
from pathlib import Path as _Path  # noqa: E402

_FASTAPI_ROOT = _Path(__file__).resolve().parents[1]
if str(_FASTAPI_ROOT) not in _sys.path:
    _sys.path.insert(0, str(_FASTAPI_ROOT))

from mcp_server import (  # noqa: E402
    MCPLoopbackAuth,
    _build_fallback_basic_header,
    build_loopback_client,
)


def _exercise_auth_flow(auth: MCPLoopbackAuth, request: httpx.Request) -> httpx.Request:
    """Drive an httpx.Auth subclass through one auth_flow iteration so we
    can inspect the mutated request without spinning a real client."""
    iterator = auth.auth_flow(request)
    return next(iterator)


def test_mcp_loopback_forwards_inbound_authorization_header():
    """When the inbound MCP request carries an Authorization header, the
    shim must forward it onto the outbound loopback request."""
    auth = MCPLoopbackAuth(fallback_basic_header=None)
    request = httpx.Request("GET", "http://127.0.0.1:8000/api/v1/ppt/templates/list")

    inbound_value = "Basic " + base64.b64encode(b"admin:s3cret").decode("ascii")
    with patch(
        "mcp_server.get_http_headers",
        return_value={"authorization": inbound_value},
    ):
        forwarded = _exercise_auth_flow(auth, request)

    assert forwarded.headers.get("authorization") == inbound_value, (
        "Loopback request must inherit the inbound MCP Authorization header"
    )


def test_mcp_loopback_falls_back_to_env_var_when_inbound_auth_missing(monkeypatch):
    """When no inbound auth is available (background tasks / smoke probes
    without a logged-in MCP client), the shim must fall back to the
    pre-configured Basic header derived from MCP_LOOPBACK_AUTH."""
    monkeypatch.setenv("MCP_LOOPBACK_AUTH", "basic:smoke-bot:smoke-pass-1")
    fallback = _build_fallback_basic_header()
    assert fallback is not None
    expected_b64 = base64.b64encode(b"smoke-bot:smoke-pass-1").decode("ascii")
    assert fallback == f"Basic {expected_b64}"

    auth = MCPLoopbackAuth(fallback_basic_header=fallback)
    request = httpx.Request("GET", "http://127.0.0.1:8000/api/v1/ppt/templates/list")

    with patch("mcp_server.get_http_headers", return_value={}):
        forwarded = _exercise_auth_flow(auth, request)

    assert forwarded.headers.get("authorization") == fallback


def test_mcp_loopback_no_auth_when_no_inbound_and_no_fallback():
    """Fail-closed by design: when there's neither inbound auth nor a
    configured fallback, the loopback request must NOT carry a fabricated
    Authorization header — the FastAPI middleware will 401 it on a
    configured deployment, which is the correct behavior."""
    auth = MCPLoopbackAuth(fallback_basic_header=None)
    request = httpx.Request("GET", "http://127.0.0.1:8000/api/v1/ppt/templates/list")

    with patch("mcp_server.get_http_headers", return_value={}):
        forwarded = _exercise_auth_flow(auth, request)

    assert forwarded.headers.get("authorization") is None
    assert forwarded.headers.get("Authorization") is None


def test_mcp_loopback_does_not_override_existing_authorization():
    """If the caller already set Authorization on the outbound request
    (unusual but possible during testing or future bearer-token paths),
    the shim must respect it rather than silently overwriting."""
    auth = MCPLoopbackAuth(fallback_basic_header="Basic FALLBACK_VAL")
    pre_set = "Bearer caller-set-token"
    request = httpx.Request(
        "GET",
        "http://127.0.0.1:8000/api/v1/ppt/templates/list",
        headers={"Authorization": pre_set},
    )

    with patch(
        "mcp_server.get_http_headers",
        return_value={"authorization": "Basic INBOUND_VAL"},
    ):
        forwarded = _exercise_auth_flow(auth, request)

    assert forwarded.headers.get("authorization") == pre_set, (
        "Pre-set Authorization on the outbound request must survive the "
        "auth-flow shim — caller wins"
    )


def test_mcp_loopback_fallback_parser_handles_malformed_env(monkeypatch):
    """The MCP_LOOPBACK_AUTH parser must be defensive: missing env, wrong
    scheme, or malformed `basic:` payload all return None (so the shim
    falls through to the no-header path rather than raising at startup)."""
    for value in [
        "",
        "   ",
        "bearer:token-123",  # wrong scheme
        "basic:no-colon",  # no `user:pass` separator
        "BASIC:CASE-INSENSITIVE-OK:passes-anyway",  # case-insensitive scheme
    ]:
        monkeypatch.setenv("MCP_LOOPBACK_AUTH", value)
        result = _build_fallback_basic_header()
        if value.lower().startswith("basic:") and ":" in value.split(":", 1)[1]:
            # The case-insensitive case is the only one that should produce
            # a header; assert it's correctly base64-encoded.
            credential = value.split(":", 1)[1]
            expected = "Basic " + base64.b64encode(
                credential.encode("utf-8")
            ).decode("ascii")
            assert result == expected
        else:
            assert result is None, (
                f"Malformed MCP_LOOPBACK_AUTH={value!r} must return None, "
                f"got {result!r}"
            )


def test_build_loopback_client_returns_httpx_async_client_with_auth():
    """The exported `build_loopback_client` factory must wire the auth
    shim onto the httpx.AsyncClient so a fresh import path is functional
    end-to-end. Smoke check rather than behavioral test."""
    client = build_loopback_client()
    try:
        assert isinstance(client, httpx.AsyncClient)
        assert client.auth is not None
        # httpx wraps httpx.Auth-derived objects in a `_auth` attribute on
        # the client; the public `client.auth` returns the configured Auth.
        # We just verify the type to catch a regression that would
        # accidentally drop the auth (e.g. None-passthrough).
        assert isinstance(client.auth, MCPLoopbackAuth)
    finally:
        # Suppress aclose() warning by closing the wrapped transport.
        # asyncio.run(client.aclose()) would create a fresh loop; instead
        # we let the GC reclaim it — this is a unit test, not a runtime.
        pass
