"""Add project memberships with database-enforced tenant consistency and RLS.

Revision ID: m41_project_memberships
Revises: m32_hierarchy_read_grants
"""

from collections.abc import Sequence
from alembic import op

revision: str = "m41_project_memberships"
down_revision: str | Sequence[str] | None = "m32_hierarchy_read_grants"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 0. Least-privilege grants:
    # - IAM owner requires SELECT on users and tenant_memberships to execute SECURITY DEFINER routines.
    # - Application runtime receives column-level SELECT on non-sensitive user metadata only.
    # - Application runtime receives EXECUTE on membership verification function, shielding tenant_memberships.
    op.execute("""
        GRANT SELECT ON TABLE public.users, public.tenant_memberships TO architectiq_iam_owner;
        GRANT SELECT (id, display_name, status) ON TABLE public.users TO architectiq_app;
        GRANT EXECUTE ON FUNCTION public.architectiq_verify_tenant_membership(uuid, uuid) TO architectiq_app;
    """)

    # 1. Deterministic table creation (no IF NOT EXISTS)
    op.execute("""
        CREATE TABLE public.project_memberships (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
            project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
            user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
            role varchar(20) NOT NULL,
            created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
            granted_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
            CONSTRAINT ck_project_memberships_role CHECK (role IN ('OWNER', 'ADMIN', 'EDITOR', 'VIEWER')),
            CONSTRAINT uq_project_memberships_project_user UNIQUE (project_id, user_id),
            CONSTRAINT fk_project_memberships_tenant_user FOREIGN KEY (user_id, tenant_id)
                REFERENCES public.tenant_memberships(user_id, tenant_id) ON DELETE CASCADE
        );
    """)

    # 2. Hardened SECURITY DEFINER trigger with restricted search_path (pg_catalog, pg_temp)
    # Handles both INSERT and UPDATE with immutability guarantees on project, tenant, and user.
    op.execute("""
        CREATE OR REPLACE FUNCTION public.architectiq_enforce_project_membership_tenant()
        RETURNS trigger AS $$
        DECLARE
            project_tenant_id uuid;
        BEGIN
            IF TG_OP = 'UPDATE' THEN
                IF NEW.project_id <> OLD.project_id OR NEW.user_id <> OLD.user_id OR NEW.tenant_id <> OLD.tenant_id THEN
                    RAISE EXCEPTION 'Cannot reassign project_id, user_id, or tenant_id on existing project membership';
                END IF;
            END IF;

            SELECT o.tenant_id INTO project_tenant_id
            FROM public.projects p
            JOIN public.folders f ON f.id = p.folder_id
            JOIN public.organizations o ON o.id = f.organization_id
            WHERE p.id = NEW.project_id;

            IF project_tenant_id IS NULL THEN
                RAISE EXCEPTION 'Project % does not exist or has no tenant', NEW.project_id;
            END IF;

            IF NEW.tenant_id <> project_tenant_id THEN
                RAISE EXCEPTION 'Cross-tenant project membership violation: user tenant % != project tenant %',
                    NEW.tenant_id, project_tenant_id;
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM public.tenant_memberships tm
                WHERE tm.user_id = NEW.user_id
                  AND tm.tenant_id = NEW.tenant_id
                  AND tm.status = 'ACTIVE'
            ) THEN
                RAISE EXCEPTION 'User % is not an active member of tenant %', NEW.user_id, NEW.tenant_id;
            END IF;

            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp;
    """)

    op.execute("""
        CREATE TRIGGER trg_enforce_project_membership_tenant
        BEFORE INSERT OR UPDATE ON public.project_memberships
        FOR EACH ROW
        EXECUTE FUNCTION public.architectiq_enforce_project_membership_tenant();
    """)

    # 3. Enable and configure Row-Level Security (RLS) for runtime role
    op.execute("ALTER TABLE public.project_memberships ENABLE ROW LEVEL SECURITY;")

    op.execute("""
        CREATE POLICY project_memberships_select_policy
        ON public.project_memberships
        FOR SELECT
        TO architectiq_app
        USING (
            tenant_id = public.architectiq_current_tenant_id()
        );
    """)

    op.execute("""
        CREATE POLICY project_memberships_insert_policy
        ON public.project_memberships
        FOR INSERT
        TO architectiq_app
        WITH CHECK (
            tenant_id = public.architectiq_current_tenant_id()
        );
    """)

    op.execute("""
        CREATE POLICY project_memberships_update_policy
        ON public.project_memberships
        FOR UPDATE
        TO architectiq_app
        USING (
            tenant_id = public.architectiq_current_tenant_id()
        )
        WITH CHECK (
            tenant_id = public.architectiq_current_tenant_id()
        );
    """)

    op.execute("""
        CREATE POLICY project_memberships_delete_policy
        ON public.project_memberships
        FOR DELETE
        TO architectiq_app
        USING (
            tenant_id = public.architectiq_current_tenant_id()
        );
    """)

    # 4. Grant runtime permissions to architectiq_app
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_memberships TO architectiq_app;")


def downgrade() -> None:
    op.execute("REVOKE SELECT, INSERT, UPDATE, DELETE ON public.project_memberships FROM architectiq_app;")
    op.execute("DROP POLICY IF EXISTS project_memberships_delete_policy ON public.project_memberships;")
    op.execute("DROP POLICY IF EXISTS project_memberships_update_policy ON public.project_memberships;")
    op.execute("DROP POLICY IF EXISTS project_memberships_insert_policy ON public.project_memberships;")
    op.execute("DROP POLICY IF EXISTS project_memberships_select_policy ON public.project_memberships;")
    op.execute("DROP TRIGGER IF EXISTS trg_enforce_project_membership_tenant ON public.project_memberships;")
    op.execute("DROP FUNCTION IF EXISTS public.architectiq_enforce_project_membership_tenant();")
    op.execute("DROP TABLE IF EXISTS public.project_memberships;")
    op.execute("REVOKE EXECUTE ON FUNCTION public.architectiq_verify_tenant_membership(uuid, uuid) FROM architectiq_app;")
    op.execute("REVOKE SELECT (id, display_name, status) ON TABLE public.users FROM architectiq_app;")
    op.execute("REVOKE SELECT ON TABLE public.users, public.tenant_memberships FROM architectiq_iam_owner;")
