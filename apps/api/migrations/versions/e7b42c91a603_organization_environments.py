"""Organization-level environments and folder strategy, additive foundation.

Revision ID: e7b42c91a603
Revises: d4a6c901e2b7

Existing project_environments are intentionally retained; deployment cutover is
not part of this schema migration.
"""
from alembic import op
import sqlalchemy as sa

revision = 'e7b42c91a603'
down_revision = 'd4a6c901e2b7'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    invalid = bind.execute(sa.text("""
        SELECT DISTINCT pe.environment
        FROM public.project_environments pe
        WHERE pe.environment NOT IN ('DEV', 'TEST', 'UAT', 'PROD')
    """)).scalars().all()
    if invalid:
        raise RuntimeError('Unrecognized legacy environments: ' + ', '.join(map(str, invalid)))

    # Keep existing source folders, projects and project_environments untouched.
    op.add_column('organizations', sa.Column(
        'folder_hierarchy_strategy', sa.String(20), nullable=False,
        server_default='INDEPENDENT'))
    op.create_check_constraint('ck_org_hierarchy_strategy', 'organizations',
                               "folder_hierarchy_strategy IN ('INDEPENDENT', 'REPLICATED')")

    op.create_table('organization_environments',
        sa.Column('id', sa.Uuid(), primary_key=True),
        sa.Column('organization_id', sa.Uuid(),
                  sa.ForeignKey('organizations.id', ondelete='RESTRICT'), nullable=False),
        sa.Column('name', sa.String(10), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text('now()')),
        sa.UniqueConstraint('organization_id', 'name', name='uq_org_environment_name'),
        sa.UniqueConstraint('id', 'organization_id', name='uq_org_environment_id_org'),
        sa.CheckConstraint("name IN ('DEV','TEST','UAT','PROD')", name='ck_org_environment_name'))

    op.create_table('environment_folders',
        sa.Column('id', sa.Uuid(), primary_key=True),
        sa.Column('organization_id', sa.Uuid(), nullable=False),
        sa.Column('environment_id', sa.Uuid(), nullable=False),
        sa.Column('parent_folder_id', sa.Uuid(), nullable=True),
        sa.Column('name', sa.String(200), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['environment_id', 'organization_id'],
                                ['organization_environments.id', 'organization_environments.organization_id'],
                                name='fk_env_folder_environment_org', ondelete='RESTRICT'),
        sa.UniqueConstraint('id', 'environment_id', name='uq_env_folder_id_env'),
        sa.ForeignKeyConstraint(['parent_folder_id', 'environment_id'],
                                ['environment_folders.id', 'environment_folders.environment_id'],
                                name='fk_env_folder_parent_same_env', ondelete='RESTRICT'),
        sa.CheckConstraint('parent_folder_id IS NULL OR parent_folder_id <> id',
                           name='ck_env_folder_no_self_parent'))
    op.create_index('ix_env_folders_environment_parent', 'environment_folders',
                    ['environment_id', 'parent_folder_id'])

    # Distinct legacy environments per organization, plus DEV for every org.
    op.execute("""
        INSERT INTO public.organization_environments (id, organization_id, name)
        SELECT gen_random_uuid(), organization_id, name FROM (
            SELECT DISTINCT f.organization_id, pe.environment AS name
            FROM public.project_environments pe
            JOIN public.projects p ON p.id = pe.project_id
            JOIN public.folders f ON f.id = p.folder_id
            UNION
            SELECT id, 'DEV' FROM public.organizations
        ) src
        ON CONFLICT (organization_id, name) DO NOTHING
    """)

    for table in ('organization_environments', 'environment_folders'):
        op.execute(f'ALTER TABLE public.{table} ENABLE ROW LEVEL SECURITY')
        # Keep the RLS owner behavior aligned with existing application tables.
        predicate = (f'EXISTS (SELECT 1 FROM public.organizations o '
                     f'WHERE o.id = {table}.organization_id '
                     f'AND o.tenant_id = public.architectiq_current_tenant_id())')
        op.execute(f'CREATE POLICY {table}_tenant_select ON public.{table} '
                   f'FOR SELECT TO architectiq_app USING ({predicate})')
        op.execute(f'CREATE POLICY {table}_tenant_insert ON public.{table} '
                   f'FOR INSERT TO architectiq_app WITH CHECK ({predicate})')
        op.execute(f'CREATE POLICY {table}_tenant_update ON public.{table} '
                   f'FOR UPDATE TO architectiq_app USING ({predicate}) WITH CHECK ({predicate})')
        op.execute(f'CREATE POLICY {table}_tenant_delete ON public.{table} '
                   f'FOR DELETE TO architectiq_app USING ({predicate})')
        op.execute(f'GRANT SELECT, INSERT, UPDATE, DELETE ON public.{table} TO architectiq_app')

    # Explicitly narrow application writes: hierarchy strategy cannot be set
    # through generic organization UPDATE. The future privileged settings
    # endpoint must validate zero projects/deployments and write audit records.
    op.execute('REVOKE UPDATE ON TABLE public.organizations FROM architectiq_app')
    op.execute('REVOKE UPDATE (id, tenant_id, created_at, folder_hierarchy_strategy) '
               'ON TABLE public.organizations FROM architectiq_app')
    op.execute('GRANT UPDATE (name, slug) ON TABLE public.organizations TO architectiq_app')


def downgrade():
    raise RuntimeError('Schema rollback requires a reviewed data-preservation plan')
