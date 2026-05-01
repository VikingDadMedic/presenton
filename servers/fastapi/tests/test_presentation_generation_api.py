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
