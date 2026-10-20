"""Enable tenant row-level security.

Revision ID: 6780bf6d7862
Revises: fbe4556e3af8
"""

from collections.abc import Sequence

from alembic import op

revision: str = "6780bf6d7862"
down_revision: str | Sequence[str] | None = "fbe4556e3af8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


TABLES = (
    "tenants",
    "organizations",
    "folders",
    "projects",
    "project_environments",
)


def upgrade() -> None:
    """Enable tenant-scoped read access."""

    # Missing or empty tenant context evaluates to NULL.
    # Comparisons against NULL do not authorize a row.
    op.execute("""
        CREATE FUNCTION public.architectiq_current_tenant_id()
        RETURNS uuid
        LANGUAGE sql
        STABLE
        AS $$
            SELECT NULLIF(
                current_setting('architectiq.tenant_id', true),
                ''
            )::uuid
        $$;
    """)

    for table in TABLES:
        op.execute(
            f"ALTER TABLE public.{table} ENABLE ROW LEVEL SECURITY"
        )

    op.execute("""
        CREATE POLICY tenants_select_policy
        ON public.tenants
        FOR SELECT
        TO architectiq_app
        USING (
            id = public.architectiq_current_tenant_id()
        );
    """)

    op.execute("""
        CREATE POLICY organizations_select_policy
        ON public.organizations
        FOR SELECT
        TO architectiq_app
        USING (
            tenant_id = public.architectiq_current_tenant_id()
        );
    """)

    op.execute("""
        CREATE POLICY folders_select_policy
        ON public.folders
        FOR SELECT
        TO architectiq_app
        USING (
            EXISTS (
                SELECT 1
                FROM public.organizations o
                WHERE o.id = folders.organization_id
                  AND o.tenant_id =
                      public.architectiq_current_tenant_id()
            )
        );
    """)

    op.execute("""
        CREATE POLICY projects_select_policy
        ON public.projects
        FOR SELECT
        TO architectiq_app
        USING (
            EXISTS (
                SELECT 1
                FROM public.folders f
                WHERE f.id = projects.folder_id
            )
        );
    """)

    op.execute("""
        CREATE POLICY project_environments_select_policy
        ON public.project_environments
        FOR SELECT
        TO architectiq_app
        USING (
            EXISTS (
                SELECT 1
                FROM public.projects p
                WHERE p.id = project_environments.project_id
            )
        );
    """)


def downgrade() -> None:
    """Remove tenant RLS policies."""

    for table, policy in (
        ("project_environments", "project_environments_select_policy"),
        ("projects", "projects_select_policy"),
        ("folders", "folders_select_policy"),
        ("organizations", "organizations_select_policy"),
        ("tenants", "tenants_select_policy"),
    ):
        op.execute(
            f"DROP POLICY IF EXISTS {policy} ON public.{table}"
        )

    for table in reversed(TABLES):
        op.execute(
            f"ALTER TABLE public.{table} DISABLE ROW LEVEL SECURITY"
        )

    op.execute(
        "DROP FUNCTION IF EXISTS public.architectiq_current_tenant_id()"
    )