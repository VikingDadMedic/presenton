import json
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.v1.ppt.endpoints.activity import ACTIVITY_ROUTER
from services.database import get_async_session


@pytest.fixture
def app(monkeypatch, tmp_path):
    """
    Each test gets a fresh APP_DATA_DIRECTORY so campaign-jobs/ writes don't
    cross-pollute, and a stub async session that we override per-test.
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
def client(app):
    return TestClient(app, raise_server_exceptions=False)


def test_activity_feed_campaign_returns_empty_when_no_jobs_exist(client):
    response = client.get("/api/v1/ppt/activity?type=campaign&limit=5")
    assert response.status_code == 200
    assert response.json() == {"activities": []}


def test_activity_feed_campaign_lists_jobs_sorted_by_updated_at(
    client, tmp_path
):
    jobs_dir = tmp_path / "campaign-jobs"
    jobs_dir.mkdir(exist_ok=True)

    older = {
        "campaign_id": "campaign-old",
        "status": "completed",
        "updated_at": "2026-04-01T10:00:00+00:00",
        "variants": [
            {
                "variant_id": "v-1",
                "name": "reel",
                "status": "completed",
                "artifact": {
                    "presentation_id": "pid-1",
                    "edit_path": "/presentation?id=pid-1",
                },
            }
        ],
    }
    newer = {
        "campaign_id": "campaign-new",
        "status": "in_progress",
        "updated_at": "2026-05-01T10:00:00+00:00",
        "variants": [
            {
                "variant_id": "v-2",
                "name": "lead-magnet",
                "status": "in_progress",
            }
        ],
    }
    (jobs_dir / "campaign-old.json").write_text(json.dumps(older))
    (jobs_dir / "campaign-new.json").write_text(json.dumps(newer))

    response = client.get("/api/v1/ppt/activity?type=campaign&limit=5")
    assert response.status_code == 200
    payload = response.json()
    assert len(payload["activities"]) == 2
    assert payload["activities"][0]["id"] == "campaign-new"
    assert payload["activities"][1]["id"] == "campaign-old"
    assert payload["activities"][0]["kind"] == "campaign"
    assert payload["activities"][1]["edit_path"] == "/presentation?id=pid-1"


def test_activity_feed_campaign_respects_limit(client, tmp_path):
    jobs_dir = tmp_path / "campaign-jobs"
    jobs_dir.mkdir(exist_ok=True)
    base = datetime(2026, 5, 1, tzinfo=timezone.utc)
    for i in range(7):
        job = {
            "campaign_id": f"campaign-{i}",
            "status": "completed",
            "updated_at": (base + timedelta(hours=i)).isoformat(),
            "variants": [],
        }
        (jobs_dir / f"campaign-{i}.json").write_text(json.dumps(job))

    response = client.get("/api/v1/ppt/activity?type=campaign&limit=3")
    assert response.status_code == 200
    payload = response.json()
    assert len(payload["activities"]) == 3
    assert [item["id"] for item in payload["activities"]] == [
        "campaign-6",
        "campaign-5",
        "campaign-4",
    ]


def test_activity_feed_recap_lists_matching_titles(app, client):
    presentation_a_id = uuid.uuid4()
    presentation_b_id = uuid.uuid4()
    app.state.scalars_holder.items = [
        SimpleNamespace(
            id=presentation_a_id,
            title="Iceland Honeymoon — Welcome Home Recap",
            updated_at=datetime(2026, 5, 1, tzinfo=timezone.utc),
        ),
        SimpleNamespace(
            id=presentation_b_id,
            title="Paris Romance — Anniversary Recap",
            updated_at=datetime(2026, 4, 1, tzinfo=timezone.utc),
        ),
    ]

    response = client.get("/api/v1/ppt/activity?type=recap&limit=5")
    assert response.status_code == 200
    payload = response.json()
    assert len(payload["activities"]) == 2
    assert payload["activities"][0]["kind"] == "recap"
    assert payload["activities"][0]["edit_path"] == (
        f"/presentation?id={presentation_a_id}"
    )
    assert payload["activities"][1]["title"].endswith("Anniversary Recap")
    assert payload["activities"][1]["extra"]["recap_marker"] == "anniversary recap"


def test_activity_feed_recap_returns_empty_when_no_matches(app, client):
    app.state.scalars_holder.items = []
    response = client.get("/api/v1/ppt/activity?type=recap&limit=5")
    assert response.status_code == 200
    assert response.json() == {"activities": []}


def test_activity_feed_rejects_unsupported_type(client):
    response = client.get("/api/v1/ppt/activity?type=unknown&limit=5")
    assert response.status_code in (400, 422)
