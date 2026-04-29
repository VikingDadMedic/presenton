from datetime import datetime
from typing import Optional
import uuid

from sqlalchemy import Column, DateTime, ForeignKey, String
from sqlmodel import Field, SQLModel

from utils.datetime_utils import get_current_utc_datetime


class NarrationUsageLog(SQLModel, table=True):
    __tablename__ = "narration_usage_logs"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    presentation_id: uuid.UUID = Field(
        sa_column=Column(ForeignKey("presentations.id", ondelete="CASCADE"), index=True)
    )
    slide_id: uuid.UUID = Field(
        sa_column=Column(ForeignKey("slides.id", ondelete="CASCADE"), index=True)
    )
    voice_id: Optional[str] = Field(
        default=None, sa_column=Column(String(length=64), nullable=True)
    )
    model_id: Optional[str] = Field(
        default=None, sa_column=Column(String(length=64), nullable=True)
    )
    character_count: int = Field(default=0)
    request_id: Optional[str] = Field(
        default=None, sa_column=Column(String(length=128), nullable=True)
    )
    created_at: datetime = Field(
        sa_column=Column(
            DateTime(timezone=True), nullable=False, default=get_current_utc_datetime
        )
    )
