"""add restricted external identity resolver

Revision ID: 9376adb6347c
Revises: d86fd4e88ca7
Create Date: 2026-10-19 14:51:55.451551

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9376adb6347c'
down_revision: Union[str, Sequence[str], None] = 'd86fd4e88ca7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create restricted external identity resolution."""

    # Permit the function owner to read only the required identity data.
    op.execute("""
        GRANT SELECT ON TABLE public.user_external_identities
        TO architectiq_iam_owner
    """)

    # Resolve only registered identities belonging to active users.
    op.execute("""
        CREATE FUNCTION public.architectiq_resolve_external_identity(
            p_issuer text,
            p_subject text
        )
        RETURNS uuid
        LANGUAGE sql
        STABLE
        SECURITY DEFINER
        SET search_path = pg_catalog, pg_temp
        AS $function$
            SELECT u.id
            FROM public.user_external_identities AS i
            JOIN public.users AS u
                ON u.id = i.user_id
            WHERE i.issuer = p_issuer
              AND i.subject = p_subject
              AND u.status = 'ACTIVE'
              AND p_issuer IS NOT NULL
              AND p_subject IS NOT NULL
              AND length(p_issuer) > 0
              AND length(p_subject) > 0
        $function$
    """)

    # Remove default PUBLIC execution privileges first.
    op.execute("""
        REVOKE ALL ON FUNCTION
        public.architectiq_resolve_external_identity(text, text)
        FROM PUBLIC
    """)

    # Transfer ownership to the restricted IAM function owner.
    op.execute("""
        ALTER FUNCTION public.architectiq_resolve_external_identity(
            text, text
        ) OWNER TO architectiq_iam_owner
    """)

    op.execute("""
        GRANT EXECUTE ON FUNCTION
        public.architectiq_resolve_external_identity(text, text)
        TO architectiq_iam
    """)


def downgrade() -> None:
    """Remove restricted external identity resolution."""

    op.execute("""
        DROP FUNCTION IF EXISTS
        public.architectiq_resolve_external_identity(text, text)
    """)

    op.execute("""
        REVOKE SELECT ON TABLE public.user_external_identities
        FROM architectiq_iam_owner
    """)
