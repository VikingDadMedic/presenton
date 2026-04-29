from datetime import datetime
from typing import Optional
import uuid
from sqlalchemy import DateTime, ForeignKey
from sqlmodel import Field, Column, JSON, SQLModel


class SlideModel(SQLModel, table=True):
    __tablename__ = "slides"

    id: uuid.UUID = Field(primary_key=True, default_factory=uuid.uuid4)
    presentation: uuid.UUID = Field(
        sa_column=Column(ForeignKey("presentations.id", ondelete="CASCADE"), index=True)
    )
    layout_group: str
    layout: str
    index: int
    content: dict = Field(sa_column=Column(JSON))
    html_content: Optional[str] = None
    speaker_note: Optional[str] = None
    narration_voice_id: Optional[str] = None
    narration_tone: Optional[str] = None
    narration_model_id: Optional[str] = None
    narration_audio_url: Optional[str] = None
    narration_text_hash: Optional[str] = None
    narration_generated_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )
    properties: Optional[dict] = Field(sa_column=Column(JSON))

    def get_new_slide(self, presentation: uuid.UUID, content: Optional[dict] = None):
        return SlideModel(
            id=uuid.uuid4(),
            presentation=presentation,
            layout_group=self.layout_group,
            layout=self.layout,
            index=self.index,
            speaker_note=self.speaker_note,
            narration_voice_id=self.narration_voice_id,
            narration_tone=self.narration_tone,
            narration_model_id=self.narration_model_id,
            narration_audio_url=self.narration_audio_url,
            narration_text_hash=self.narration_text_hash,
            narration_generated_at=self.narration_generated_at,
            content=content or self.content,
            properties=self.properties,
        )
