"""Tests for the /generate endpoint's input validation."""
import asyncio
import uuid
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
