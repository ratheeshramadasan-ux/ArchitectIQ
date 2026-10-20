"""add secure IAM membership verification function

Revision ID: 1b9623dcbb26
Revises: c62a4fca77b9
Create Date: 2026-10-18 13:40:18.583038

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '1b9623dcbb26'
down_revision: Union[str, Sequence[str], None] = 'c62a4fca77b9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create the restricted IAM membership verification function."""

    # Establish the function owner before creating the function.
    # All operations run within Alembic's PostgreSQL DDL transaction.
    op.execute("""
        CREATE FUNCTION public.architectiq_verify_tenant_membership(
            p_user_id uuid,
            p_tenant_id uuid
        )
        RETURNS boolean
        LANGUAGE sql
        STABLE
        SECURITY DEFINER
        SET search_path = pg_catalog, pg_temp
        AS $function$
            SELECT EXISTS (
                SELECT 1
                FROM public.users AS u
                JOIN public.tenant_memberships AS tm
                  ON tm.user_id = u.id
                WHERE u.id = p_user_id
                  AND u.status = 'ACTIVE'
                  AND tm.tenant_id = p_tenant_id
                  AND tm.status = 'ACTIVE'
            );
        $function$;
    """)

    op.execute("""
        ALTER FUNCTION public.architectiq_verify_tenant_membership(
            uuid, uuid
        ) OWNER TO architectiq_iam_owner;
    """)

    op.execute("""
        REVOKE ALL ON FUNCTION
            public.architectiq_verify_tenant_membership(uuid, uuid)
        FROM PUBLIC;
    """)

    op.execute("""
        GRANT EXECUTE ON FUNCTION
            public.architectiq_verify_tenant_membership(uuid, uuid)
        TO architectiq_iam;
    """)


def downgrade() -> None:
    """Remove the IAM membership verification function."""

    op.execute("""
        DROP FUNCTION public.architectiq_verify_tenant_membership(
            uuid, uuid
        );
    """)
