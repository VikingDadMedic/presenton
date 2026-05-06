"""Phase 11.0c.1 Sentry FastAPI init guard tests.

Covers the two paths that production observability can take when the
TripStory FastAPI process boots:

- ``SENTRY_DSN`` set      → ``sentry_sdk.init`` is called exactly once
                            with the resolved sample rate + PII default.
- ``SENTRY_DSN`` unset    → ``sentry_sdk.init`` is NEVER called.

Also probes the helper guards (`_get_sentry_traces_sample_rate`,
`_get_sentry_send_default_pii`) for malformed env-var values so the prod
defaults survive a bad copy-paste in App Service settings.
"""

from __future__ import annotations

from unittest.mock import patch

import pytest

import api.main as api_main


@pytest.fixture(autouse=True)
def _clear_sentry_env(monkeypatch):
    """Each test starts from a clean slate so envvar leak between cases
    does not muddy the init-was-called assertion.
    """
    for key in (
        "SENTRY_DSN",
        "SENTRY_TRACES_SAMPLE_RATE",
        "SENTRY_SEND_DEFAULT_PII",
    ):
        monkeypatch.delenv(key, raising=False)


def test_maybe_init_sentry_calls_init_when_dsn_set(monkeypatch):
    monkeypatch.setenv("SENTRY_DSN", "https://example@sentry.io/12345")

    with patch.object(api_main, "sentry_sdk") as fake_sdk:
        result = api_main._maybe_init_sentry()

    assert result is True, (
        "Helper must signal init-was-called so the boot sequence can log "
        "observability state."
    )
    fake_sdk.init.assert_called_once()
    kwargs = fake_sdk.init.call_args.kwargs
    assert kwargs["dsn"] == "https://example@sentry.io/12345"
    assert kwargs["traces_sample_rate"] == pytest.approx(0.1), (
        "Default sample rate is 0.1 (NOT 1.0 — would blow Sentry quota on "
        "a B2 App Service plan)."
    )
    assert kwargs["send_default_pii"] is False, (
        "Default PII posture is False — travel agent + client-name privacy."
    )


def test_maybe_init_sentry_skips_when_dsn_empty():
    with patch.object(api_main, "sentry_sdk") as fake_sdk:
        result = api_main._maybe_init_sentry()

    assert result is False
    fake_sdk.init.assert_not_called()


def test_maybe_init_sentry_skips_when_dsn_blank_string(monkeypatch):
    """``""`` should be treated as "unset" — App Service often sets a
    placeholder empty value when the field is left blank.
    """
    monkeypatch.setenv("SENTRY_DSN", "")
    with patch.object(api_main, "sentry_sdk") as fake_sdk:
        result = api_main._maybe_init_sentry()

    assert result is False
    fake_sdk.init.assert_not_called()


def test_traces_sample_rate_respects_explicit_value(monkeypatch):
    monkeypatch.setenv("SENTRY_TRACES_SAMPLE_RATE", "0.5")
    assert api_main._get_sentry_traces_sample_rate() == pytest.approx(0.5)


def test_traces_sample_rate_falls_back_on_invalid(monkeypatch):
    monkeypatch.setenv("SENTRY_TRACES_SAMPLE_RATE", "not-a-float")
    assert api_main._get_sentry_traces_sample_rate(default=0.42) == pytest.approx(
        0.42
    )


def test_traces_sample_rate_clamps_out_of_range(monkeypatch):
    monkeypatch.setenv("SENTRY_TRACES_SAMPLE_RATE", "1.5")
    assert api_main._get_sentry_traces_sample_rate(default=0.1) == pytest.approx(
        0.1
    )
    monkeypatch.setenv("SENTRY_TRACES_SAMPLE_RATE", "-0.1")
    assert api_main._get_sentry_traces_sample_rate(default=0.1) == pytest.approx(
        0.1
    )


def test_send_default_pii_truthy_strings(monkeypatch):
    for value in ("1", "true", "True", "TRUE", "yes", "Yes", "on"):
        monkeypatch.setenv("SENTRY_SEND_DEFAULT_PII", value)
        assert api_main._get_sentry_send_default_pii(default=False) is True, (
            f"{value!r} should toggle PII on"
        )


def test_send_default_pii_falsy_strings(monkeypatch):
    # Use default=True to confirm these explicit values force PII off
    # (rather than just falling back to default). Empty string "" is
    # covered separately by test_send_default_pii_default_when_unset
    # because it intentionally short-circuits to the caller's default.
    for value in ("0", "false", "no", "off"):
        monkeypatch.setenv("SENTRY_SEND_DEFAULT_PII", value)
        assert api_main._get_sentry_send_default_pii(default=True) is False, (
            f"{value!r} should toggle PII off"
        )


def test_send_default_pii_default_when_unset():
    assert api_main._get_sentry_send_default_pii(default=False) is False
    assert api_main._get_sentry_send_default_pii(default=True) is True
