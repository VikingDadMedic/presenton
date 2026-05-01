"""add is_public column to presentations

Revision ID: 4b7f8e2c1d9a
Revises: 9d2f4f8429de
Create Date: 2026-04-29 20:35:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "4b7f8e2c1d9a"
down_revision: Union[str, None] = "9d2f4f8429de"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "presentations",
        sa.Column(
            "is_public",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )


def downgrade() -> None:
    op.drop_column("presentations", "is_public")
