from typing import Optional
from pydantic import BaseModel, Field


class AgentProfile(BaseModel):
    agent_name: Optional[str] = None
    agency_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    booking_url: Optional[str] = None
    tagline: Optional[str] = None
    logo_url: Optional[str] = None
    default_utm_source: Optional[str] = None
    default_utm_medium: Optional[str] = None
    default_utm_campaign: Optional[str] = None


class UserConfig(BaseModel):
    LLM: Optional[str] = None

    # OpenAI
    OPENAI_API_KEY: Optional[str] = None
    OPENAI_MODEL: Optional[str] = None

    # Google
    GOOGLE_API_KEY: Optional[str] = None
    GOOGLE_MODEL: Optional[str] = None

    # Anthropic
    ANTHROPIC_API_KEY: Optional[str] = None
    ANTHROPIC_MODEL: Optional[str] = None

    # Ollama
    OLLAMA_URL: Optional[str] = None
    OLLAMA_MODEL: Optional[str] = None

    # Custom LLM
    CUSTOM_LLM_URL: Optional[str] = None
    CUSTOM_LLM_API_KEY: Optional[str] = None
    CUSTOM_MODEL: Optional[str] = None

    # Image Provider
    DISABLE_IMAGE_GENERATION: Optional[bool] = None
    IMAGE_PROVIDER: Optional[str] = None
    PEXELS_API_KEY: Optional[str] = None
    PIXABAY_API_KEY: Optional[str] = None

    # ComfyUI
    COMFYUI_URL: Optional[str] = None
    COMFYUI_WORKFLOW: Optional[str] = None

    # Open WebUI Image Provider
    OPEN_WEBUI_IMAGE_URL: Optional[str] = None
    OPEN_WEBUI_IMAGE_API_KEY: Optional[str] = None

    # Dalle 3 Quality
    DALL_E_3_QUALITY: Optional[str] = None
    # Gpt Image 1.5 Quality
    GPT_IMAGE_1_5_QUALITY: Optional[str] = None

    # Reasoning
    DISABLE_THINKING: Optional[bool] = None
    EXTENDED_REASONING: Optional[bool] = None

    # Web Search
    WEB_GROUNDING: Optional[bool] = None

    # Codex OAuth (ChatGPT)
    CODEX_MODEL: Optional[str] = None
    CODEX_ACCESS_TOKEN: Optional[str] = None
    CODEX_REFRESH_TOKEN: Optional[str] = None
    CODEX_TOKEN_EXPIRES: Optional[str] = None
    CODEX_ACCOUNT_ID: Optional[str] = None
    CODEX_USERNAME: Optional[str] = None
    CODEX_EMAIL: Optional[str] = None
    CODEX_IS_PRO: Optional[bool] = None

    # ElevenLabs Narration
    ELEVENLABS_API_KEY: Optional[str] = None
    ELEVENLABS_DEFAULT_VOICE_ID: Optional[str] = None
    ELEVENLABS_DEFAULT_MODEL: Optional[str] = None
    ELEVENLABS_DEFAULT_TONE: Optional[str] = None
    ELEVENLABS_PRONUNCIATION_HINTS: Optional[str] = None
    ELEVENLABS_PRONUNCIATION_DICTIONARY_ID: Optional[str] = None

    # Per-call model routing (Mercury / alternative fast models)
    CONTENT_MODEL_PROVIDER: Optional[str] = None
    CONTENT_MODEL_NAME: Optional[str] = None
    CONTENT_MODEL_API_KEY: Optional[str] = None
    CONTENT_MODEL_BASE_URL: Optional[str] = None
    CONTENT_MODEL_REASONING_EFFORT: Optional[str] = None

    STRUCTURE_MODEL_PROVIDER: Optional[str] = None
    STRUCTURE_MODEL_NAME: Optional[str] = None
    STRUCTURE_MODEL_API_KEY: Optional[str] = None
    STRUCTURE_MODEL_BASE_URL: Optional[str] = None
    STRUCTURE_MODEL_REASONING_EFFORT: Optional[str] = None

    # Agent / agency profile context
    agent_profile: AgentProfile = Field(default_factory=AgentProfile)
