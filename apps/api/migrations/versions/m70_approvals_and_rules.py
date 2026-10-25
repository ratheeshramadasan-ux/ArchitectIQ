"""Add human approval tasks and deterministic business rules tables.

Revision ID: m70_approvals_and_rules
Revises: m60_workflow_execution
Create Date: 2026-10-25
"""
from typing import Sequence
from alembic import op

revision: str = "m70_approvals_and_rules"
down_revision: str | None = "m60_workflow_execution"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Approval Tasks Table
    op.execute("""
        CREATE TABLE public.approval_tasks (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
            project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
            run_id uuid REFERENCES public.workflow_runs(id) ON DELETE SET NULL,
            step_run_id uuid REFERENCES public.workflow_step_runs(id) ON DELETE SET NULL,
            title varchar(255) NOT NULL,
            description text,
            priority varchar(20) NOT NULL DEFAULT 'MEDIUM'
                CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'URGENT')),
            status varchar(20) NOT NULL DEFAULT 'PENDING'
                CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED')),
            required_role varchar(20) NOT NULL DEFAULT 'ADMIN'
                CHECK (required_role IN ('OWNER', 'ADMIN', 'EDITOR', 'VIEWER')),
            assigned_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
            resolution_notes text,
            resolved_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
            resolved_at timestamptz,
            sla_deadline timestamptz,
            payload jsonb NOT NULL DEFAULT '{}'::jsonb,
            decision_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
            created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
            created_by uuid REFERENCES public.users(id) ON DELETE SET NULL
        );

        CREATE INDEX ix_approval_tasks_tenant ON public.approval_tasks(tenant_id);
        CREATE INDEX ix_approval_tasks_project ON public.approval_tasks(project_id);
        CREATE INDEX ix_approval_tasks_run ON public.approval_tasks(run_id);
        CREATE INDEX ix_approval_tasks_status ON public.approval_tasks(status);
        CREATE INDEX ix_approval_tasks_created_at ON public.approval_tasks(created_at DESC);

        ALTER TABLE public.approval_tasks ENABLE ROW LEVEL SECURITY;
        CREATE POLICY approval_tasks_tenant_policy ON public.approval_tasks
            FOR ALL TO architectiq_app
            USING (tenant_id = public.architectiq_current_tenant_id())
            WITH CHECK (tenant_id = public.architectiq_current_tenant_id());

        GRANT SELECT, INSERT, UPDATE, DELETE ON public.approval_tasks TO architectiq_app;
    """)

    # 2. Business Rules Table
    op.execute("""
        CREATE TABLE public.business_rules (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
            project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
            name varchar(255) NOT NULL,
            slug varchar(255) NOT NULL,
            description text,
            version integer NOT NULL DEFAULT 1,
            status varchar(20) NOT NULL DEFAULT 'DRAFT'
                CHECK (status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
            rule_type varchar(50) NOT NULL DEFAULT 'DECISION_TABLE'
                CHECK (rule_type IN ('DECISION_TABLE', 'EXPRESSION', 'POLICY_MATRIX')),
            conditions_schema jsonb NOT NULL DEFAULT '[]'::jsonb,
            actions_schema jsonb NOT NULL DEFAULT '[]'::jsonb,
            created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
            updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
            created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
            CONSTRAINT uq_business_rule_project_slug UNIQUE (project_id, slug)
        );

        CREATE INDEX ix_business_rules_tenant ON public.business_rules(tenant_id);
        CREATE INDEX ix_business_rules_project ON public.business_rules(project_id);

        ALTER TABLE public.business_rules ENABLE ROW LEVEL SECURITY;
        CREATE POLICY business_rules_tenant_policy ON public.business_rules
            FOR ALL TO architectiq_app
            USING (tenant_id = public.architectiq_current_tenant_id())
            WITH CHECK (tenant_id = public.architectiq_current_tenant_id());

        GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_rules TO architectiq_app;
    """)


def downgrade() -> None:
    op.execute("""
        DROP POLICY IF EXISTS business_rules_tenant_policy ON public.business_rules;
        DROP TABLE IF EXISTS public.business_rules CASCADE;

        DROP POLICY IF EXISTS approval_tasks_tenant_policy ON public.approval_tasks;
        DROP TABLE IF EXISTS public.approval_tasks CASCADE;
    """)
