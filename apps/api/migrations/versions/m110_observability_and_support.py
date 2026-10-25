"""Milestone M11: Observability, Telemetry, and Operational Console.

Delivers:
- OBS-01: System metrics, time-series telemetry, SLA breach events, and health aggregations.
- SUP-01: Incident management tickets, automated operational runbooks, and remediation executor.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "m110_observability_and_support"
down_revision = "m100_integrations_and_tools"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. System Metrics Table (Time-Series Telemetry)
    op.create_table(
        "system_metrics",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("metric_name", sa.String(100), nullable=False),
        sa.Column("metric_value", sa.Float(), nullable=False),
        sa.Column("dimensions", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_system_metrics_tenant_name_time", "system_metrics", ["tenant_id", "metric_name", "timestamp"])

    # 2. Incident Tickets Table
    op.create_table(
        "incident_tickets",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="SET NULL"), nullable=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("severity", sa.String(20), nullable=False, server_default="SEV-3"),
        sa.Column("status", sa.String(30), nullable=False, server_default="OPEN"),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("affected_resource_id", sa.String(100), nullable=True),
        sa.Column("assigned_to", sa.String(120), nullable=True),
        sa.Column("resolution_notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("severity IN ('SEV-1', 'SEV-2', 'SEV-3', 'SEV-4')", name="incident_tickets_severity_check"),
        sa.CheckConstraint("status IN ('OPEN', 'INVESTIGATING', 'MITIGATED', 'RESOLVED')", name="incident_tickets_status_check"),
    )
    op.create_index("ix_incident_tickets_tenant_status", "incident_tickets", ["tenant_id", "status"])

    # 3. SLA Breach Events Table
    op.create_table(
        "sla_breach_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="SET NULL"), nullable=True),
        sa.Column("target_type", sa.String(50), nullable=False),
        sa.Column("target_id", sa.String(100), nullable=False),
        sa.Column("expected_sla_seconds", sa.Integer(), nullable=False),
        sa.Column("actual_duration_seconds", sa.Integer(), nullable=False),
        sa.Column("breach_severity", sa.String(20), nullable=False, server_default="WARNING"),
        sa.Column("status", sa.String(30), nullable=False, server_default="ACTIVE"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_sla_breach_events_tenant_status", "sla_breach_events", ["tenant_id", "status"])

    # 4. Runbooks Table (Automated SOP Remediation)
    op.create_table(
        "runbooks",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(150), nullable=False),
        sa.Column("slug", sa.String(100), nullable=False),
        sa.Column("category", sa.String(50), nullable=False, server_default="REMEDIATION"),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("steps", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("is_automated", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("last_executed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_runbooks_tenant_slug", "runbooks", ["tenant_id", "slug"])

    # Enable Row-Level Security
    tables = ["system_metrics", "incident_tickets", "sla_breach_events", "runbooks"]
    for tbl in tables:
        op.execute(f"ALTER TABLE {tbl} ENABLE ROW LEVEL SECURITY;")
        op.execute(f"""
            CREATE POLICY {tbl}_tenant_isolation ON {tbl}
            FOR ALL TO architectiq_app
            USING (tenant_id = public.architectiq_current_tenant_id())
            WITH CHECK (tenant_id = public.architectiq_current_tenant_id());
        """)

    # Grant IAM permissions
    for tbl in tables:
        op.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON {tbl} TO architectiq_app;")
        op.execute(f"GRANT SELECT ON {tbl} TO architectiq_audit_writer;")


def downgrade() -> None:
    tables = ["runbooks", "sla_breach_events", "incident_tickets", "system_metrics"]
    for tbl in tables:
        op.execute(f"DROP POLICY IF EXISTS {tbl}_tenant_isolation ON {tbl};")
        op.drop_table(tbl)
