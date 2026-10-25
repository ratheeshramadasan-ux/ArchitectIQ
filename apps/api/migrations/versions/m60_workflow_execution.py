"""Add workflow execution runs, step runs, and durable worker queues.

Revision ID: m60_workflow_execution
Revises: m50_workflow_designer
Create Date: 2026-10-25
"""
from typing import Sequence
from alembic import op

revision: str = "m60_workflow_execution"
down_revision: str | None = "m50_workflow_designer"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Workflow Runs Table
    op.execute("""
        CREATE TABLE public.workflow_runs (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
            project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
            workflow_id uuid NOT NULL REFERENCES public.workflow_definitions(id) ON DELETE CASCADE,
            workflow_version integer NOT NULL,
            environment_id uuid REFERENCES public.organization_environments(id) ON DELETE SET NULL,
            status varchar(20) NOT NULL DEFAULT 'PENDING'
                CHECK (status IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED', 'SUSPENDED')),
            trigger_type varchar(50) NOT NULL DEFAULT 'MANUAL',
            trigger_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
            execution_context jsonb NOT NULL DEFAULT '{}'::jsonb,
            started_at timestamptz,
            completed_at timestamptz,
            duration_ms integer,
            error_message text,
            retry_count integer NOT NULL DEFAULT 0,
            max_retries integer NOT NULL DEFAULT 3,
            created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
            created_by uuid REFERENCES public.users(id) ON DELETE SET NULL
        );

        CREATE INDEX ix_workflow_runs_tenant ON public.workflow_runs(tenant_id);
        CREATE INDEX ix_workflow_runs_project ON public.workflow_runs(project_id);
        CREATE INDEX ix_workflow_runs_workflow ON public.workflow_runs(workflow_id);
        CREATE INDEX ix_workflow_runs_status ON public.workflow_runs(status);
        CREATE INDEX ix_workflow_runs_created_at ON public.workflow_runs(created_at DESC);

        ALTER TABLE public.workflow_runs ENABLE ROW LEVEL SECURITY;
        CREATE POLICY workflow_runs_tenant_policy ON public.workflow_runs
            FOR ALL TO architectiq_app
            USING (tenant_id = public.architectiq_current_tenant_id())
            WITH CHECK (tenant_id = public.architectiq_current_tenant_id());

        GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_runs TO architectiq_app;
    """)

    # 2. Workflow Step Runs Table
    op.execute("""
        CREATE TABLE public.workflow_step_runs (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
            run_id uuid NOT NULL REFERENCES public.workflow_runs(id) ON DELETE CASCADE,
            node_id varchar(100) NOT NULL,
            node_type varchar(50) NOT NULL,
            status varchar(20) NOT NULL DEFAULT 'PENDING'
                CHECK (status IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'SKIPPED')),
            input_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
            output_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
            error_message text,
            retry_count integer NOT NULL DEFAULT 0,
            started_at timestamptz,
            completed_at timestamptz,
            duration_ms integer,
            created_at timestamptz NOT NULL DEFAULT clock_timestamp()
        );

        CREATE INDEX ix_step_runs_tenant ON public.workflow_step_runs(tenant_id);
        CREATE INDEX ix_step_runs_run_id ON public.workflow_step_runs(run_id);
        CREATE INDEX ix_step_runs_node_id ON public.workflow_step_runs(node_id);

        ALTER TABLE public.workflow_step_runs ENABLE ROW LEVEL SECURITY;
        CREATE POLICY workflow_step_runs_tenant_policy ON public.workflow_step_runs
            FOR ALL TO architectiq_app
            USING (tenant_id = public.architectiq_current_tenant_id())
            WITH CHECK (tenant_id = public.architectiq_current_tenant_id());

        GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_step_runs TO architectiq_app;
    """)

    # 3. Durable Worker Queues Table
    op.execute("""
        CREATE TABLE public.workflow_queues (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
            run_id uuid NOT NULL REFERENCES public.workflow_runs(id) ON DELETE CASCADE,
            queue_name varchar(100) NOT NULL DEFAULT 'default',
            priority integer NOT NULL DEFAULT 0,
            status varchar(20) NOT NULL DEFAULT 'QUEUED'
                CHECK (status IN ('QUEUED', 'PROCESSING', 'DEAD_LETTER', 'COMPLETED', 'CANCELLED')),
            locked_by varchar(100),
            locked_at timestamptz,
            lock_expires_at timestamptz,
            attempts integer NOT NULL DEFAULT 0,
            max_attempts integer NOT NULL DEFAULT 3,
            payload jsonb NOT NULL DEFAULT '{}'::jsonb,
            created_at timestamptz NOT NULL DEFAULT clock_timestamp()
        );

        CREATE INDEX ix_workflow_queues_tenant ON public.workflow_queues(tenant_id);
        CREATE INDEX ix_workflow_queues_status_prio ON public.workflow_queues(queue_name, status, priority DESC, created_at ASC);
        CREATE INDEX ix_workflow_queues_lock_expires ON public.workflow_queues(lock_expires_at);

        ALTER TABLE public.workflow_queues ENABLE ROW LEVEL SECURITY;
        CREATE POLICY workflow_queues_tenant_policy ON public.workflow_queues
            FOR ALL TO architectiq_app
            USING (tenant_id = public.architectiq_current_tenant_id())
            WITH CHECK (tenant_id = public.architectiq_current_tenant_id());

        GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_queues TO architectiq_app;
    """)


def downgrade() -> None:
    op.execute("""
        DROP POLICY IF EXISTS workflow_queues_tenant_policy ON public.workflow_queues;
        DROP TABLE IF EXISTS public.workflow_queues CASCADE;

        DROP POLICY IF EXISTS workflow_step_runs_tenant_policy ON public.workflow_step_runs;
        DROP TABLE IF EXISTS public.workflow_step_runs CASCADE;

        DROP POLICY IF EXISTS workflow_runs_tenant_policy ON public.workflow_runs;
        DROP TABLE IF EXISTS public.workflow_runs CASCADE;
    """)
