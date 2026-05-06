"""add recap_mode column to presentations

Revision ID: e2b1f4d9a6c3
Revises: c7b70d0f31b1
Create Date: 2026-05-06 14:30:00.000000

Phase 11.2b — Q3 multi-tenant prereq.

Adds a nullable VARCHAR(32) column `recap_mode` to the `presentations` table
so the recap pipeline can mark presentations with their canonical mode
(`welcome_home`, `anniversary`, `next_planning_window`) instead of relying
on title-substring heuristics. We intentionally use String(32) instead of an
Enum type for SQLite/Postgres dialect portability — the enforcement lives in
the Pydantic `RecapMode` enum at the API boundary, not at the DB layer.

The activity-feed endpoint now prefers this column when populating recap
activities, falling back to the existing title-substring matching for
legacy rows created before this migration.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "e2b1f4d9a6c3"
down_revision: Union[str, None] = "c7b70d0f31b1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "presentations",
        sa.Column("recap_mode", sa.String(length=32), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("presentations", "recap_mode")
