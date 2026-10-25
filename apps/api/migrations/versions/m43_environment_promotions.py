"""Add project environment bindings and promotion governance.

Revision ID: m43_environment_promotions
Revises: m42_project_lifecycle
Create Date: 2026-10-25
"""
from typing import Sequence
from alembic import op

revision: str = "m43_environment_promotions"
down_revision: str | None = "m42_project_lifecycle"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Project environment bindings table
    op.execute("""
        CREATE TABLE public.project_environment_bindings (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
            project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
            environment_id uuid NOT NULL REFERENCES public.organization_environments(id) ON DELETE CASCADE,
            config_overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
            is_enabled boolean NOT NULL DEFAULT true,
            created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
            updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
            CONSTRAINT uq_project_env_binding UNIQUE (project_id, environment_id)
        );

        CREATE INDEX ix_project_env_bindings_proj ON public.project_environment_bindings(project_id);
        CREATE INDEX ix_project_env_bindings_tenant ON public.project_environment_bindings(tenant_id);

        ALTER TABLE public.project_environment_bindings ENABLE ROW LEVEL SECURITY;
        CREATE POLICY project_env_bindings_tenant_policy ON public.project_environment_bindings
            FOR ALL TO architectiq_app
            USING (tenant_id = public.architectiq_current_tenant_id())
            WITH CHECK (tenant_id = public.architectiq_current_tenant_id());

        GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_environment_bindings TO architectiq_app;
    """)

    # 2. Promotion requests table
    op.execute("""
        CREATE TABLE public.promotion_requests (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
            project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
            source_environment_id uuid NOT NULL REFERENCES public.organization_environments(id) ON DELETE CASCADE,
            target_environment_id uuid NOT NULL REFERENCES public.organization_environments(id) ON DELETE CASCADE,
            status varchar(20) NOT NULL DEFAULT 'PENDING'
                CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'EXECUTED', 'CANCELLED')),
            requested_by uuid NOT NULL REFERENCES public.users(id),
            reviewed_by uuid REFERENCES public.users(id),
            notes text,
            review_notes text,
            drift_detected boolean NOT NULL DEFAULT false,
            drift_details jsonb NOT NULL DEFAULT '{}'::jsonb,
            created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
            reviewed_at timestamptz,
            executed_at timestamptz
        );

        CREATE INDEX ix_promotion_requests_project ON public.promotion_requests(project_id, created_at DESC);
        CREATE INDEX ix_promotion_requests_tenant ON public.promotion_requests(tenant_id);

        ALTER TABLE public.promotion_requests ENABLE ROW LEVEL SECURITY;
        CREATE POLICY promotion_requests_tenant_policy ON public.promotion_requests
            FOR ALL TO architectiq_app
            USING (tenant_id = public.architectiq_current_tenant_id())
            WITH CHECK (tenant_id = public.architectiq_current_tenant_id());

        GRANT SELECT, INSERT, UPDATE ON public.promotion_requests TO architectiq_app;
    """)


def downgrade() -> None:
    op.execute("""
        DROP POLICY IF EXISTS promotion_requests_tenant_policy ON public.promotion_requests;
        REVOKE ALL ON public.promotion_requests FROM architectiq_app;
        DROP TABLE IF EXISTS public.promotion_requests;

        DROP POLICY IF EXISTS project_env_bindings_tenant_policy ON public.project_environment_bindings;
        REVOKE ALL ON public.project_environment_bindings FROM architectiq_app;
        DROP TABLE IF EXISTS public.project_environment_bindings;
    """)
