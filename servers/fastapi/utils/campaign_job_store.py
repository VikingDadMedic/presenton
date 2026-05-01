import json
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from utils.get_env import get_app_data_directory_env


CAMPAIGN_JOB_RETENTION_MS = 24 * 60 * 60 * 1000


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_campaign_jobs_directory() -> str:
    root = get_app_data_directory_env() or "/tmp/presenton"
    jobs_dir = os.path.join(root, "campaign-jobs")
    os.makedirs(jobs_dir, exist_ok=True)
    return jobs_dir


def get_campaign_job_path(campaign_id: str) -> str:
    return os.path.join(get_campaign_jobs_directory(), f"{campaign_id}.json")


def create_campaign_id() -> str:
    return str(uuid.uuid4())


def _safe_read_job(file_path: str) -> Optional[Dict[str, Any]]:
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def _atomic_write_json(file_path: str, value: Dict[str, Any]) -> None:
    tmp_path = f"{file_path}.tmp.{os.getpid()}.{int(datetime.now().timestamp() * 1000)}"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(value, f, ensure_ascii=True, indent=2)
    os.replace(tmp_path, file_path)


def write_campaign_job(job: Dict[str, Any]) -> None:
    campaign_id = job.get("campaign_id")
    if not campaign_id:
        raise ValueError("campaign_id is required when writing campaign jobs")
    _atomic_write_json(get_campaign_job_path(str(campaign_id)), job)


def read_campaign_job(campaign_id: str) -> Optional[Dict[str, Any]]:
    return _safe_read_job(get_campaign_job_path(campaign_id))


def update_campaign_job(
    campaign_id: str, patch: Dict[str, Any]
) -> Optional[Dict[str, Any]]:
    current = read_campaign_job(campaign_id)
    if not current:
        return None
    next_job = {**current, **patch}
    if "updated_at" not in patch:
        next_job["updated_at"] = _utcnow_iso()
    write_campaign_job(next_job)
    return next_job


def update_campaign_variant(
    campaign_id: str, variant_id: str, patch: Dict[str, Any]
) -> Optional[Dict[str, Any]]:
    current = read_campaign_job(campaign_id)
    if not current:
        return None

    variants = list(current.get("variants") or [])
    for index, variant in enumerate(variants):
        if str(variant.get("variant_id")) != variant_id:
            continue
        updated_variant = {**variant, **patch}
        variants[index] = updated_variant
        current["variants"] = variants
        current["updated_at"] = _utcnow_iso()
        write_campaign_job(current)
        return current
    return None


def reap_stale_campaign_jobs(now_ms: Optional[int] = None) -> Dict[str, int]:
    now = now_ms
    if now is None:
        now = int(datetime.now(tz=timezone.utc).timestamp() * 1000)

    scanned = 0
    removed = 0
    try:
        entries = os.listdir(get_campaign_jobs_directory())
    except Exception:
        return {"scanned": 0, "removed": 0}

    for entry in entries:
        if not entry.endswith(".json"):
            continue
        file_path = os.path.join(get_campaign_jobs_directory(), entry)
        scanned += 1
        try:
            stat = os.stat(file_path)
            age_ms = now - int(stat.st_mtime * 1000)
            if age_ms > CAMPAIGN_JOB_RETENTION_MS:
                os.remove(file_path)
                removed += 1
        except Exception:
            continue

    return {"scanned": scanned, "removed": removed}
