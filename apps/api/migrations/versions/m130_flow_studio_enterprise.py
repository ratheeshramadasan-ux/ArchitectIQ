"""Milestone M13: Flow Studio Enterprise Schema, AI Model Routes, and Human Tasks.

Delivers:
- FS-04 / FS-05: AI Model Routes table for logical model routing and fallback
- FS-08: Human Tasks table for durable workflow approvals and suspensions
- FS-13: OpenTelemetry trace IDs and telemetry metrics on workflow runs & step runs
- Strict Row-Level Security (RLS) and IAM role grants
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "m130_flow_studio_enterprise"
down_revision = "m120_enterprise_hardening"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. AI Model Routes Table
    op.create_table(
        "ai_model_routes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("route_key", sa.String(100), nullable=False),
        sa.Column("display_name", sa.String(150), nullable=False),
        sa.Column("primary_provider", sa.String(50), nullable=False, server_default="google"),
        sa.Column("primary_model", sa.String(100), nullable=False, server_default="gemini-1.5-pro"),
        sa.Column("fallback_provider", sa.String(50), nullable=True),
        sa.Column("fallback_model", sa.String(100), nullable=True),
        sa.Column("timeout_ms", sa.Integer(), nullable=False, server_default="30000"),
        sa.Column("max_retries", sa.Integer(), nullable=False, server_default="3"),
        sa.Column("cost_limit_daily", sa.Numeric(10, 4), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("tenant_id", "route_key", name="uq_ai_model_routes_tenant_key"),
    )
    op.create_index("ix_ai_model_routes_tenant", "ai_model_routes", ["tenant_id"])

    # 2. Human Tasks Table
    op.create_table(
        "human_tasks",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("run_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("workflow_runs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("step_run_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("workflow_step_runs.id", ondelete="CASCADE"), nullable=True),
        sa.Column("node_id", sa.String(100), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("required_role", sa.String(50), nullable=False, server_default="ADMIN"),
        sa.Column("status", sa.String(20), nullable=False, server_default="PENDING"),
        sa.Column("task_payload", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("resolution_payload", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("resolved_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("status IN ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED')", name="ck_human_tasks_status"),
    )
    op.create_index("ix_human_tasks_run_id", "human_tasks", ["run_id"])
    op.create_index("ix_human_tasks_status", "human_tasks", ["tenant_id", "status"])

    # 3. Add Telemetry and Metrics columns to workflow_runs
    op.add_column("workflow_runs", sa.Column("otel_trace_id", sa.String(64), nullable=True))
    op.add_column("workflow_runs", sa.Column("metrics", postgresql.JSONB(), nullable=False, server_default=sa.text("'{\"total_tokens\": 0, \"estimated_cost_usd\": 0.0, \"latency_ms\": 0}'::jsonb")))

    # 4. Add Telemetry and Metrics columns to workflow_step_runs
    op.add_column("workflow_step_runs", sa.Column("otel_span_id", sa.String(64), nullable=True))
    op.add_column("workflow_step_runs", sa.Column("parent_span_id", sa.String(64), nullable=True))
    op.add_column("workflow_step_runs", sa.Column("telemetry_logs", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")))
    op.add_column("workflow_step_runs", sa.Column("step_metrics", postgresql.JSONB(), nullable=False, server_default=sa.text("'{\"tokens\": 0, \"cost_usd\": 0.0}'::jsonb")))

    # 5. Enable Row-Level Security
    tables = ["ai_model_routes", "human_tasks"]
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
    tables = ["human_tasks", "ai_model_routes"]
    for tbl in tables:
        op.execute(f"DROP POLICY IF EXISTS {tbl}_tenant_isolation ON {tbl};")
        op.drop_table(tbl)

    op.drop_column("workflow_step_runs", "step_metrics")
    op.drop_column("workflow_step_runs", "telemetry_logs")
    op.drop_column("workflow_step_runs", "parent_span_id")
    op.drop_column("workflow_step_runs", "otel_span_id")

    op.drop_column("workflow_runs", "metrics")
    op.drop_column("workflow_runs", "otel_trace_id")
