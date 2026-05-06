"""Smoke tests for Vertex AI + Azure OpenAI provider config plumbing.

Phase 10.5 of the Phase 10 final consolidation plan. llmai 0.2.2 ships
`VertexAIClientConfig` and `AzureOpenAIClientConfig` first-class; this
file proves our `get_llm_config()` correctly wires both providers
based on env vars without throwing.
"""

from __future__ import annotations

import pytest
from unittest.mock import patch

from llmai.shared import AzureOpenAIClientConfig, VertexAIClientConfig

from enums.llm_provider import LLMProvider
from utils.llm_config import get_llm_config


# ---------------------------------------------------------------------------
# Vertex AI
# ---------------------------------------------------------------------------


@patch("utils.llm_provider.get_llm_provider_env", return_value="vertex")
@patch("utils.llm_config.get_vertex_api_key_env", return_value="vertex-test-key")
@patch("utils.llm_config.get_vertex_project_env", return_value=None)
@patch("utils.llm_config.get_vertex_location_env", return_value=None)
@patch("utils.llm_config.get_vertex_base_url_env", return_value=None)
def test_vertex_config_resolves_with_api_key_only(*mocks):
    config = get_llm_config()
    assert isinstance(config, VertexAIClientConfig)
    assert config.api_key == "vertex-test-key"
    assert config.project is None
    assert config.location is None


@patch("utils.llm_provider.get_llm_provider_env", return_value="vertex")
@patch("utils.llm_config.get_vertex_api_key_env", return_value=None)
@patch("utils.llm_config.get_vertex_project_env", return_value="presenton-prj-12345")
@patch("utils.llm_config.get_vertex_location_env", return_value="us-central1")
@patch("utils.llm_config.get_vertex_base_url_env", return_value=None)
def test_vertex_config_resolves_with_project_location(*mocks):
    config = get_llm_config()
    assert isinstance(config, VertexAIClientConfig)
    assert config.api_key is None
    assert config.project == "presenton-prj-12345"
    assert config.location == "us-central1"


@patch("utils.llm_provider.get_llm_provider_env", return_value="vertex")
@patch("utils.llm_config.get_vertex_api_key_env", return_value=None)
@patch("utils.llm_config.get_vertex_project_env", return_value=None)
@patch("utils.llm_config.get_vertex_location_env", return_value=None)
@patch("utils.llm_config.get_vertex_base_url_env", return_value=None)
def test_vertex_config_raises_when_unconfigured(*mocks):
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc_info:
        get_llm_config()
    assert exc_info.value.status_code == 400
    assert "VERTEX_API_KEY" in exc_info.value.detail


# ---------------------------------------------------------------------------
# Azure OpenAI
# ---------------------------------------------------------------------------


@patch("utils.llm_provider.get_llm_provider_env", return_value="azure")
@patch("utils.llm_config.get_azure_openai_api_key_env", return_value="azure-test-key")
@patch(
    "utils.llm_config.get_azure_openai_api_version_env",
    return_value="2024-08-01-preview",
)
@patch(
    "utils.llm_config.get_azure_openai_endpoint_env",
    return_value="https://example.openai.azure.com",
)
@patch("utils.llm_config.get_azure_openai_base_url_env", return_value=None)
@patch(
    "utils.llm_config.get_azure_openai_deployment_env",
    return_value="gpt-4o-deployment",
)
def test_azure_openai_config_resolves_with_endpoint(*mocks):
    config = get_llm_config()
    assert isinstance(config, AzureOpenAIClientConfig)
    assert config.api_key == "azure-test-key"
    assert config.api_version == "2024-08-01-preview"
    assert config.endpoint == "https://example.openai.azure.com"
    assert config.deployment == "gpt-4o-deployment"


@patch("utils.llm_provider.get_llm_provider_env", return_value="azure")
@patch("utils.llm_config.get_azure_openai_api_key_env", return_value=None)
@patch(
    "utils.llm_config.get_azure_openai_api_version_env",
    return_value="2024-08-01-preview",
)
@patch(
    "utils.llm_config.get_azure_openai_endpoint_env",
    return_value="https://example.openai.azure.com",
)
@patch("utils.llm_config.get_azure_openai_base_url_env", return_value=None)
@patch("utils.llm_config.get_azure_openai_deployment_env", return_value=None)
def test_azure_openai_config_raises_without_api_key(*mocks):
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc_info:
        get_llm_config()
    assert exc_info.value.status_code == 400
    assert "Azure OpenAI API Key" in exc_info.value.detail


@patch("utils.llm_provider.get_llm_provider_env", return_value="azure")
@patch("utils.llm_config.get_azure_openai_api_key_env", return_value="azure-test-key")
@patch("utils.llm_config.get_azure_openai_api_version_env", return_value=None)
@patch(
    "utils.llm_config.get_azure_openai_endpoint_env",
    return_value="https://example.openai.azure.com",
)
@patch("utils.llm_config.get_azure_openai_base_url_env", return_value=None)
@patch("utils.llm_config.get_azure_openai_deployment_env", return_value=None)
def test_azure_openai_config_raises_without_api_version(*mocks):
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc_info:
        get_llm_config()
    assert exc_info.value.status_code == 400
    assert "AZURE_OPENAI_API_VERSION" in exc_info.value.detail


@patch("utils.llm_provider.get_llm_provider_env", return_value="azure")
@patch("utils.llm_config.get_azure_openai_api_key_env", return_value="azure-test-key")
@patch(
    "utils.llm_config.get_azure_openai_api_version_env",
    return_value="2024-08-01-preview",
)
@patch("utils.llm_config.get_azure_openai_endpoint_env", return_value=None)
@patch("utils.llm_config.get_azure_openai_base_url_env", return_value=None)
@patch("utils.llm_config.get_azure_openai_deployment_env", return_value=None)
def test_azure_openai_config_raises_without_endpoint_or_base_url(*mocks):
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc_info:
        get_llm_config()
    assert exc_info.value.status_code == 400
    assert (
        "AZURE_OPENAI_ENDPOINT" in exc_info.value.detail
        or "AZURE_OPENAI_BASE_URL" in exc_info.value.detail
    )


# ---------------------------------------------------------------------------
# Provider enum coverage
# ---------------------------------------------------------------------------


def test_llm_provider_enum_includes_vertex_and_azure():
    """Phase 10.5 contract: enum exposes both new providers."""
    assert LLMProvider("vertex") == LLMProvider.VERTEX
    assert LLMProvider("azure") == LLMProvider.AZURE


def test_get_model_falls_back_for_vertex_and_azure():
    """`get_model()` returns sensible defaults when {VERTEX,AZURE_OPENAI}_MODEL is unset."""
    from utils.llm_provider import get_model
    from constants.llm import DEFAULT_GOOGLE_MODEL, DEFAULT_OPENAI_MODEL

    with patch("utils.llm_provider.get_llm_provider_env", return_value="vertex"), \
         patch("utils.llm_provider.get_vertex_model_env", return_value=None):
        assert get_model() == DEFAULT_GOOGLE_MODEL

    with patch("utils.llm_provider.get_llm_provider_env", return_value="azure"), \
         patch("utils.llm_provider.get_azure_openai_model_env", return_value=None):
        assert get_model() == DEFAULT_OPENAI_MODEL

    with patch("utils.llm_provider.get_llm_provider_env", return_value="vertex"), \
         patch(
             "utils.llm_provider.get_vertex_model_env",
             return_value="custom-gemini-pro",
         ):
        assert get_model() == "custom-gemini-pro"
