"""Milestone M14: Enterprise Hierarchy De-duplication & Unified Multi-Tenant Tree.

Delivers:
- Organization (Top level) -> Multiple Tenants
- Tenant -> Configurable Environments (DEV, UAT, CANARY, PROD with is_enabled flag)
- Folders & Recursive SubFolders with direct tenant & environment binding
- Folder Dependencies catalog (Packages, MCP tools, shared libraries)
- Polymorphic Artifacts Registry (Organization, Tenant, Environment, Folder levels)
- Removal of duplicate environment_folders table
- Row-Level Security (RLS) and IAM role grants
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "m140_enterprise_hierarchy_dedup"
down_revision = "m130_flow_studio_enterprise"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Add organization_id to tenants table
    op.add_column("tenants", sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True))
    op.create_index("ix_tenants_organization_id", "tenants", ["organization_id"])

    # Backfill organization_id on tenants where possible
    op.execute("""
        UPDATE public.tenants t
        SET organization_id = o.id
        FROM public.organizations o
        WHERE o.tenant_id = t.id AND t.organization_id IS NULL;
    """)

    # 2. Create tenant_environments table
    op.create_table(
        "tenant_environments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(20), nullable=False),
        sa.Column("display_name", sa.String(50), nullable=False),
        sa.Column("is_enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("name IN ('DEV', 'UAT', 'CANARY', 'PROD')", name="ck_tenant_environment_name"),
        sa.UniqueConstraint("tenant_id", "name", name="uq_tenant_environments_tenant_name"),
    )
    op.create_index("ix_tenant_environments_tenant", "tenant_environments", ["tenant_id"])

    # Populate 4 standard environments for all existing tenants
    op.execute("""
        INSERT INTO public.tenant_environments (tenant_id, name, display_name, is_enabled, is_default)
        SELECT t.id, env.name, env.display_name, true, (env.name = 'DEV')
        FROM public.tenants t
        CROSS JOIN (
            VALUES 
                ('DEV', 'Development'),
                ('UAT', 'User Acceptance Testing'),
                ('CANARY', 'Canary Stage'),
                ('PROD', 'Production')
        ) AS env(name, display_name)
        ON CONFLICT (tenant_id, name) DO NOTHING;
    """)

    # 3. Enhance folders table with direct tenant, environment, and settings
    op.add_column("folders", sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True))
    op.add_column("folders", sa.Column("environment_name", sa.String(20), nullable=False, server_default="DEV"))
    op.add_column("folders", sa.Column("description", sa.Text(), nullable=True))
    op.add_column("folders", sa.Column("settings", postgresql.JSONB(), nullable=False, server_default=sa.text("'{\"inheritance\": true, \"auto_scaling\": true, \"retention_days\": 90, \"audit_enabled\": true}'::jsonb")))

    op.create_index("ix_folders_tenant_env", "folders", ["tenant_id", "environment_name"])
    op.create_index("ix_folders_parent", "folders", ["parent_folder_id"])

    # Backfill folders.tenant_id from organizations
    op.execute("""
        UPDATE public.folders f
        SET tenant_id = o.tenant_id
        FROM public.organizations o
        WHERE f.organization_id = o.id AND f.tenant_id IS NULL;
    """)

    # 4. Create folder_dependencies table
    op.create_table(
        "folder_dependencies",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("folder_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("folders.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(150), nullable=False),
        sa.Column("dependency_type", sa.String(50), nullable=False, server_default="PACKAGE"),
        sa.Column("version", sa.String(50), nullable=False, server_default="1.0.0"),
        sa.Column("source_url", sa.String(500), nullable=True),
        sa.Column("metadata", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_folder_dependencies_folder", "folder_dependencies", ["folder_id"])
    op.create_index("ix_folder_dependencies_tenant", "folder_dependencies", ["tenant_id"])

    # 5. Create polymorphic artifacts table
    op.create_table(
        "artifacts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("scope_level", sa.String(30), nullable=False),
        sa.Column("scope_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("artifact_type", sa.String(50), nullable=False, server_default="DOCUMENT"),
        sa.Column("version", sa.String(50), nullable=False, server_default="1.0.0"),
        sa.Column("content", sa.Text(), nullable=True),
        sa.Column("metadata", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.CheckConstraint("scope_level IN ('ORGANIZATION', 'TENANT', 'ENVIRONMENT', 'FOLDER')", name="ck_artifacts_scope_level"),
    )
    op.create_index("ix_artifacts_tenant_scope", "artifacts", ["tenant_id", "scope_level", "scope_id"])

    # 6. Drop redundant environment_folders table if exists
    op.execute("DROP TABLE IF EXISTS public.environment_folders CASCADE;")

    # 7. Enable RLS and grants
    tables = ["tenant_environments", "folder_dependencies", "artifacts"]
    for tbl in tables:
        op.execute(f"ALTER TABLE {tbl} ENABLE ROW LEVEL SECURITY;")
        op.execute(f"""
            CREATE POLICY {tbl}_tenant_isolation ON {tbl}
            FOR ALL TO architectiq_app
            USING (tenant_id = public.architectiq_current_tenant_id())
            WITH CHECK (tenant_id = public.architectiq_current_tenant_id());
        """)
        op.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON {tbl} TO architectiq_app;")
        op.execute(f"GRANT SELECT ON {tbl} TO architectiq_audit_writer;")


def downgrade() -> None:
    tables = ["artifacts", "folder_dependencies", "tenant_environments"]
    for tbl in tables:
        op.execute(f"DROP POLICY IF EXISTS {tbl}_tenant_isolation ON {tbl};")
        op.drop_table(tbl)

    op.drop_index("ix_folders_parent", "folders")
    op.drop_index("ix_folders_tenant_env", "folders")
    op.drop_column("folders", "settings")
    op.drop_column("folders", "description")
    op.drop_column("folders", "environment_name")
    op.drop_column("folders", "tenant_id")

    op.drop_index("ix_tenants_organization_id", "tenants")
    op.drop_column("tenants", "organization_id")
