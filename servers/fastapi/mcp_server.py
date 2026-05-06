import argparse
import asyncio
import base64
import json
import os
import sys
import traceback
from typing import Iterator, Optional

import httpx
from fastmcp import FastMCP
from fastmcp.server.dependencies import get_http_headers

with open("openai_spec.json", "r") as f:
    openapi_spec = json.load(f)


# ---------------------------------------------------------------------------
# Phase 11.4 — MCP loopback auth-forwarding shim
# ---------------------------------------------------------------------------
#
# Background: ``mcp_server.py`` registers FastMCP tools via
# ``FastMCP.from_openapi`` and points an inner ``httpx.AsyncClient`` at the
# loopback FastAPI process. When admin auth is configured (production
# default) every loopback request without auth credentials returns 401
# from ``SessionAuthMiddleware`` BEFORE the operationId handler runs.
#
# Closing the gap: the inbound MCP request usually carries an
# ``Authorization`` header (the MCP transport layer relays it). FastMCP
# exposes ``fastmcp.server.dependencies.get_http_headers`` which reads
# from a contextvar populated for every active HTTP request. We wrap the
# loopback client with a custom ``httpx.Auth`` subclass that opts the
# Authorization header back in (FastMCP's helper strips it by default to
# avoid accidental forwarding) and re-applies it on every outbound
# loopback call.
#
# Service-to-service fallback: if no inbound auth is available (for
# example during background tasks or smoke probes that run MCP without
# a real client session), the shim falls back to
# ``MCP_LOOPBACK_AUTH=basic:<user>:<pass>``. This env var is OPTIONAL —
# leaving it unset preserves the prior behavior (no auth forwarded) and
# the loopback call simply fails closed at the middleware.

_FALLBACK_AUTH_ENV = "MCP_LOOPBACK_AUTH"


def _build_fallback_basic_header() -> Optional[str]:
    """Parse the optional ``MCP_LOOPBACK_AUTH=basic:<user>:<pass>`` env var
    into a fully-formed ``Authorization: Basic <b64>`` header value.

    Returns None when the env var is unset, malformed, or doesn't start
    with the ``basic:`` scheme prefix. Reserved scheme prefixes other than
    ``basic:`` are intentionally not implemented here — adding them is a
    follow-up if/when production needs (e.g. bearer-token service auth).
    """
    raw = os.environ.get(_FALLBACK_AUTH_ENV, "").strip()
    if not raw:
        return None
    if not raw.lower().startswith("basic:"):
        return None
    credential = raw.split(":", 1)[1]
    # The credential portion must contain at least one ':' to split into
    # user and pass — `basic:` followed by `user:pass`.
    if ":" not in credential:
        return None
    encoded = base64.b64encode(credential.encode("utf-8")).decode("ascii")
    return f"Basic {encoded}"


class MCPLoopbackAuth(httpx.Auth):
    """httpx.Auth subclass that forwards the Authorization header from the
    inbound FastMCP request context to the outbound loopback FastAPI call.

    Resolution order (first match wins):
      1. Authorization header ALREADY set on the outbound request (caller
         opted to override; respect it).
      2. Authorization header on the inbound MCP request (the canonical
         path — the MCP client authenticates once, the loopback inherits).
      3. ``MCP_LOOPBACK_AUTH`` env-var fallback (service-to-service mode
         for smoke probes and background tasks).
      4. No header (loopback request goes through unauthenticated; the
         FastAPI ``SessionAuthMiddleware`` will 401 it on a configured
         deployment — fail-closed by design).
    """

    def __init__(self, fallback_basic_header: Optional[str] = None) -> None:
        self._fallback_basic_header = fallback_basic_header

    def auth_flow(
        self, request: httpx.Request
    ) -> Iterator[httpx.Request]:
        existing = request.headers.get("authorization") or request.headers.get(
            "Authorization"
        )
        if not existing:
            forwarded = self._resolve_inbound_authorization()
            if not forwarded and self._fallback_basic_header:
                forwarded = self._fallback_basic_header
            if forwarded:
                request.headers["authorization"] = forwarded
        yield request

    @staticmethod
    def _resolve_inbound_authorization() -> Optional[str]:
        """Read the inbound MCP request's Authorization header, if any.

        FastMCP's ``get_http_headers`` strips ``authorization`` by default
        (it considers cross-server forwarding a footgun). We opt back in
        via the ``include`` parameter because in our case the loopback
        target IS the same FastAPI process that originated the inbound
        request — same trust boundary, no exfiltration risk.

        Never raises; returns None when no active HTTP request is in
        scope (e.g. during MCP startup or non-HTTP transports).
        """
        try:
            headers = get_http_headers(include={"authorization"})
        except Exception:
            return None
        if not headers:
            return None
        # ``get_http_headers`` lower-cases the keys (per FastMCP's contract).
        return headers.get("authorization")


def build_loopback_client(
    base_url: str = "http://127.0.0.1:8000", timeout: float = 60.0
) -> httpx.AsyncClient:
    """Construct the FastAPI-loopback httpx client used by FastMCP tools.

    Hoisted out of ``main`` so tests can build the client with the real
    auth shim wired in and exercise the auth-flow contract end-to-end.
    """
    fallback = _build_fallback_basic_header()
    auth = MCPLoopbackAuth(fallback_basic_header=fallback)
    return httpx.AsyncClient(base_url=base_url, timeout=timeout, auth=auth)


async def main() -> None:
    try:
        print("DEBUG: MCP (OpenAPI) Server startup initiated")
        parser = argparse.ArgumentParser(
            description="Run the MCP server (from OpenAPI)"
        )
        parser.add_argument(
            "--port", type=int, default=8001, help="Port for the MCP HTTP server"
        )

        parser.add_argument(
            "--name",
            type=str,
            default="TripStory API (OpenAPI)",
            help="Display name for the generated MCP server",
        )
        args = parser.parse_args()
        print(f"DEBUG: Parsed args - port={args.port}")

        api_client = build_loopback_client()
        if api_client.auth is not None:
            print(
                "DEBUG: Loopback httpx client wired with MCPLoopbackAuth "
                f"(fallback={'configured' if os.environ.get(_FALLBACK_AUTH_ENV) else 'unset'})"
            )

        print("DEBUG: Creating FastMCP server from OpenAPI spec...")
        mcp = FastMCP.from_openapi(
            openapi_spec=openapi_spec,
            client=api_client,
            name=args.name,
        )
        print("DEBUG: MCP server created from OpenAPI successfully")

        uvicorn_config = {"reload": True}
        print(f"DEBUG: Starting MCP server on host=127.0.0.1, port={args.port}")
        await mcp.run_async(
            transport="http",
            host="127.0.0.1",
            port=args.port,
            uvicorn_config=uvicorn_config,
        )
        print("DEBUG: MCP server run_async completed")
    except Exception as e:
        print(f"ERROR: MCP server startup failed: {e}")
        print(f"ERROR: Traceback: {traceback.format_exc()}")
        raise


if __name__ == "__main__":
    print("DEBUG: Starting MCP (OpenAPI) main function")
    try:
        asyncio.run(main())
    except Exception as e:
        print(f"FATAL ERROR: {e}")
        print(f"FATAL TRACEBACK: {traceback.format_exc()}")
        sys.exit(1)
