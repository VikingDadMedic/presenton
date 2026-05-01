import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.v1.ppt.endpoints.campaign import (
    CAMPAIGN_ROUTER,
    CampaignGenerateRequest,
    _build_initial_campaign_job,
    _run_campaign_generation,
)
from enums.webhook_event import WebhookEvent
from models.presentation_and_path import PresentationPathAndEditPath
from utils.campaign_job_store import read_campaign_job, write_campaign_job


@pytest.fixture
def app():
    app = FastAPI()
    app.include_router(CAMPAIGN_ROUTER, prefix="/api/v1/ppt")
    return app


@pytest.fixture
def client(app):
    return TestClient(app, raise_server_exceptions=False)


def test_generate_campaign_rejects_empty_variants(client):
    response = client.post(
        "/api/v1/ppt/campaign/generate",
        json={"content": "Promote shoulder season deals", "variants": []},
    )
    assert response.status_code == 422


def test_generate_campaign_rejects_invalid_export_type(client):
    response = client.post(
        "/api/v1/ppt/campaign/generate",
        json={
            "content": "Promote shoulder season deals",
            "variants": [
                {
                    "name": "bad-variant",
                    "template": "travel-reveal",
                    "export_as": "docx",
                }
            ],
        },
    )
    assert response.status_code == 422


def test_generate_campaign_returns_accepted_payload(client):
    with patch(
        "api.v1.ppt.endpoints.campaign.create_campaign_id",
        return_value="campaign-fixed-id",
    ), patch(
        "api.v1.ppt.endpoints.campaign.write_campaign_job",
        new=MagicMock(),
    ) as write_job_mock, patch(
        "api.v1.ppt.endpoints.campaign.CONCURRENT_SERVICE.run_task",
        new=MagicMock(),
    ) as run_task_mock:
        response = client.post(
            "/api/v1/ppt/campaign/generate",
            json={
                "content": "Promote shoulder season deals",
                "variants": [
                    {
                        "name": "reel",
                        "template": "travel-reveal",
                        "export_as": "video",
                    }
                ],
            },
        )

    assert response.status_code == 202
    payload = response.json()
    assert payload["campaign_id"] == "campaign-fixed-id"
    assert payload["statusUrl"].endswith("/campaign-fixed-id")
    write_job_mock.assert_called_once()
    run_task_mock.assert_called_once()


def test_get_campaign_status_returns_404_when_campaign_missing(client):
    with patch(
        "api.v1.ppt.endpoints.campaign.read_campaign_job",
        return_value=None,
    ):
        response = client.get("/api/v1/ppt/campaign/status/not-found")
    assert response.status_code == 404
    assert response.json()["detail"] == "Campaign not found"


@pytest.mark.asyncio
async def test_run_campaign_generation_marks_partial_failure_and_emits_failed_webhook(
    monkeypatch, tmp_path
):
    monkeypatch.setenv("APP_DATA_DIRECTORY", str(tmp_path))
    campaign_id = "campaign-partial-failure"
    request_model = CampaignGenerateRequest(
        content="Build campaign variants",
        variants=[
            {"name": "variant-1", "template": "travel-reveal", "export_as": "video"},
            {"name": "variant-2", "template": "travel-audience", "export_as": "html"},
            {"name": "variant-3", "template": "travel-itinerary", "export_as": "pdf"},
        ],
    )
    write_campaign_job(_build_initial_campaign_job(campaign_id, request_model))

    first_response = PresentationPathAndEditPath(
        presentation_id=uuid.uuid4(),
        path="/tmp/presenton/exports/variant-1.mp4",
        edit_path="/presentation?id=variant-1",
    )
    third_response = PresentationPathAndEditPath(
        presentation_id=uuid.uuid4(),
        path="/tmp/presenton/exports/variant-3.pdf",
        edit_path="/presentation?id=variant-3",
    )

    with patch(
        "api.v1.ppt.endpoints.campaign._generate_variant_presentation",
        new=AsyncMock(
            side_effect=[
                first_response,
                RuntimeError("Variant 2 failed"),
                third_response,
            ]
        ),
    ), patch(
        "api.v1.ppt.endpoints.campaign.WebhookService.send_webhook",
        new=AsyncMock(),
    ) as send_webhook:
        await _run_campaign_generation(campaign_id, request_model.model_dump(mode="json"))

    final_job = read_campaign_job(campaign_id)
    assert final_job is not None
    assert final_job["status"] == "failed"
    assert [variant["name"] for variant in final_job["variants"]] == [
        "variant-1",
        "variant-2",
        "variant-3",
    ]
    assert [variant["status"] for variant in final_job["variants"]] == [
        "completed",
        "failed",
        "completed",
    ]
    assert final_job["variants"][1]["error"] == "Variant 2 failed"

    send_webhook.assert_awaited_once()
    assert send_webhook.await_args.args[0] == WebhookEvent.CAMPAIGN_GENERATION_FAILED
    assert send_webhook.await_args.args[1]["status"] == "failed"


@pytest.mark.asyncio
async def test_run_campaign_generation_emits_completed_webhook_on_success(
    monkeypatch, tmp_path
):
    monkeypatch.setenv("APP_DATA_DIRECTORY", str(tmp_path))
    campaign_id = "campaign-success"
    request_model = CampaignGenerateRequest(
        content="Build campaign variants",
        variants=[
            {"name": "variant-1", "template": "travel-reveal", "export_as": "video"},
            {"name": "variant-2", "template": "travel-itinerary", "export_as": "pdf"},
        ],
    )
    write_campaign_job(_build_initial_campaign_job(campaign_id, request_model))

    first_response = PresentationPathAndEditPath(
        presentation_id=uuid.uuid4(),
        path="/tmp/presenton/exports/variant-1.mp4",
        edit_path="/presentation?id=variant-1",
    )
    second_response = PresentationPathAndEditPath(
        presentation_id=uuid.uuid4(),
        path="/tmp/presenton/exports/variant-2.pdf",
        edit_path="/presentation?id=variant-2",
    )

    with patch(
        "api.v1.ppt.endpoints.campaign._generate_variant_presentation",
        new=AsyncMock(side_effect=[first_response, second_response]),
    ), patch(
        "api.v1.ppt.endpoints.campaign.WebhookService.send_webhook",
        new=AsyncMock(),
    ) as send_webhook:
        await _run_campaign_generation(campaign_id, request_model.model_dump(mode="json"))

    final_job = read_campaign_job(campaign_id)
    assert final_job is not None
    assert final_job["status"] == "completed"
    assert [variant["status"] for variant in final_job["variants"]] == [
        "completed",
        "completed",
    ]

    send_webhook.assert_awaited_once()
    assert send_webhook.await_args.args[0] == WebhookEvent.CAMPAIGN_GENERATION_COMPLETED
    assert send_webhook.await_args.args[1]["status"] == "completed"
