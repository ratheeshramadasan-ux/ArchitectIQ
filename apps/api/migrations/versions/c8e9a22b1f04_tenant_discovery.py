"""Authorized tenant-name discovery through restricted IAM."""
from alembic import op
revision = 'c8e9a22b1f04'
down_revision = 'b7e24a91c0f3'
branch_labels = None
depends_on = None

def upgrade():
    op.execute("""CREATE FUNCTION public.architectiq_list_user_tenants(p_user uuid)
      RETURNS TABLE(id uuid, name text, slug text)
      LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp
      AS $fn$
        SELECT t.id, t.name::text, t.slug::text
        FROM public.tenants t
        JOIN public.tenant_memberships m ON m.tenant_id=t.id
        JOIN public.users u ON u.id=m.user_id
        WHERE m.user_id=p_user AND m.status='ACTIVE' AND u.status='ACTIVE'
        ORDER BY t.name, t.id
      $fn$""")
    op.execute('ALTER FUNCTION public.architectiq_list_user_tenants(uuid) OWNER TO architectiq_iam_owner')
    op.execute('REVOKE ALL ON FUNCTION public.architectiq_list_user_tenants(uuid) FROM PUBLIC')
    op.execute('GRANT EXECUTE ON FUNCTION public.architectiq_list_user_tenants(uuid) TO architectiq_iam')

def downgrade():
    op.execute('DROP FUNCTION public.architectiq_list_user_tenants(uuid)')
