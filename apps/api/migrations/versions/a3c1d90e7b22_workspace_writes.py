"""Permit tenant-bound workspace writes for the restricted runtime role.

Revision ID: a3c1d90e7b22
Revises: 9376adb6347c
"""
from alembic import op
revision = "a3c1d90e7b22"
down_revision = "9376adb6347c"
branch_labels = None
depends_on = None

POLICIES = {
    "organizations": "tenant_id = public.architectiq_current_tenant_id()",
    "folders": "EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = organization_id AND o.tenant_id = public.architectiq_current_tenant_id())",
    "projects": "EXISTS (SELECT 1 FROM public.folders f JOIN public.organizations o ON o.id = f.organization_id WHERE f.id = folder_id AND o.tenant_id = public.architectiq_current_tenant_id())",
    "project_environments": "EXISTS (SELECT 1 FROM public.projects p JOIN public.folders f ON f.id = p.folder_id JOIN public.organizations o ON o.id = f.organization_id WHERE p.id = project_id AND o.tenant_id = public.architectiq_current_tenant_id())",
}

def upgrade():
    for table, expr in POLICIES.items():
        op.execute(f"GRANT INSERT, UPDATE ON public.{table} TO architectiq_app")
        op.execute(f"CREATE POLICY {table}_insert_policy ON public.{table} FOR INSERT TO architectiq_app WITH CHECK ({expr})")
        op.execute(f"CREATE POLICY {table}_update_policy ON public.{table} FOR UPDATE TO architectiq_app USING ({expr}) WITH CHECK ({expr})")

def downgrade():
    for table in reversed(tuple(POLICIES)):
        op.execute(f"DROP POLICY IF EXISTS {table}_update_policy ON public.{table}")
        op.execute(f"DROP POLICY IF EXISTS {table}_insert_policy ON public.{table}")
        op.execute(f"REVOKE INSERT, UPDATE ON public.{table} FROM architectiq_app")
