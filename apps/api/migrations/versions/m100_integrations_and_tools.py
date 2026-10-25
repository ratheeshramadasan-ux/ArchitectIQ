"""Add credentials vault references, connectors, integration tools, and project templates tables.

Revision ID: m100_integrations_and_tools
Revises: m90_document_ai
Create Date: 2026-10-25
"""
from typing import Sequence
from alembic import op

revision: str = "m100_integrations_and_tools"
down_revision: str | None = "m90_document_ai"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Credential References Table (Vault / Secrets Manager bindings)
    op.execute("""
        CREATE TABLE public.credential_references (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
            name varchar(120) NOT NULL,
            vault_provider varchar(40) NOT NULL DEFAULT 'INTERNAL_ENCRYPTED'
                CHECK (vault_provider IN ('VAULT', 'AWS_SECRETS_MANAGER', 'AZURE_KEY_VAULT', 'CYBERARK', 'INTERNAL_ENCRYPTED')),
            vault_path varchar(255) NOT NULL,
            secret_key varchar(120) NOT NULL,
            environment varchar(10) NOT NULL DEFAULT 'DEV'
                CHECK (environment IN ('DEV', 'TEST', 'UAT', 'PROD')),
            masked_preview varchar(60) NOT NULL DEFAULT '********',
            status varchar(20) NOT NULL DEFAULT 'ACTIVE'
                CHECK (status IN ('ACTIVE', 'EXPIRED', 'ROTATING')),
            created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
            updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
        );
        CREATE INDEX idx_credential_references_tenant_env ON public.credential_references(tenant_id, environment);
    """)

    # 2. Connectors Table (REST, GraphQL, Message Brokers)
    op.execute("""
        CREATE TABLE public.connectors (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
            project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
            credential_id uuid REFERENCES public.credential_references(id) ON DELETE SET NULL,
            name varchar(120) NOT NULL,
            slug varchar(120) NOT NULL,
            connector_type varchar(30) NOT NULL DEFAULT 'REST'
                CHECK (connector_type IN ('REST', 'GRAPHQL', 'DATABASE', 'KAFKA', 'WEBHOOK')),
            base_url varchar(500) NOT NULL,
            auth_type varchar(30) NOT NULL DEFAULT 'API_KEY'
                CHECK (auth_type IN ('NONE', 'API_KEY', 'BEARER_TOKEN', 'BASIC', 'OAUTH2', 'VAULT_REFERENCE')),
            headers_template jsonb NOT NULL DEFAULT '{}'::jsonb,
            timeout_seconds integer NOT NULL DEFAULT 30,
            status varchar(20) NOT NULL DEFAULT 'ACTIVE'
                CHECK (status IN ('ACTIVE', 'INACTIVE', 'MAINTENANCE')),
            created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
            updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
            CONSTRAINT uq_connectors_project_slug UNIQUE (project_id, slug)
        );
        CREATE INDEX idx_connectors_tenant_project ON public.connectors(tenant_id, project_id);
    """)

    # 3. Integration Tools Table (Governed Agent & Workflow Tools)
    op.execute("""
        CREATE TABLE public.integration_tools (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
            project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
            connector_id uuid NOT NULL REFERENCES public.connectors(id) ON DELETE CASCADE,
            name varchar(120) NOT NULL,
            slug varchar(120) NOT NULL,
            description text,
            method varchar(10) NOT NULL DEFAULT 'POST'
                CHECK (method IN ('GET', 'POST', 'PUT', 'DELETE', 'PATCH')),
            endpoint_path varchar(255) NOT NULL DEFAULT '/',
            parameters_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
            response_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
            rate_limit_per_minute integer NOT NULL DEFAULT 60,
            is_governed boolean NOT NULL DEFAULT true,
            created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
            updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
            CONSTRAINT uq_integration_tools_project_slug UNIQUE (project_id, slug)
        );
        CREATE INDEX idx_integration_tools_tenant_project ON public.integration_tools(tenant_id, project_id);
    """)

    # 4. Project Templates Table (WS-04: Packaging, Import/Export & Cloning)
    op.execute("""
        CREATE TABLE public.project_templates (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
            name varchar(120) NOT NULL,
            slug varchar(120) NOT NULL,
            category varchar(60) NOT NULL DEFAULT 'AUTOMATION',
            package_bundle jsonb NOT NULL DEFAULT '{}'::jsonb,
            created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
            CONSTRAINT uq_project_templates_tenant_slug UNIQUE (tenant_id, slug)
        );
        CREATE INDEX idx_project_templates_tenant ON public.project_templates(tenant_id);
    """)

    # 5. Enable Row Level Security & Apply Tenant Policies
    op.execute("""
        ALTER TABLE public.credential_references ENABLE ROW LEVEL SECURITY;
        CREATE POLICY credential_references_tenant_policy ON public.credential_references
            FOR ALL TO architectiq_app
            USING (tenant_id = public.architectiq_current_tenant_id())
            WITH CHECK (tenant_id = public.architectiq_current_tenant_id());

        ALTER TABLE public.connectors ENABLE ROW LEVEL SECURITY;
        CREATE POLICY connectors_tenant_policy ON public.connectors
            FOR ALL TO architectiq_app
            USING (tenant_id = public.architectiq_current_tenant_id())
            WITH CHECK (tenant_id = public.architectiq_current_tenant_id());

        ALTER TABLE public.integration_tools ENABLE ROW LEVEL SECURITY;
        CREATE POLICY integration_tools_tenant_policy ON public.integration_tools
            FOR ALL TO architectiq_app
            USING (tenant_id = public.architectiq_current_tenant_id())
            WITH CHECK (tenant_id = public.architectiq_current_tenant_id());

        ALTER TABLE public.project_templates ENABLE ROW LEVEL SECURITY;
        CREATE POLICY project_templates_tenant_policy ON public.project_templates
            FOR ALL TO architectiq_app
            USING (tenant_id = public.architectiq_current_tenant_id())
            WITH CHECK (tenant_id = public.architectiq_current_tenant_id());
    """)

    # 6. IAM Grants for architectiq_app
    op.execute("""
        GRANT SELECT, INSERT, UPDATE, DELETE ON public.credential_references TO architectiq_app;
        GRANT SELECT, INSERT, UPDATE, DELETE ON public.connectors TO architectiq_app;
        GRANT SELECT, INSERT, UPDATE, DELETE ON public.integration_tools TO architectiq_app;
        GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_templates TO architectiq_app;
    """)


def downgrade() -> None:
    op.execute("""
        DROP POLICY IF EXISTS project_templates_tenant_policy ON public.project_templates;
        DROP TABLE IF EXISTS public.project_templates CASCADE;

        DROP POLICY IF EXISTS integration_tools_tenant_policy ON public.integration_tools;
        DROP TABLE IF EXISTS public.integration_tools CASCADE;

        DROP POLICY IF EXISTS connectors_tenant_policy ON public.connectors;
        DROP TABLE IF EXISTS public.connectors CASCADE;

        DROP POLICY IF EXISTS credential_references_tenant_policy ON public.credential_references;
        DROP TABLE IF EXISTS public.credential_references CASCADE;
    """)
