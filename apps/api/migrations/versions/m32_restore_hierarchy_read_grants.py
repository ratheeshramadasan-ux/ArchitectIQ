"""Restore RLS-governed hierarchy SELECT privileges.

Revision ID: m32_hierarchy_read_grants
Revises: m31_api_request_audit
"""

from alembic import op

revision = "m32_hierarchy_read_grants"
down_revision = "m31_api_request_audit"
branch_labels = None
depends_on = None

TABLES = (
    "tenants",
    "organizations",
    "folders",
    "projects",
    "project_environments",
)


def upgrade():
    bind = op.get_bind()
    database = bind.exec_driver_sql(
        "SELECT current_database()"
    ).scalar_one()

    if database != "architectiq_test":
        raise RuntimeError(
            "This migration is authorized only for architectiq_test"
        )

    for table in TABLES:
        op.execute(
            f"GRANT SELECT ON TABLE public.{table} TO architectiq_app"
        )


def downgrade():
    raise RuntimeError(
        "Privilege rollback requires an explicit security review"
    )
