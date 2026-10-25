"""Add project lifecycle status and governance metadata.

Revision ID: m42_project_lifecycle
Revises: m41_project_memberships
Create Date: 2026-10-25
"""
from typing import Sequence
from alembic import op

revision: str = "m42_project_lifecycle"
down_revision: str | None = "m41_project_memberships"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE public.projects
            ADD COLUMN lifecycle_status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
            ADD COLUMN description TEXT,
            ADD COLUMN tags JSONB NOT NULL DEFAULT '[]'::jsonb,
            ADD COLUMN criticality VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
            ADD COLUMN data_classification VARCHAR(20) NOT NULL DEFAULT 'INTERNAL',
            ADD COLUMN cost_center VARCHAR(100),
            ADD COLUMN archived_at TIMESTAMPTZ,
            ADD COLUMN archived_by UUID REFERENCES public.users(id) ON DELETE SET NULL;

        ALTER TABLE public.projects
            ADD CONSTRAINT ck_projects_lifecycle_status
            CHECK (lifecycle_status IN ('ACTIVE', 'ARCHIVED', 'SUSPENDED'));

        ALTER TABLE public.projects
            ADD CONSTRAINT ck_projects_criticality
            CHECK (criticality IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'));

        ALTER TABLE public.projects
            ADD CONSTRAINT ck_projects_data_classification
            CHECK (data_classification IN ('PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED'));

        CREATE INDEX ix_projects_lifecycle_status ON public.projects(lifecycle_status);

        GRANT DELETE ON public.folders TO architectiq_app;
        CREATE POLICY folders_delete_policy ON public.folders FOR DELETE TO architectiq_app
            USING (EXISTS (
                SELECT 1 FROM public.organizations o
                WHERE o.id = organization_id
                  AND o.tenant_id = public.architectiq_current_tenant_id()
            ));
    """)


def downgrade() -> None:
    op.execute("""
        DROP POLICY IF EXISTS folders_delete_policy ON public.folders;
        REVOKE DELETE ON public.folders FROM architectiq_app;

        DROP INDEX IF EXISTS public.ix_projects_lifecycle_status;
        ALTER TABLE public.projects
            DROP CONSTRAINT IF EXISTS ck_projects_data_classification,
            DROP CONSTRAINT IF EXISTS ck_projects_criticality,
            DROP CONSTRAINT IF EXISTS ck_projects_lifecycle_status,
            DROP COLUMN IF EXISTS archived_by,
            DROP COLUMN IF EXISTS archived_at,
            DROP COLUMN IF EXISTS cost_center,
            DROP COLUMN IF EXISTS data_classification,
            DROP COLUMN IF EXISTS criticality,
            DROP COLUMN IF EXISTS tags,
            DROP COLUMN IF EXISTS description,
            DROP COLUMN IF EXISTS lifecycle_status;
    """)
