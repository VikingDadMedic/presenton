"""
Phase 11.2b — recap_mode column tests.

Five tests:
1. Migration applies clean on a fresh DB (no prior alembic state).
2. Migration applies clean on an existing DB stamped at the previous head
   c7b70d0f31b1 (the chat_history_messages migration).
3. The recap endpoint sets `presentation.recap_mode = request.mode.value`
   on the generated presentation row.
4. The activity feed prefers `recap_mode` column when populating recap rows.
5. The activity feed falls back to substring matching when `recap_mode` is
   NULL (legacy pre-migration rows).
"""
from __future__ import annotations

import asyncio
import os
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from alembic import command
from alembic.config import Config
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect

# Ensure servers/fastapi is on sys.path so endpoint + model imports resolve
# the same way pytest does when run from servers/fastapi as cwd.
_FASTAPI_DIR = Path(__file__).resolve().parents[1]
if str(_FASTAPI_DIR) not in sys.path:
    sys.path.insert(0, str(_FASTAPI_DIR))

from api.v1.ppt.endpoints.activity import ACTIVITY_ROUTER
from api.v1.ppt.endpoints.presentation import (
    PRESENTATION_ROUTER,
    RecapPresentationRequest,
    _generate_single_recap,
)
from models.presentation_and_path import PresentationPathAndEditPath
from services.database import get_async_session


# Anchor the alembic dir relative to this test file so the test works
# regardless of pytest invocation cwd.
_ALEMBIC_DIR = _FASTAPI_DIR / "alembic"


def _make_alembic_config(db_url: str) -> Config:
    config = Config()
    config.set_main_option("script_location", str(_ALEMBIC_DIR))
    config.set_main_option("sqlalchemy.url", db_url)
    return config


# -----------------------------------------------------------------------
# Migration tests (1, 2)
# -----------------------------------------------------------------------


def test_migration_applies_clean_on_fresh_db(tmp_path):
    """
    Upgrade head from scratch on an empty SQLite DB. Verifies the new
    e2b1f4d9a6c3 revision applies without conflicts and produces the
    expected `presentations.recap_mode` column shape (VARCHAR(32), nullable).
    """
    db_path = tmp_path / "migration_fresh.db"
    db_url = f"sqlite:///{db_path}"
    config = _make_alembic_config(db_url)
    command.upgrade(config, "head")

    engine = create_engine(db_url)
    try:
        inspector = inspect(engine)
        cols = inspector.get_columns("presentations")
        recap_mode_cols = [c for c in cols if c["name"] == "recap_mode"]
        assert len(recap_mode_cols) == 1, "recap_mode column missing after upgrade head"
        recap_mode_col = recap_mode_cols[0]
        assert recap_mode_col["nullable"] is True, "recap_mode must be nullable"
        # SQLAlchemy reports VARCHAR types as `VARCHAR(32)` or `String(length=32)`.
        type_repr = repr(recap_mode_col["type"]).upper()
        assert "32" in type_repr, (
            f"recap_mode should be a 32-char string column; got type={type_repr!r}"
        )
    finally:
        engine.dispose()


def test_migration_applies_clean_on_existing_db_at_c7b70d0f31b1(tmp_path):
    """
    Stamp at c7b70d0f31b1 (the chat_history_messages migration; was the
    head before Phase 11.2b), confirm `recap_mode` column is NOT yet
    present, then upgrade head and confirm the column was added without
    re-running prior migrations.
    """
    db_path = tmp_path / "migration_at_prior_head.db"
    db_url = f"sqlite:///{db_path}"
    config = _make_alembic_config(db_url)

    # Step 1: bring DB up to the previous head c7b70d0f31b1.
    command.upgrade(config, "c7b70d0f31b1")

    engine = create_engine(db_url)
    try:
        inspector = inspect(engine)
        cols_before = {c["name"] for c in inspector.get_columns("presentations")}
        assert "recap_mode" not in cols_before, (
            "recap_mode should not exist at revision c7b70d0f31b1"
        )
    finally:
        engine.dispose()

    # Step 2: upgrade head — should add recap_mode without touching prior tables.
    command.upgrade(config, "head")

    engine = create_engine(db_url)
    try:
        inspector = inspect(engine)
        cols_after = {c["name"] for c in inspector.get_columns("presentations")}
        assert "recap_mode" in cols_after, (
            "recap_mode column missing after upgrade head from c7b70d0f31b1"
        )
        # Sanity check: the chat_history_messages table from the prior
        # revision must still exist; we should not have re-run migrations.
        all_tables = set(inspector.get_table_names())
        assert "chat_history_messages" in all_tables
        assert "presentations" in all_tables
    finally:
        engine.dispose()


# -----------------------------------------------------------------------
# Recap endpoint sets recap_mode (3)
# -----------------------------------------------------------------------


