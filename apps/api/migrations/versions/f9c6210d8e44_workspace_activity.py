"""Tenant-scoped immutable resource activity, including moves and deletes.

Revision ID: f9c6210d8e44
Revises: e7b42c91a603
"""
from alembic import op

revision = 'f9c6210d8e44'
down_revision = 'e7b42c91a603'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
    CREATE TABLE public.workspace_activity (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      tenant_id uuid NOT NULL REFERENCES public.tenants(id),
      resource_kind text NOT NULL,
      resource_id uuid NOT NULL,
      operation text NOT NULL CHECK (operation IN ('CREATE','UPDATE','DELETE')),
      actor_id uuid NULL,
      happened_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      old_values jsonb NULL,
      new_values jsonb NULL
    );
    CREATE INDEX ix_workspace_activity_tenant_time
      ON public.workspace_activity(tenant_id, happened_at DESC, id DESC);
    CREATE INDEX ix_workspace_activity_resource
      ON public.workspace_activity(tenant_id, resource_kind, resource_id, happened_at DESC);
    ALTER TABLE public.workspace_activity ENABLE ROW LEVEL SECURITY;
    CREATE POLICY workspace_activity_tenant_read ON public.workspace_activity
      FOR SELECT TO architectiq_app
      USING (tenant_id = public.architectiq_current_tenant_id());
    GRANT SELECT ON public.workspace_activity TO architectiq_app;

    CREATE FUNCTION public.architectiq_audit_workspace() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
    DECLARE v_row jsonb; v_tenant uuid; v_org uuid; v_folder uuid; v_actor uuid;
    BEGIN
      v_row := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
      IF TG_TABLE_NAME = 'organizations' THEN
        v_tenant := (v_row->>'tenant_id')::uuid;
      ELSIF TG_TABLE_NAME = 'folders' OR TG_TABLE_NAME = 'organization_environments'
         OR TG_TABLE_NAME = 'environment_folders' THEN
        v_org := (v_row->>'organization_id')::uuid;
        SELECT tenant_id INTO v_tenant FROM public.organizations WHERE id=v_org;
      ELSIF TG_TABLE_NAME = 'projects' THEN
        v_folder := (v_row->>'folder_id')::uuid;
        SELECT o.tenant_id INTO v_tenant FROM public.folders f
          JOIN public.organizations o ON o.id=f.organization_id WHERE f.id=v_folder;
      END IF;
      IF v_tenant IS NULL THEN
        RAISE EXCEPTION 'Cannot resolve audit tenant for %.%', TG_TABLE_NAME, TG_OP;
      END IF;
      IF TG_OP='UPDATE' AND to_jsonb(OLD) = to_jsonb(NEW) THEN RETURN NEW; END IF;
      v_actor := NULLIF(current_setting('architectiq.actor_id', true), '')::uuid;
      INSERT INTO public.workspace_activity
        (tenant_id,resource_kind,resource_id,operation,actor_id,old_values,new_values)
      VALUES (v_tenant,
        CASE TG_TABLE_NAME WHEN 'organizations' THEN 'organization'
          WHEN 'folders' THEN 'folder' WHEN 'projects' THEN 'project'
          WHEN 'organization_environments' THEN 'environment'
          ELSE 'environment_folder' END,
        (v_row->>'id')::uuid,
        CASE TG_OP WHEN 'INSERT' THEN 'CREATE' ELSE TG_OP END,
        v_actor,
        CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) ELSE NULL END,
        CASE WHEN TG_OP IN ('UPDATE','INSERT') THEN to_jsonb(NEW) ELSE NULL END);
      RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
    END $$;
    REVOKE ALL ON FUNCTION public.architectiq_audit_workspace() FROM PUBLIC;
    """)
    for table in ('organizations','folders','projects','organization_environments','environment_folders'):
        op.execute(f"CREATE TRIGGER trg_architectiq_audit_{table} AFTER INSERT OR UPDATE OR DELETE ON public.{table} FOR EACH ROW EXECUTE FUNCTION public.architectiq_audit_workspace()")


def downgrade():
    raise RuntimeError('Audit history is immutable; destructive downgrade is prohibited')
