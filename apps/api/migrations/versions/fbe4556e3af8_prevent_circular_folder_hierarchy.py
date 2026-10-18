
"""Prevent circular folder hierarchies.

Revision ID: fbe4556e3af8
Revises: 4ab5a219229f
"""

from collections.abc import Sequence

from alembic import op

revision: str = "fbe4556e3af8"
down_revision: str | None = "4ab5a219229f"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        CREATE FUNCTION architectiq_prevent_folder_cycle()
        RETURNS trigger
        LANGUAGE plpgsql
        AS $$
        DECLARE
            cycle_found boolean;
        BEGIN
            -- Serialize folder hierarchy changes within an organization.
            -- Locking the organization row also coordinates transactions
            -- without relying on advisory-lock hash collisions.
            PERFORM 1
            FROM organizations
            WHERE id = NEW.organization_id
            FOR UPDATE;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Folder organization does not exist'
                    USING ERRCODE = '23503';
            END IF;

            IF NEW.parent_folder_id IS NULL THEN
                RETURN NEW;
            END IF;

            IF NEW.parent_folder_id = NEW.id THEN
                RAISE EXCEPTION 'A folder cannot be its own parent'
                    USING ERRCODE = '23514';
            END IF;

            -- Walk upward from the proposed parent.
            -- If the current folder is encountered, the change
            -- would create a circular hierarchy.
            WITH RECURSIVE ancestors(id, parent_folder_id, path) AS (
                SELECT
                    f.id,
                    f.parent_folder_id,
                    ARRAY[f.id]
                FROM folders AS f
                WHERE f.id = NEW.parent_folder_id
                  AND f.organization_id = NEW.organization_id

                UNION ALL

                SELECT
                    f.id,
                    f.parent_folder_id,
                    a.path || f.id
                FROM folders AS f
                JOIN ancestors AS a
                  ON f.id = a.parent_folder_id
                WHERE f.organization_id = NEW.organization_id
                  AND NOT f.id = ANY(a.path)
            )
            SELECT EXISTS (
                SELECT 1
                FROM ancestors
                WHERE id = NEW.id
            )
            INTO cycle_found;

            IF cycle_found THEN
                RAISE EXCEPTION
                    'Circular folder hierarchy is not allowed'
                    USING ERRCODE = '23514';
            END IF;

            RETURN NEW;
        END;
        $$;
        """
    )

    op.execute(
        """
        CREATE TRIGGER trg_folders_prevent_cycle
        BEFORE INSERT OR UPDATE OF parent_folder_id, organization_id
        ON folders
        FOR EACH ROW
        EXECUTE FUNCTION architectiq_prevent_folder_cycle();
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DROP TRIGGER IF EXISTS trg_folders_prevent_cycle
        ON folders;
        """
    )

    op.execute(
        """
        DROP FUNCTION IF EXISTS architectiq_prevent_folder_cycle();
        """
    )
