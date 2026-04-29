"""add narration columns

Revision ID: 6b8a7a3b8d1f
Revises: 95b5127e93cd
Create Date: 2026-04-28 12:45:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "6b8a7a3b8d1f"
down_revision: Union[str, None] = "95b5127e93cd"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("slides", sa.Column("narration_voice_id", sa.String(), nullable=True))
    op.add_column("slides", sa.Column("narration_tone", sa.String(), nullable=True))
    op.add_column("slides", sa.Column("narration_model_id", sa.String(), nullable=True))
    op.add_column("slides", sa.Column("narration_audio_url", sa.String(), nullable=True))
    op.add_column("slides", sa.Column("narration_text_hash", sa.String(), nullable=True))
    op.add_column(
        "slides", sa.Column("narration_generated_at", sa.DateTime(timezone=True), nullable=True)
    )

    op.add_column(
        "presentations", sa.Column("narration_voice_id", sa.String(), nullable=True)
    )
    op.add_column("presentations", sa.Column("narration_tone", sa.String(), nullable=True))
    op.add_column(
        "presentations", sa.Column("narration_model_id", sa.String(), nullable=True)
    )
    op.add_column(
        "presentations",
        sa.Column("narration_pronunciation_dictionary_id", sa.String(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("presentations", "narration_pronunciation_dictionary_id")
    op.drop_column("presentations", "narration_model_id")
    op.drop_column("presentations", "narration_tone")
    op.drop_column("presentations", "narration_voice_id")

    op.drop_column("slides", "narration_generated_at")
    op.drop_column("slides", "narration_text_hash")
    op.drop_column("slides", "narration_audio_url")
    op.drop_column("slides", "narration_model_id")
    op.drop_column("slides", "narration_tone")
    op.drop_column("slides", "narration_voice_id")
