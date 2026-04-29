"""add narration usage log table

Revision ID: 9d2f4f8429de
Revises: 6b8a7a3b8d1f
Create Date: 2026-04-29 09:40:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "9d2f4f8429de"
down_revision: Union[str, None] = "6b8a7a3b8d1f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "narration_usage_logs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("presentation_id", sa.Uuid(), nullable=False),
        sa.Column("slide_id", sa.Uuid(), nullable=False),
        sa.Column("voice_id", sa.String(length=64), nullable=True),
        sa.Column("model_id", sa.String(length=64), nullable=True),
        sa.Column("character_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("request_id", sa.String(length=128), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.ForeignKeyConstraint(
            ["presentation_id"], ["presentations.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["slide_id"], ["slides.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_narration_usage_logs_presentation_id"),
        "narration_usage_logs",
        ["presentation_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_narration_usage_logs_slide_id"),
        "narration_usage_logs",
        ["slide_id"],
        unique=False,
    )
    op.create_index(
        "ix_narration_usage_logs_created_at",
        "narration_usage_logs",
        ["created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_narration_usage_logs_created_at", table_name="narration_usage_logs")
    op.drop_index(op.f("ix_narration_usage_logs_slide_id"), table_name="narration_usage_logs")
    op.drop_index(
        op.f("ix_narration_usage_logs_presentation_id"),
        table_name="narration_usage_logs",
    )
    op.drop_table("narration_usage_logs")