def test_recap_endpoint_sets_recap_mode_column():
    """
    `_generate_single_recap` must set `generated_presentation.recap_mode`
    to the canonical mode value (`welcome_home`, `anniversary`,
    `next_planning_window`) so the activity feed and any downstream
    multi-tenant filtering can rely on the column rather than guessing
    from titles.
    """
    generated_id = uuid.uuid4()
    response_payload = PresentationPathAndEditPath(
        presentation_id=generated_id,
        path="/tmp/exports/recap.pptx",
        edit_path=f"/presentation?id={generated_id}",
    )

    # The endpoint mutates the presentation row in place; capture it
    # via a MagicMock and assert .recap_mode after the await returns.
    fake_presentation = MagicMock()
    fake_presentation.recap_mode = None

    mock_session = AsyncMock()
    mock_session.get = AsyncMock(return_value=fake_presentation)
    mock_session.add = MagicMock()
    mock_session.commit = AsyncMock()

    request = RecapPresentationRequest(
        mode="welcome_home",
        source_json={"title": "Iceland Honeymoon"},
    )

    with patch(
        "api.v1.ppt.endpoints.presentation.check_if_api_request_is_valid",
        new=AsyncMock(return_value=(generated_id,)),
    ), patch(
        "api.v1.ppt.endpoints.presentation.generate_presentation_handler",
        new=AsyncMock(return_value=response_payload),
    ), patch(
        "api.v1.ppt.endpoints.presentation._resolve_recap_voice_id",
        return_value=None,
    ):
        result = asyncio.run(_generate_single_recap(request, mock_session))

    assert result.mode.value == "welcome_home"
    assert fake_presentation.recap_mode == "welcome_home", (
        "_generate_single_recap should set recap_mode on the generated "
        "presentation row"
    )
    mock_session.add.assert_called_once_with(fake_presentation)


# -----------------------------------------------------------------------
# Activity feed prefers / falls back (4, 5)
# -----------------------------------------------------------------------


@pytest.fixture
def activity_app(monkeypatch, tmp_path):
    """
    Mirror of the fixture in test_activity_feed.py but exposed locally so
    we can override the scalars holder per-test. Each test gets a fresh
    APP_DATA_DIRECTORY to keep campaign-jobs/ writes isolated.
    """
    monkeypatch.setenv("APP_DATA_DIRECTORY", str(tmp_path))
    app = FastAPI()
    app.include_router(ACTIVITY_ROUTER, prefix="/api/v1/ppt")

    mock_session = AsyncMock()
    scalars_holder = SimpleNamespace(items=[])

    class _Scalars:
        def __init__(self, items):
            self._items = items

        def all(self):
            return self._items

    class _ExecuteResult:
        def __init__(self, items):
            self._items = items

        def scalars(self):
            return _Scalars(self._items)

    async def execute(_query):
        return _ExecuteResult(scalars_holder.items)

    mock_session.execute = execute

    async def override_session():
        yield mock_session

    app.dependency_overrides[get_async_session] = override_session
    app.state.scalars_holder = scalars_holder
    return app


@pytest.fixture
def activity_client(activity_app):
    return TestClient(activity_app, raise_server_exceptions=False)


def test_activity_feed_prefers_recap_mode_column(activity_app, activity_client):
    """
    When `recap_mode` is set on a row, the activity feed must surface it as
    `extra.recap_mode` with `match_source: "column"`. Title content is
    irrelevant on this path — even a title that matches no substring marker
    must still produce a recap entry as long as `recap_mode` is non-null.
    """
    presentation_id = uuid.uuid4()
    activity_app.state.scalars_holder.items = [
        SimpleNamespace(
            id=presentation_id,
            # Title intentionally lacks any substring marker — the column
            # must be authoritative.
            title="Iceland 2025",
            updated_at=datetime(2026, 5, 1, tzinfo=timezone.utc),
            recap_mode="welcome_home",
        ),
    ]

    response = activity_client.get("/api/v1/ppt/activity?type=recap&limit=5")
    assert response.status_code == 200
    payload = response.json()
    assert len(payload["activities"]) == 1
    activity = payload["activities"][0]
    assert activity["kind"] == "recap"
    assert activity["extra"] == {
        "recap_mode": "welcome_home",
        "match_source": "column",
    }


def test_activity_feed_falls_back_to_substring_for_legacy_rows(
    activity_app, activity_client
):
    """
    Legacy presentations created before the migration have `recap_mode = None`.
    Those must still be surfaced as recap activities by the existing
    title-substring matcher, with `match_source: "title_substring"` so the
    UI can distinguish migrated rows from legacy rows.
    """
    legacy_id = uuid.uuid4()
    activity_app.state.scalars_holder.items = [
        SimpleNamespace(
            id=legacy_id,
            title="Paris Romance — Anniversary Recap",
            updated_at=datetime(2026, 4, 1, tzinfo=timezone.utc),
            # No recap_mode attribute — getattr(sn, "recap_mode", None)
            # returns None. Setting it explicitly to None to make the test
            # intent unambiguous.
            recap_mode=None,
        ),
    ]

    response = activity_client.get("/api/v1/ppt/activity?type=recap&limit=5")
    assert response.status_code == 200
    payload = response.json()
    assert len(payload["activities"]) == 1
    activity = payload["activities"][0]
    assert activity["kind"] == "recap"
    assert activity["extra"] == {
        "recap_marker": "anniversary recap",
        "match_source": "title_substring",
    }
