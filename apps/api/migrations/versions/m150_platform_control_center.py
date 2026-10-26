"""Milestone M15: Platform Control Center & Enterprise Master Blueprint v3.0 Baseline.

Delivers:
- Platform Organizations (Enterprise-level boundary, tiers, lifecycle, regions)
- Platform Subscriptions & Entitlements (Tenants, 5 Envs, AI Tokens, Workers, Storage quotas)
- Platform Infrastructure Pools (Shared vs Dedicated clusters, vCPU/RAM/Pod capacity)
- Platform Audit Trail (Records SUCCESS, FAILED, and DENIED mutations with actor & before/after state)
- Break-Glass Privileged Support Access (Dual-custody, 4-hour lease, emergency support)
- Platform Feature Flags & Diagnostic Status
- Updates TenantEnvironment constraint to enforce DEV, TEST, UAT, CANARY, PROD
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "m150_platform_control_center"
down_revision = "m140_enterprise_hierarchy_dedup"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Update check constraint on tenant_environments to support all 5 canonical environments: DEV, TEST, UAT, CANARY, PROD
    op.execute("""
        ALTER TABLE public.tenant_environments
        DROP CONSTRAINT IF EXISTS ck_tenant_environment_name;
    """)
    op.execute("""
        ALTER TABLE public.tenant_environments
        ADD CONSTRAINT ck_tenant_environment_name
        CHECK (name IN ('DEV', 'TEST', 'UAT', 'CANARY', 'PROD'));
    """)
    op.execute("""
        ALTER TABLE public.tenants
        DROP CONSTRAINT IF EXISTS tenants_organization_id_fkey;
    """)

    # 2. Platform Organizations table
    op.execute("""
        CREATE TABLE IF NOT EXISTS public.platform_organizations (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name VARCHAR(200) NOT NULL,
            slug VARCHAR(100) UNIQUE NOT NULL,
            tier VARCHAR(50) NOT NULL DEFAULT 'ENTERPRISE_CORE',
            region VARCHAR(50) NOT NULL DEFAULT 'us-east-1',
            status VARCHAR(20) NOT NULL DEFAULT 'ENABLED',
            contact_email VARCHAR(200) NOT NULL,
            primary_admin_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
            security_policy JSONB NOT NULL DEFAULT '{"mfa_required": true, "sso_enforced": false, "data_residency": "US"}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
            CONSTRAINT ck_platform_org_status CHECK (status IN ('ENABLED', 'SUSPENDED', 'ARCHIVED', 'DISABLED')),
            CONSTRAINT ck_platform_org_tier CHECK (tier IN ('ENTERPRISE_STARTER', 'ENTERPRISE_CORE', 'ENTERPRISE_ULTRA'))
        );
        CREATE INDEX IF NOT EXISTS ix_platform_organizations_slug ON public.platform_organizations(slug);
        CREATE INDEX IF NOT EXISTS ix_platform_organizations_status ON public.platform_organizations(status);
    """)

    # 3. Platform Subscriptions & Entitlements
    op.execute("""
        CREATE TABLE IF NOT EXISTS public.platform_subscriptions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            organization_id UUID NOT NULL REFERENCES public.platform_organizations(id) ON DELETE CASCADE,
            tier VARCHAR(50) NOT NULL DEFAULT 'ENTERPRISE_CORE',
            max_tenants INTEGER NOT NULL DEFAULT 25,
            max_environments_per_tenant INTEGER NOT NULL DEFAULT 5,
            max_concurrent_workers INTEGER NOT NULL DEFAULT 50,
            monthly_token_budget BIGINT NOT NULL DEFAULT 100000000,
            tokens_consumed BIGINT NOT NULL DEFAULT 0,
            storage_quota_gb INTEGER NOT NULL DEFAULT 1000,
            storage_used_gb NUMERIC(10,2) NOT NULL DEFAULT 0.00,
            renewal_date TIMESTAMPTZ NOT NULL DEFAULT (clock_timestamp() + interval '365 days'),
            status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
            created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
            CONSTRAINT ck_platform_sub_status CHECK (status IN ('ACTIVE', 'PAST_DUE', 'EXPIRED', 'SUSPENDED'))
        );
        CREATE INDEX IF NOT EXISTS ix_platform_subscriptions_org ON public.platform_subscriptions(organization_id);
    """)

    # 4. Platform Infrastructure Pools
    op.execute("""
        CREATE TABLE IF NOT EXISTS public.platform_infrastructure_pools (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name VARCHAR(100) NOT NULL,
            region VARCHAR(50) NOT NULL,
            cluster_type VARCHAR(50) NOT NULL DEFAULT 'SHARED',
            total_cpu_cores INTEGER NOT NULL DEFAULT 64,
            allocated_cpu_cores INTEGER NOT NULL DEFAULT 16,
            total_memory_gb INTEGER NOT NULL DEFAULT 256,
            allocated_memory_gb INTEGER NOT NULL DEFAULT 64,
            active_pods INTEGER NOT NULL DEFAULT 12,
            status VARCHAR(20) NOT NULL DEFAULT 'HEALTHY',
            assigned_org_id UUID REFERENCES public.platform_organizations(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
            CONSTRAINT ck_platform_pool_type CHECK (cluster_type IN ('SHARED', 'DEDICATED')),
            CONSTRAINT ck_platform_pool_status CHECK (status IN ('HEALTHY', 'DEGRADED', 'MAINTENANCE'))
        );
        CREATE INDEX IF NOT EXISTS ix_platform_infrastructure_region ON public.platform_infrastructure_pools(region);
    """)

    # 5. Platform Audit Events
    op.execute("""
        CREATE TABLE IF NOT EXISTS public.platform_audit_events (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            actor_id UUID NULL,
            actor_email VARCHAR(200) NOT NULL DEFAULT 'platform-admin@architectiq.io',
            actor_role VARCHAR(50) NOT NULL DEFAULT 'PLATFORM_OWNER',
            action VARCHAR(100) NOT NULL,
            target_type VARCHAR(50) NOT NULL,
            target_id VARCHAR(100) NOT NULL,
            outcome VARCHAR(20) NOT NULL,
            details JSONB NOT NULL DEFAULT '{}'::jsonb,
            ip_address VARCHAR(50) NOT NULL DEFAULT '127.0.0.1',
            created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
            CONSTRAINT ck_platform_audit_outcome CHECK (outcome IN ('SUCCESS', 'FAILED', 'DENIED'))
        );
        CREATE INDEX IF NOT EXISTS ix_platform_audit_action ON public.platform_audit_events(action);
        CREATE INDEX IF NOT EXISTS ix_platform_audit_outcome ON public.platform_audit_events(outcome);
        CREATE INDEX IF NOT EXISTS ix_platform_audit_created ON public.platform_audit_events(created_at DESC);
    """)

    # 6. Break-Glass Privileged Support Access
    op.execute("""
        CREATE TABLE IF NOT EXISTS public.platform_break_glass_requests (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            organization_id UUID NOT NULL REFERENCES public.platform_organizations(id) ON DELETE CASCADE,
            requester_email VARCHAR(200) NOT NULL,
            reason TEXT NOT NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
            approver_email VARCHAR(200) NULL,
            lease_hours INTEGER NOT NULL DEFAULT 4,
            lease_expires_at TIMESTAMPTZ NULL,
            session_token VARCHAR(200) NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
            CONSTRAINT ck_break_glass_status CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'TERMINATED'))
        );
        CREATE INDEX IF NOT EXISTS ix_break_glass_org ON public.platform_break_glass_requests(organization_id);
    """)

    # 7. Platform Feature Flags
    op.execute("""
        CREATE TABLE IF NOT EXISTS public.platform_feature_flags (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            key VARCHAR(100) UNIQUE NOT NULL,
            name VARCHAR(200) NOT NULL,
            description TEXT NOT NULL,
            is_enabled BOOLEAN NOT NULL DEFAULT true,
            target_tier VARCHAR(50) NOT NULL DEFAULT 'ALL',
            created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
        );
        CREATE INDEX IF NOT EXISTS ix_platform_flags_key ON public.platform_feature_flags(key);
    """)

    # 8. Grant permissions to application roles
    op.execute("""
        DO $$
        BEGIN
            GRANT ALL ON TABLE public.platform_organizations TO architectiq;
            GRANT ALL ON TABLE public.platform_subscriptions TO architectiq;
            GRANT ALL ON TABLE public.platform_infrastructure_pools TO architectiq;
            GRANT ALL ON TABLE public.platform_audit_events TO architectiq;
            GRANT ALL ON TABLE public.platform_break_glass_requests TO architectiq;
            GRANT ALL ON TABLE public.platform_feature_flags TO architectiq;

            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'architectiq_app') THEN
                GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.platform_organizations TO architectiq_app;
                GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.platform_subscriptions TO architectiq_app;
                GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.platform_infrastructure_pools TO architectiq_app;
                GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.platform_audit_events TO architectiq_app;
                GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.platform_break_glass_requests TO architectiq_app;
                GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.platform_feature_flags TO architectiq_app;
            END IF;
        END $$;
    """)

    # 9. Seed default platform feature flags and infrastructure pools
    op.execute("""
        INSERT INTO public.platform_feature_flags (key, name, description, is_enabled, target_tier)
        VALUES
            ('MULTI_AGENT_DELEGATION', 'Multi-Agent Delegation & Swarms', 'Enable multi-agent coordination protocols and subagent handoffs', true, 'ENTERPRISE_ULTRA'),
            ('CANARY_DEPLOYMENTS', 'Automated Canary Deployments', 'Progressive traffic routing and automated anomaly rollback', true, 'ALL'),
            ('VECTOR_SEARCH_HNSW', 'HNSW Vector Indexes', 'Fast high-dimensional semantic search and memory indexing', true, 'ALL'),
            ('ENHANCED_SOD_ANALYSIS', 'Dynamic Segregation of Duties Matrix', 'Real-time role conflict detection during assignment', true, 'ENTERPRISE_CORE')
        ON CONFLICT (key) DO NOTHING;

        INSERT INTO public.platform_infrastructure_pools (name, region, cluster_type, total_cpu_cores, allocated_cpu_cores, total_memory_gb, allocated_memory_gb, active_pods, status)
        VALUES
            ('US-East Dedicated Mesh 01', 'us-east-1', 'DEDICATED', 128, 48, 512, 192, 42, 'HEALTHY'),
            ('Europe Central Shared 01', 'eu-west-1', 'SHARED', 64, 32, 256, 128, 24, 'HEALTHY'),
            ('Asia Pacific Shared 01', 'ap-southeast-1', 'SHARED', 64, 20, 256, 80, 16, 'HEALTHY')
        ON CONFLICT DO NOTHING;
    """)

    # 10. Seed default flagship organization Citibank Global if not present
    op.execute("""
        DO $$
        DECLARE
            citi_id UUID;
        BEGIN
            SELECT id INTO citi_id FROM public.platform_organizations WHERE slug = 'citibank-global';
            IF citi_id IS NULL THEN
                INSERT INTO public.platform_organizations (name, slug, tier, region, status, contact_email)
                VALUES ('Citibank Global', 'citibank-global', 'ENTERPRISE_ULTRA', 'us-east-1', 'ENABLED', 'admin@citibank.com')
                RETURNING id INTO citi_id;

                INSERT INTO public.platform_subscriptions (organization_id, tier, max_tenants, max_environments_per_tenant, max_concurrent_workers, monthly_token_budget, tokens_consumed, storage_quota_gb, storage_used_gb, status)
                VALUES (citi_id, 'ENTERPRISE_ULTRA', 50, 5, 200, 500000000, 48200000, 10000, 2450.50, 'ACTIVE');
            END IF;
        END $$;
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS public.platform_feature_flags CASCADE;")
    op.execute("DROP TABLE IF EXISTS public.platform_break_glass_requests CASCADE;")
    op.execute("DROP TABLE IF EXISTS public.platform_audit_events CASCADE;")
    op.execute("DROP TABLE IF EXISTS public.platform_infrastructure_pools CASCADE;")
    op.execute("DROP TABLE IF EXISTS public.platform_subscriptions CASCADE;")
    op.execute("DROP TABLE IF EXISTS public.platform_organizations CASCADE;")
