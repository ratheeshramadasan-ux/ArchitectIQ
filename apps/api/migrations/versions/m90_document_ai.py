"""Add document schemas, documents ingestion, and human annotation tables.

Revision ID: m90_document_ai
Revises: m80_agent_gateway
Create Date: 2026-10-25
"""
from typing import Sequence
from alembic import op

revision: str = "m90_document_ai"
down_revision: str | None = "m80_agent_gateway"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Document Schemas Table
    op.execute("""
        CREATE TABLE public.document_schemas (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
            project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
            name varchar(120) NOT NULL,
            slug varchar(120) NOT NULL,
            description text,
            fields_schema jsonb NOT NULL DEFAULT '[]'::jsonb,
            confidence_threshold numeric(3, 2) NOT NULL DEFAULT 0.85,
            status varchar(20) NOT NULL DEFAULT 'ACTIVE'
                CHECK (status IN ('ACTIVE', 'DRAFT', 'ARCHIVED')),
            created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
            updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
            CONSTRAINT uq_document_schemas_project_slug UNIQUE (project_id, slug)
        );
        CREATE INDEX idx_document_schemas_tenant_project ON public.document_schemas(tenant_id, project_id);
    """)

    # 2. Documents Table
    op.execute("""
        CREATE TABLE public.documents (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
            project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
            schema_id uuid REFERENCES public.document_schemas(id) ON DELETE SET NULL,
            file_name varchar(255) NOT NULL,
            mime_type varchar(100) NOT NULL,
            file_size_bytes integer NOT NULL DEFAULT 0,
            storage_path varchar(500) NOT NULL,
            status varchar(30) NOT NULL DEFAULT 'UPLOADED'
                CHECK (status IN ('UPLOADED', 'PROCESSING', 'EXTRACTED', 'REVIEW_REQUIRED', 'COMPLETED', 'FAILED')),
            classification varchar(100),
            page_count integer NOT NULL DEFAULT 1,
            raw_text text,
            extracted_entities jsonb NOT NULL DEFAULT '{}'::jsonb,
            overall_confidence numeric(3, 2) NOT NULL DEFAULT 0.00,
            created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
            updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
        );
        CREATE INDEX idx_documents_tenant_project ON public.documents(tenant_id, project_id);
    """)

    # 3. Document Annotations Table (Human-in-the-Loop verification)
    op.execute("""
        CREATE TABLE public.document_annotations (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
            document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
            field_name varchar(100) NOT NULL,
            extracted_value text,
            corrected_value text,
            is_corrected boolean NOT NULL DEFAULT false,
            status varchar(20) NOT NULL DEFAULT 'PENDING'
                CHECK (status IN ('PENDING', 'ACCEPTED', 'CORRECTED', 'REJECTED')),
            annotated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
            annotated_at timestamptz,
            created_at timestamptz NOT NULL DEFAULT clock_timestamp()
        );
        CREATE INDEX idx_document_annotations_tenant_doc ON public.document_annotations(tenant_id, document_id);
    """)

    # 4. Enable Row Level Security & Apply Tenant Policies
    op.execute("""
        ALTER TABLE public.document_schemas ENABLE ROW LEVEL SECURITY;
        CREATE POLICY document_schemas_tenant_policy ON public.document_schemas
            FOR ALL TO architectiq_app
            USING (tenant_id = public.architectiq_current_tenant_id())
            WITH CHECK (tenant_id = public.architectiq_current_tenant_id());

        ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
        CREATE POLICY documents_tenant_policy ON public.documents
            FOR ALL TO architectiq_app
            USING (tenant_id = public.architectiq_current_tenant_id())
            WITH CHECK (tenant_id = public.architectiq_current_tenant_id());

        ALTER TABLE public.document_annotations ENABLE ROW LEVEL SECURITY;
        CREATE POLICY document_annotations_tenant_policy ON public.document_annotations
            FOR ALL TO architectiq_app
            USING (tenant_id = public.architectiq_current_tenant_id())
            WITH CHECK (tenant_id = public.architectiq_current_tenant_id());
    """)

    # 5. IAM Grants for architectiq_app
    op.execute("""
        GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_schemas TO architectiq_app;
        GRANT SELECT, INSERT, UPDATE, DELETE ON public.documents TO architectiq_app;
        GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_annotations TO architectiq_app;
    """)


def downgrade() -> None:
    op.execute("""
        DROP POLICY IF EXISTS document_annotations_tenant_policy ON public.document_annotations;
        DROP TABLE IF EXISTS public.document_annotations CASCADE;

        DROP POLICY IF EXISTS documents_tenant_policy ON public.documents;
        DROP TABLE IF EXISTS public.documents CASCADE;

        DROP POLICY IF EXISTS document_schemas_tenant_policy ON public.document_schemas;
        DROP TABLE IF EXISTS public.document_schemas CASCADE;
    """)
