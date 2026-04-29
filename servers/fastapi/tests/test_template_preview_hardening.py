import subprocess

import pytest
from fastapi import HTTPException

from templates.preview import convert_to_pptx_if_needed


def test_convert_to_pptx_if_needed_handles_missing_libreoffice(monkeypatch):
    def raise_not_found(*_args, **_kwargs):
        raise FileNotFoundError("soffice not found")

    monkeypatch.setattr(subprocess, "run", raise_not_found)

    with pytest.raises(HTTPException) as exc:
        convert_to_pptx_if_needed("/tmp/sample.ppt", "/tmp")

    assert exc.value.status_code == 500
    assert "LibreOffice is required" in str(exc.value.detail)
    assert "SOFFICE_PATH" in str(exc.value.detail)
