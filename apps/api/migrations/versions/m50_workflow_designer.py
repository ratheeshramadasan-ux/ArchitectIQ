"""Add workflow definitions and versioned schemas.

Revision ID: m50_workflow_designer
Revises: m43_environment_promotions
Create Date: 2026-10-25
"""
from typing import Sequence
from alembic import op

revision: str = "m50_workflow_designer"
down_revision: str | None = "m43_environment_promotions"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Workflow definitions table
    op.execute("""
        CREATE TABLE public.workflow_definitions (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
            project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
            name varchar(255) NOT NULL,
            slug varchar(255) NOT NULL,
            description text,
            current_version integer NOT NULL DEFAULT 1,
            status varchar(20) NOT NULL DEFAULT 'DRAFT'
                CHECK (status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
            created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
            updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
            created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
            CONSTRAINT uq_workflow_project_slug UNIQUE (project_id, slug)
        );

        CREATE INDEX ix_workflow_defs_project ON public.workflow_definitions(project_id);
        CREATE INDEX ix_workflow_defs_tenant ON public.workflow_definitions(tenant_id);

        ALTER TABLE public.workflow_definitions ENABLE ROW LEVEL SECURITY;
        CREATE POLICY workflow_defs_tenant_policy ON public.workflow_definitions
            FOR ALL TO architectiq_app
            USING (tenant_id = public.architectiq_current_tenant_id())
            WITH CHECK (tenant_id = public.architectiq_current_tenant_id());

        GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_definitions TO architectiq_app;
    """)

    # 2. Workflow versions table
    op.execute("""
        CREATE TABLE public.workflow_versions (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
            workflow_id uuid NOT NULL REFERENCES public.workflow_definitions(id) ON DELETE CASCADE,
            version integer NOT NULL,
            definition jsonb NOT NULL DEFAULT '{"nodes": [], "edges": [], "variables": [], "metadata": {}}'::jsonb,
            status varchar(20) NOT NULL DEFAULT 'DRAFT'
                CHECK (status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
            change_summary text,
            created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
            created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
            CONSTRAINT uq_workflow_version UNIQUE (workflow_id, version)
        );

        CREATE INDEX ix_workflow_versions_wf ON public.workflow_versions(workflow_id, version DESC);
        CREATE INDEX ix_workflow_versions_tenant ON public.workflow_versions(tenant_id);

        ALTER TABLE public.workflow_versions ENABLE ROW LEVEL SECURITY;
        CREATE POLICY workflow_versions_tenant_policy ON public.workflow_versions
            FOR ALL TO architectiq_app
            USING (tenant_id = public.architectiq_current_tenant_id())
            WITH CHECK (tenant_id = public.architectiq_current_tenant_id());

        GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_versions TO architectiq_app;
    """)


def downgrade() -> None:
    op.execute("""
        DROP POLICY IF EXISTS workflow_versions_tenant_policy ON public.workflow_versions;
        REVOKE ALL ON public.workflow_versions FROM architectiq_app;
        DROP TABLE IF EXISTS public.workflow_versions;

        DROP POLICY IF EXISTS workflow_defs_tenant_policy ON public.workflow_definitions;
        REVOKE ALL ON public.workflow_definitions FROM architectiq_app;
        DROP TABLE IF EXISTS public.workflow_definitions;
    """)
