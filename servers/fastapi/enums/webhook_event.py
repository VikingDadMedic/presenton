from enum import Enum


class WebhookEvent(str, Enum):
    PRESENTATION_GENERATION_COMPLETED = "presentation.generation.completed"
    PRESENTATION_GENERATION_FAILED = "presentation.generation.failed"
    CAMPAIGN_GENERATION_COMPLETED = "campaign.generation.completed"
    CAMPAIGN_GENERATION_FAILED = "campaign.generation.failed"
