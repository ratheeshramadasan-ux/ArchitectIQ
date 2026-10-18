
"""Enforce folder hierarchy integrity.

Revision ID: 4ab5a219229f
Revises: 77a4f812ece6
"""

from collections.abc import Sequence

from alembic import op

revision: str = "4ab5a219229f"
down_revision: str | None = "77a4f812ece6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Allow the composite parent foreign key to reference
    # a folder ID together with its organization.
    op.create_unique_constraint(
        "uq_folders_id_organization",
        "folders",
        ["id", "organization_id"],
    )

    # Replace the original parent foreign key.
    op.drop_constraint(
        "folders_parent_folder_id_fkey",
        "folders",
        type_="foreignkey",
    )

    # Prevent cross-organization parent relationships.
    op.create_foreign_key(
        "fk_folders_parent_same_organization",
        "folders",
        "folders",
        ["parent_folder_id", "organization_id"],
        ["id", "organization_id"],
    )

    # Prevent a folder from referencing itself.
    op.create_check_constraint(
        "ck_folders_no_self_parent",
        "folders",
        "parent_folder_id IS NULL OR parent_folder_id <> id",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_folders_no_self_parent",
        "folders",
        type_="check",
    )

    op.drop_constraint(
        "fk_folders_parent_same_organization",
        "folders",
        type_="foreignkey",
    )

    op.create_foreign_key(
        "folders_parent_folder_id_fkey",
        "folders",
        "folders",
        ["parent_folder_id"],
        ["id"],
    )

    op.drop_constraint(
        "uq_folders_id_organization",
        "folders",
        type_="unique",
    )
