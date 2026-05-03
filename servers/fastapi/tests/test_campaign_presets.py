import json
import os

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.v1.ppt.endpoints.campaign_presets import CAMPAIGN_PRESETS_ROUTER


@pytest.fixture
def user_config_path(tmp_path, monkeypatch):
    config_path = tmp_path / "userConfig.json"
    monkeypatch.setenv("USER_CONFIG_PATH", str(config_path))
    return config_path


@pytest.fixture
def app():
    app = FastAPI()
    app.include_router(CAMPAIGN_PRESETS_ROUTER, prefix="/api/v1/ppt")
    return app


@pytest.fixture
def client(app):
    return TestClient(app, raise_server_exceptions=False)


def _sample_preset(*, preset_id: str = "preset-1", label: str = "Reel preset") -> dict:
    return {
        "id": preset_id,
        "label": label,
        "description": "Short-form social cut",
        "name": "reel",
        "template": "travel-reveal",
        "export_as": "video",
        "narration_tone": "hype_reel",
        "use_narration_as_soundtrack": True,
        "aspect_ratio": "vertical",
        "slide_duration": 3,
    }


def test_get_campaign_presets_returns_empty_list_initially(client, user_config_path):
    assert not user_config_path.exists()
    response = client.get("/api/v1/ppt/campaign-presets")
    assert response.status_code == 200
    assert response.json() == {"presets": []}


def test_patch_campaign_presets_replaces_full_list(client, user_config_path):
    payload = {"presets": [_sample_preset(preset_id="preset-a", label="A")]}
    response = client.patch("/api/v1/ppt/campaign-presets", json=payload)
    assert response.status_code == 200
    body = response.json()
    assert len(body["presets"]) == 1
    assert body["presets"][0]["id"] == "preset-a"
    assert body["presets"][0]["label"] == "A"
    assert body["presets"][0]["template"] == "travel-reveal"

    persisted = json.loads(user_config_path.read_text())
    assert "campaign_presets" in persisted
    assert len(persisted["campaign_presets"]) == 1
    assert persisted["campaign_presets"][0]["id"] == "preset-a"


def test_patch_campaign_presets_rejects_invalid_export_format(client, user_config_path):
    bad = _sample_preset()
    bad["export_as"] = "docx"
    response = client.patch(
        "/api/v1/ppt/campaign-presets",
        json={"presets": [bad]},
    )
    assert response.status_code == 422


def test_get_campaign_presets_returns_what_was_patched(client, user_config_path):
    payload = {
        "presets": [
            _sample_preset(preset_id="p1", label="One"),
            _sample_preset(preset_id="p2", label="Two"),
        ]
    }
    patch_response = client.patch("/api/v1/ppt/campaign-presets", json=payload)
    assert patch_response.status_code == 200

    response = client.get("/api/v1/ppt/campaign-presets")
    assert response.status_code == 200
    body = response.json()
    assert [preset["id"] for preset in body["presets"]] == ["p1", "p2"]
    assert [preset["label"] for preset in body["presets"]] == ["One", "Two"]


def test_patch_campaign_presets_drops_to_empty_list(client, user_config_path):
    seed_response = client.patch(
        "/api/v1/ppt/campaign-presets",
        json={"presets": [_sample_preset()]},
    )
    assert seed_response.status_code == 200

    drop_response = client.patch(
        "/api/v1/ppt/campaign-presets",
        json={"presets": []},
    )
    assert drop_response.status_code == 200
    assert drop_response.json() == {"presets": []}

    persisted = json.loads(user_config_path.read_text())
    assert persisted["campaign_presets"] == []


def test_get_campaign_presets_drops_malformed_persisted_entries(
    client, user_config_path
):
    """
    userConfig.json is hand-editable. Persisted-but-malformed entries should be
    silently skipped instead of crashing the GET endpoint.
    """
    user_config_path.write_text(
        json.dumps(
            {
                "campaign_presets": [
                    _sample_preset(preset_id="good", label="Good preset"),
                    {"id": "missing-required-fields"},
                ]
            }
        )
    )
    response = client.get("/api/v1/ppt/campaign-presets")
    assert response.status_code == 200
    body = response.json()
    assert [preset["id"] for preset in body["presets"]] == ["good"]


def test_patch_campaign_presets_requires_user_config_path(monkeypatch, client):
    monkeypatch.delenv("USER_CONFIG_PATH", raising=False)
    response = client.patch(
        "/api/v1/ppt/campaign-presets",
        json={"presets": [_sample_preset()]},
    )
    assert response.status_code == 500
    assert "USER_CONFIG_PATH" in response.json()["detail"]
