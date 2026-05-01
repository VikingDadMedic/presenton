import os
import time

from utils.campaign_job_store import (
    create_campaign_id,
    get_campaign_job_path,
    read_campaign_job,
    reap_stale_campaign_jobs,
    update_campaign_variant,
    write_campaign_job,
)


def _build_campaign_job(campaign_id: str, variant_id: str) -> dict:
    return {
        "campaign_id": campaign_id,
        "status": "pending",
        "created_at": "2026-01-01T00:00:00+00:00",
        "updated_at": "2026-01-01T00:00:00+00:00",
        "started_at": None,
        "completed_at": None,
        "error": None,
        "variants": [
            {
                "variant_id": variant_id,
                "name": "reel",
                "template": "travel-reveal",
                "export_as": "video",
                "status": "pending",
                "created_at": "2026-01-01T00:00:00+00:00",
                "updated_at": "2026-01-01T00:00:00+00:00",
                "started_at": None,
                "completed_at": None,
                "error": None,
                "artifact": None,
            }
        ],
    }


def test_campaign_job_store_round_trip_and_variant_update(monkeypatch, tmp_path):
    monkeypatch.setenv("APP_DATA_DIRECTORY", str(tmp_path))
    campaign_id = create_campaign_id()
    variant_id = "variant-1"
    write_campaign_job(_build_campaign_job(campaign_id, variant_id))

    loaded = read_campaign_job(campaign_id)
    assert loaded is not None
    assert loaded["campaign_id"] == campaign_id
    assert loaded["variants"][0]["status"] == "pending"

    updated = update_campaign_variant(
        campaign_id,
        variant_id,
        {
            "status": "completed",
            "completed_at": "2026-01-01T00:10:00+00:00",
            "artifact": {
                "presentation_id": "presentation-123",
                "export_as": "video",
                "path": "/tmp/presenton/exports/reel.mp4",
                "edit_path": "/presentation?id=presentation-123",
            },
            "error": None,
        },
    )

    assert updated is not None
    assert updated["variants"][0]["status"] == "completed"
    assert updated["variants"][0]["artifact"]["path"].endswith("reel.mp4")


def test_reap_stale_campaign_jobs_removes_old_files(monkeypatch, tmp_path):
    monkeypatch.setenv("APP_DATA_DIRECTORY", str(tmp_path))

    stale_campaign_id = create_campaign_id()
    fresh_campaign_id = create_campaign_id()
    write_campaign_job(_build_campaign_job(stale_campaign_id, "stale-variant"))
    write_campaign_job(_build_campaign_job(fresh_campaign_id, "fresh-variant"))

    stale_path = get_campaign_job_path(stale_campaign_id)
    stale_time_epoch = time.time() - (3 * 24 * 60 * 60)
    os.utime(stale_path, (stale_time_epoch, stale_time_epoch))

    result = reap_stale_campaign_jobs(now_ms=int(time.time() * 1000))
    assert result["scanned"] >= 2
    assert result["removed"] >= 1
    assert read_campaign_job(stale_campaign_id) is None
    assert read_campaign_job(fresh_campaign_id) is not None
