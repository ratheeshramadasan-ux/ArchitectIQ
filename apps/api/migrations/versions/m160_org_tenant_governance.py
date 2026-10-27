"""Milestone M16: Organization & Tenant Governance Separation.

Specification: ADM-01 V1.1
- Separates Organization identity from Tenant deployment & residency
- Adds supported_regions catalog for SaaS hosting
- Adds organization_administrators for multi-admin governance
- Adds organization_assets for secure logo uploads
- Adds tenant_deployments for SaaS, Client Cloud, and On-Premises
- Adds tenant_residency_migrations for governed region change requests
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "m160_org_tenant_governance"
down_revision = "m150_platform_control_center"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Supported Regions Catalog for SaaS hosting
    op.execute("""
        CREATE TABLE IF NOT EXISTS public.supported_regions (
            id VARCHAR(50) PRIMARY KEY,
            name VARCHAR(150) NOT NULL,
            country VARCHAR(100) NOT NULL,
            compliance_tags JSONB NOT NULL DEFAULT '["SOC2", "ISO27001", "PCI-DSS"]'::jsonb,
            is_active BOOLEAN NOT NULL DEFAULT true,
            created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
        );
        CREATE INDEX IF NOT EXISTS ix_supported_regions_active ON public.supported_regions(is_active);
    """)

    # 2. Organization Administrators (multi-admin governance)
    op.execute("""
        CREATE TABLE IF NOT EXISTS public.organization_administrators (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            organization_id UUID NOT NULL REFERENCES public.platform_organizations(id) ON DELETE CASCADE,
            email VARCHAR(200) NOT NULL,
            display_name VARCHAR(200) NULL,
            role VARCHAR(50) NOT NULL DEFAULT 'ORGANIZATION_ADMIN',
            status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
            is_primary BOOLEAN NOT NULL DEFAULT false,
            created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
            CONSTRAINT ck_org_admin_role CHECK (role IN ('ORGANIZATION_OWNER', 'ORGANIZATION_ADMIN', 'ORGANIZATION_VIEWER')),
            CONSTRAINT ck_org_admin_status CHECK (status IN ('ACTIVE', 'PENDING', 'EXPIRED', 'REVOKED')),
            CONSTRAINT uq_org_admin_email UNIQUE(organization_id, email)
        );
        CREATE INDEX IF NOT EXISTS ix_org_admin_org_id ON public.organization_administrators(organization_id);
        CREATE INDEX IF NOT EXISTS ix_org_admin_email ON public.organization_administrators(email);
    """)

    # 3. Organization Assets (secure logo and media assets)
    op.execute("""
        CREATE TABLE IF NOT EXISTS public.organization_assets (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            organization_id UUID NOT NULL REFERENCES public.platform_organizations(id) ON DELETE CASCADE,
            asset_type VARCHAR(50) NOT NULL DEFAULT 'LOGO',
            content_type VARCHAR(100) NOT NULL,
            file_size_bytes INTEGER NOT NULL,
            data_base64 TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
        );
        CREATE INDEX IF NOT EXISTS ix_org_assets_org_id ON public.organization_assets(organization_id);
    """)

    # 4. Tenant Deployments (SaaS, Client Cloud, and On-Premises configuration)
    op.execute("""
        CREATE TABLE IF NOT EXISTS public.tenant_deployments (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE UNIQUE,
            deployment_model VARCHAR(50) NOT NULL DEFAULT 'saas',
            hosting_region VARCHAR(100) NULL,
            cloud_provider VARCHAR(50) NULL,
            cloud_account_id VARCHAR(150) NULL,
            infrastructure_region VARCHAR(100) NULL,
            site_name VARCHAR(200) NULL,
            jurisdiction VARCHAR(100) NULL,
            isolated_network BOOLEAN NOT NULL DEFAULT false,
            ai_inference_allowed BOOLEAN NOT NULL DEFAULT true,
            residency_enforced BOOLEAN NOT NULL DEFAULT true,
            tenant_admins JSONB NOT NULL DEFAULT '[]'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
            CONSTRAINT ck_tenant_deployment_model CHECK (deployment_model IN ('saas', 'client_cloud', 'on_premises'))
        );
        CREATE INDEX IF NOT EXISTS ix_tenant_deployments_tenant ON public.tenant_deployments(tenant_id);
        CREATE INDEX IF NOT EXISTS ix_tenant_deployments_model ON public.tenant_deployments(deployment_model);
    """)

    # 5. Tenant Residency Migrations (governed residency changes)
    op.execute("""
        CREATE TABLE IF NOT EXISTS public.tenant_residency_migrations (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
            source_region VARCHAR(100) NOT NULL,
            target_region VARCHAR(100) NOT NULL,
            status VARCHAR(50) NOT NULL DEFAULT 'REQUESTED',
            reason TEXT NOT NULL,
            requested_by VARCHAR(200) NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
            CONSTRAINT ck_residency_migration_status CHECK (status IN ('REQUESTED', 'APPROVED', 'IN_PROGRESS', 'COMPLETED', 'REJECTED'))
        );
        CREATE INDEX IF NOT EXISTS ix_tenant_residency_mig_tenant ON public.tenant_residency_migrations(tenant_id);
    """)

    # 6. Seed Supported Regions Catalog
    op.execute("""
        INSERT INTO public.supported_regions (id, name, country, compliance_tags, is_active)
        VALUES
            ('ca-central-1', 'Canada — Central', 'Canada', '["PIPEDA", "SOC2", "ISO27001"]'::jsonb, true),
            ('us-east-1', 'United States — East (N. Virginia)', 'United States', '["SOC2", "ISO27001", "PCI-DSS", "FedRAMP"]'::jsonb, true),
            ('us-west-2', 'United States — West (Oregon)', 'United States', '["SOC2", "ISO27001", "HIPAA"]'::jsonb, true),
            ('eu-west-1', 'European Union — Ireland', 'European Union', '["GDPR", "SOC2", "ISO27001", "DORA"]'::jsonb, true),
            ('ap-southeast-1', 'Asia Pacific — Singapore', 'Singapore', '["MAS-TRM", "SOC2", "ISO27001"]'::jsonb, true)
        ON CONFLICT (id) DO NOTHING;
    """)

    # 7. Seed initial admin for Citibank Global
    op.execute("""
        DO $$
        DECLARE
            citi_id UUID;
            citi_tenant_id UUID;
        BEGIN
            SELECT id INTO citi_id FROM public.platform_organizations WHERE slug = 'citibank-global';
            IF citi_id IS NOT NULL THEN
                INSERT INTO public.organization_administrators (organization_id, email, display_name, role, status, is_primary)
                VALUES
                    (citi_id, 'ratheesh.ramadasan@gmail.com', 'Ratheesh Ramadasan', 'ORGANIZATION_OWNER', 'ACTIVE', true),
                    (citi_id, 'security-admin@citibank.com', 'Citi SecOps Admin', 'ORGANIZATION_ADMIN', 'ACTIVE', false)
                ON CONFLICT (organization_id, email) DO NOTHING;
            END IF;

            SELECT id INTO citi_tenant_id FROM public.tenants WHERE slug = 'citibank';
            IF citi_tenant_id IS NOT NULL THEN
                INSERT INTO public.tenant_deployments (tenant_id, deployment_model, hosting_region, residency_enforced, tenant_admins)
                VALUES (citi_tenant_id, 'saas', 'us-east-1', true, '["ratheesh.ramadasan@gmail.com", "citi-tenant-admin@citibank.com"]'::jsonb)
                ON CONFLICT (tenant_id) DO NOTHING;
            END IF;
        END $$;
    """)

    # 8. Grant table access
    op.execute("""
        DO $$
        BEGIN
            GRANT ALL ON TABLE public.supported_regions TO architectiq;
            GRANT ALL ON TABLE public.organization_administrators TO architectiq;
            GRANT ALL ON TABLE public.organization_assets TO architectiq;
            GRANT ALL ON TABLE public.tenant_deployments TO architectiq;
            GRANT ALL ON TABLE public.tenant_residency_migrations TO architectiq;

            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'architectiq_app') THEN
                GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.supported_regions TO architectiq_app;
                GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.organization_administrators TO architectiq_app;
                GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.organization_assets TO architectiq_app;
                GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tenant_deployments TO architectiq_app;
                GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tenant_residency_migrations TO architectiq_app;
            END IF;
        END $$;
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS public.tenant_residency_migrations CASCADE;")
    op.execute("DROP TABLE IF EXISTS public.tenant_deployments CASCADE;")
    op.execute("DROP TABLE IF EXISTS public.organization_assets CASCADE;")
    op.execute("DROP TABLE IF EXISTS public.organization_administrators CASCADE;")
    op.execute("DROP TABLE IF EXISTS public.supported_regions CASCADE;")
