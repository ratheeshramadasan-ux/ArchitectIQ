"""Add AI agents, model gateway invocations, and agent evaluation tables.

Revision ID: m80_agent_gateway
Revises: m70_approvals_and_rules
Create Date: 2026-10-25
"""
from typing import Sequence
from alembic import op

revision: str = "m80_agent_gateway"
down_revision: str | None = "m70_approvals_and_rules"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. AI Agents Table
    op.execute("""
        CREATE TABLE public.ai_agents (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
            project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
            name varchar(120) NOT NULL,
            slug varchar(120) NOT NULL,
            description text,
            system_prompt text NOT NULL,
            model_provider varchar(40) NOT NULL DEFAULT 'ollama',
            model_name varchar(100) NOT NULL DEFAULT 'qwen3-coder:30b',
            temperature numeric(3, 2) NOT NULL DEFAULT 0.70,
            max_tokens integer NOT NULL DEFAULT 4096,
            tools_config jsonb NOT NULL DEFAULT '[]'::jsonb,
            budget_limit_usd numeric(10, 4) NOT NULL DEFAULT 100.0000,
            status varchar(30) NOT NULL DEFAULT 'ACTIVE'
                CHECK (status IN ('ACTIVE', 'DRAFT', 'ARCHIVED')),
            created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
            updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
            CONSTRAINT ai_agents_tenant_project_slug_key UNIQUE (tenant_id, project_id, slug)
        );
        CREATE INDEX idx_ai_agents_tenant_project ON public.ai_agents(tenant_id, project_id);
    """)

    # 2. AI Agent Invocations Table
    op.execute("""
        CREATE TABLE public.ai_agent_invocations (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
            project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
            agent_id uuid NOT NULL REFERENCES public.ai_agents(id) ON DELETE CASCADE,
            caller_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
            input_prompt text NOT NULL,
            output_text text,
            model_used varchar(100) NOT NULL,
            prompt_tokens integer NOT NULL DEFAULT 0,
            completion_tokens integer NOT NULL DEFAULT 0,
            total_tokens integer NOT NULL DEFAULT 0,
            estimated_cost_usd numeric(10, 6) NOT NULL DEFAULT 0.000000,
            duration_ms integer NOT NULL DEFAULT 0,
            status varchar(30) NOT NULL DEFAULT 'SUCCESS'
                CHECK (status IN ('SUCCESS', 'FAILED', 'BUDGET_EXCEEDED')),
            error_message text,
            created_at timestamptz NOT NULL DEFAULT clock_timestamp()
        );
        CREATE INDEX idx_ai_agent_invocations_tenant_agent ON public.ai_agent_invocations(tenant_id, agent_id);
    """)

    # 3. AI Agent Evaluations Table
    op.execute("""
        CREATE TABLE public.ai_agent_evaluations (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
            project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
            agent_id uuid NOT NULL REFERENCES public.ai_agents(id) ON DELETE CASCADE,
            eval_name varchar(120) NOT NULL,
            test_cases jsonb NOT NULL DEFAULT '[]'::jsonb,
            results jsonb NOT NULL DEFAULT '{}'::jsonb,
            pass_rate numeric(5, 2) NOT NULL DEFAULT 0.00,
            created_at timestamptz NOT NULL DEFAULT clock_timestamp()
        );
        CREATE INDEX idx_ai_agent_evaluations_tenant_agent ON public.ai_agent_evaluations(tenant_id, agent_id);
    """)

    # 4. Enable Row Level Security & Apply Tenant Policies
    op.execute("""
        ALTER TABLE public.ai_agents ENABLE ROW LEVEL SECURITY;
        CREATE POLICY ai_agents_tenant_policy ON public.ai_agents
            FOR ALL TO architectiq_app
            USING (tenant_id = public.architectiq_current_tenant_id())
            WITH CHECK (tenant_id = public.architectiq_current_tenant_id());

        ALTER TABLE public.ai_agent_invocations ENABLE ROW LEVEL SECURITY;
        CREATE POLICY ai_agent_invocations_tenant_policy ON public.ai_agent_invocations
            FOR ALL TO architectiq_app
            USING (tenant_id = public.architectiq_current_tenant_id())
            WITH CHECK (tenant_id = public.architectiq_current_tenant_id());

        ALTER TABLE public.ai_agent_evaluations ENABLE ROW LEVEL SECURITY;
        CREATE POLICY ai_agent_evaluations_tenant_policy ON public.ai_agent_evaluations
            FOR ALL TO architectiq_app
            USING (tenant_id = public.architectiq_current_tenant_id())
            WITH CHECK (tenant_id = public.architectiq_current_tenant_id());
    """)

    # 5. IAM Grants for architectiq_app
    op.execute("""
        GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_agents TO architectiq_app;
        GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_agent_invocations TO architectiq_app;
        GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_agent_evaluations TO architectiq_app;
    """)


def downgrade() -> None:
    op.execute("""
        DROP POLICY IF EXISTS ai_agent_evaluations_tenant_policy ON public.ai_agent_evaluations;
        DROP TABLE IF EXISTS public.ai_agent_evaluations CASCADE;

        DROP POLICY IF EXISTS ai_agent_invocations_tenant_policy ON public.ai_agent_invocations;
        DROP TABLE IF EXISTS public.ai_agent_invocations CASCADE;

        DROP POLICY IF EXISTS ai_agents_tenant_policy ON public.ai_agents;
        DROP TABLE IF EXISTS public.ai_agents CASCADE;
    """)
