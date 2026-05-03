import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.v1.ppt.endpoints.presentation import (
    PRESENTATION_ROUTER,
    RecapPresentationRequest,
)
from models.presentation_and_path import PresentationPathAndEditPath
from services.database import get_async_session


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


def test_recap_request_validator_rejects_empty_payload():
    with pytest.raises(ValueError):
        RecapPresentationRequest(mode="welcome_home")


def test_recap_request_validator_accepts_source_presentation_ids():
    request = RecapPresentationRequest(
        mode="welcome_home",
        source_presentation_ids=[uuid.uuid4(), uuid.uuid4()],
    )
    assert request.source_presentation_ids is not None
    assert len(request.source_presentation_ids) == 2


def test_recap_endpoint_returns_bulk_shape_for_multiple_sources(client):
    source_ids = [uuid.uuid4(), uuid.uuid4(), uuid.uuid4()]
    generated_ids = [uuid.uuid4() for _ in source_ids]

    async def fake_generate_single_recap(per_source_request, _sql_session):
        index = source_ids.index(per_source_request.source_presentation_id)
        from api.v1.ppt.endpoints.presentation import RecapPresentationResponse

        generated_id = generated_ids[index]
        return RecapPresentationResponse(
            presentation_id=generated_id,
            path=f"/tmp/exports/recap-{index}.pptx",
            edit_path=f"/presentation?id={generated_id}",
            mode=per_source_request.mode,
            source_presentation_id=per_source_request.source_presentation_id,
        )

    with patch(
        "api.v1.ppt.endpoints.presentation._generate_single_recap",
        new=AsyncMock(side_effect=fake_generate_single_recap),
    ) as mock_single:
        response = client.post(
            "/api/v1/ppt/presentation/recap",
            json={
                "mode": "welcome_home",
                "source_presentation_ids": [str(source_id) for source_id in source_ids],
            },
        )

    assert response.status_code == 200
    body = response.json()
    assert "recaps" in body
    assert len(body["recaps"]) == 3
    assert mock_single.await_count == 3
    returned_source_ids = [
        recap["source_presentation_id"] for recap in body["recaps"]
    ]
    assert returned_source_ids == [str(source_id) for source_id in source_ids]


def test_recap_endpoint_returns_single_shape_for_single_source(client):
    """
    When `source_presentation_ids` is omitted, the endpoint must keep the
    single-shape RecapPresentationResponse contract — no `recaps` array.
    Uses source_json (no DB lookup needed) to keep the test focused on shape.
    """
    generated_id = uuid.uuid4()
    response_payload = PresentationPathAndEditPath(
        presentation_id=generated_id,
        path="/tmp/exports/recap.pptx",
        edit_path=f"/presentation?id={generated_id}",
    )

    with patch(
        "api.v1.ppt.endpoints.presentation.check_if_api_request_is_valid",
        new=AsyncMock(return_value=(generated_id,)),
    ), patch(
        "api.v1.ppt.endpoints.presentation.generate_presentation_handler",
        new=AsyncMock(return_value=response_payload),
    ):
        response = client.post(
            "/api/v1/ppt/presentation/recap",
            json={
                "mode": "anniversary",
                "source_json": {"title": "Iceland Honeymoon"},
            },
        )

    assert response.status_code == 200
    body = response.json()
    assert "recaps" not in body
    assert body["mode"] == "anniversary"
    assert body["presentation_id"] == str(generated_id)


def test_recap_request_strips_source_presentation_ids_when_iterating(client):
    """
    Inside the bulk loop, the per-source RecapPresentationRequest must be
    rebuilt with `source_presentation_ids = None` so that the recursive
    `_generate_single_recap` call sees a single-source request shape.
    """
    source_ids = [uuid.uuid4(), uuid.uuid4()]

    captured_per_source_requests = []

    async def fake_generate_single_recap(per_source_request, _sql_session):
        captured_per_source_requests.append(per_source_request)
        from api.v1.ppt.endpoints.presentation import RecapPresentationResponse

        gen_id = uuid.uuid4()
        return RecapPresentationResponse(
            presentation_id=gen_id,
            path=f"/tmp/exports/recap-{gen_id}.pptx",
            edit_path=f"/presentation?id={gen_id}",
            mode=per_source_request.mode,
            source_presentation_id=per_source_request.source_presentation_id,
        )

    with patch(
        "api.v1.ppt.endpoints.presentation._generate_single_recap",
        new=AsyncMock(side_effect=fake_generate_single_recap),
    ):
        response = client.post(
            "/api/v1/ppt/presentation/recap",
            json={
                "mode": "next_planning_window",
                "source_presentation_ids": [
                    str(source_id) for source_id in source_ids
                ],
            },
        )

    assert response.status_code == 200
    assert len(captured_per_source_requests) == 2
    for per_source_request in captured_per_source_requests:
        assert per_source_request.source_presentation_ids is None
        assert per_source_request.source_presentation_id is not None
