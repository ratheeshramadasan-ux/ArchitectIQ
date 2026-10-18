
"""Enforce project environment values.

Revision ID: 77a4f812ece6
Revises: e5b2130ca6a6
"""

from collections.abc import Sequence

from alembic import op

revision: str = "77a4f812ece6"
down_revision: str | None = "e5b2130ca6a6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_check_constraint(
        "ck_project_environments_allowed_environment",
        "project_environments",
        "environment IN ('DEV', 'TEST', 'UAT', 'PROD')",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_project_environments_allowed_environment",
        "project_environments",
        type_="check",
    )
