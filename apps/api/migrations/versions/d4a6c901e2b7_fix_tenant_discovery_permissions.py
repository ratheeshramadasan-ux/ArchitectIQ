"""Persist tenant-discovery privileges and RLS policy.

Revision ID: d4a6c901e2b7
Revises: c8e9a22b1f04

The IAM owner may read tenant rows with active memberships, but the
application's tenant-discovery function still filters to the authenticated user.
"""
from alembic import op

revision = "d4a6c901e2b7"
down_revision = "c8e9a22b1f04"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("GRANT SELECT ON TABLE public.tenants TO architectiq_iam_owner")
    op.execute("""
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_policies
            WHERE schemaname = 'public'
              AND tablename = 'tenants'
              AND policyname = 'tenants_iam_discovery_policy'
          ) THEN
            CREATE POLICY tenants_iam_discovery_policy
              ON public.tenants
              FOR SELECT TO architectiq_iam_owner
              USING (
                EXISTS (
                  SELECT 1
                  FROM public.tenant_memberships m
                  JOIN public.users u ON u.id = m.user_id
                  WHERE m.tenant_id = tenants.id
                    AND m.status = 'ACTIVE'
                    AND u.status = 'ACTIVE'
                )
              );
          END IF;
        END
        $$;
    """)
    op.execute("REVOKE ALL ON FUNCTION public.architectiq_list_user_tenants(uuid) FROM PUBLIC")
    op.execute("GRANT EXECUTE ON FUNCTION public.architectiq_list_user_tenants(uuid) TO architectiq_iam")


def downgrade():
    op.execute("DROP POLICY IF EXISTS tenants_iam_discovery_policy ON public.tenants")
    op.execute("REVOKE SELECT ON TABLE public.tenants FROM architectiq_iam_owner")
