"""Phase 11.0c.2 /health version-pinning tests.

Two paths covered:
- /health now returns `image_sha` + `alembic_head` alongside `status: ok`.
- IMAGE_SHA env var falls back to "unknown" when unset (legacy / dev images).
- Alembic head detection short-circuits to "unknown" if alembic.ini is
  unavailable, ensuring /health never 500s on a corrupt migrations tree.
"""

from __future__ import annotations

from unittest.mock import patch

from fastapi.testclient import TestClient


def test_health_endpoint_returns_image_sha_and_alembic_head():
    # Module-level constants are captured at import time, so we patch at the
    # api.main namespace where /health reads them rather than monkeypatching
    # os.environ post-import (which would not take effect).
    import api.main as api_main

    with patch.object(api_main, "_HEALTH_IMAGE_SHA", "deadbeef1234567890abc"):
        with patch.object(
            api_main, "_HEALTH_ALEMBIC_HEAD", "c7b70d0f31b1"
        ):
            client = TestClient(api_main.app, raise_server_exceptions=False)
            response = client.get("/health")

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["image_sha"] == "deadbeef1234567890abc"
    assert payload["alembic_head"] == "c7b70d0f31b1"


def test_health_endpoint_falls_back_to_unknown_image_sha():
    """Pre-Phase-11.0c.2 images / dev runs without --build-arg should still
    answer health checks, just with image_sha=unknown."""
    import api.main as api_main

    with patch.object(api_main, "_HEALTH_IMAGE_SHA", "unknown"):
        client = TestClient(api_main.app, raise_server_exceptions=False)
        response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["image_sha"] == "unknown"


def test_detect_alembic_head_returns_string_or_unknown():
    """Smoke test on the actual migration tree shipped in this repo. We
    don't pin the exact head SHA here because that would force this test
    to be updated every alembic migration; instead we assert the contract
    (returns a non-empty string)."""
    import api.main as api_main

    head = api_main._detect_alembic_head()
    assert isinstance(head, str)
    assert head, "head must be a non-empty string"
    # Real heads are 12-char hex revisions like c7b70d0f31b1; "unknown" is
    # the documented fallback. Anything else would indicate the alembic
    # discovery contract regressed.
    assert head == "unknown" or len(head) == 12, (
        f"Expected 12-char alembic revision or 'unknown', got: {head!r}"
    )


def test_detect_alembic_head_returns_unknown_on_alembic_failure():
    """Verifies the try/except graceful-degradation path so /health never
    500s if the alembic tree is missing or malformed.
    """
    import api.main as api_main

    # Patch the alembic.config import inside the function body to raise.
    with patch("alembic.config.Config", side_effect=RuntimeError("simulated")):
        head = api_main._detect_alembic_head()

    assert head == "unknown"


def test_detect_alembic_head_returns_unknown_when_ini_missing():
    """If alembic.ini doesn't exist (e.g., installed package layout strips
    it), /health should still answer.
    """
    import api.main as api_main

    with patch("os.path.isfile", return_value=False):
        head = api_main._detect_alembic_head()

    assert head == "unknown"
