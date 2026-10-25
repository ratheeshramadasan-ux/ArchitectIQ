"""Milestone M12: Enterprise Hardening, Compliance, and Responsible AI.

Delivers:
- GOV-01: Compliance retention policies, Responsible AI safety audits, and access certification.
- OPS-01 / OPS-02: Disaster recovery health metrics and compliance audit reporting.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "m120_enterprise_hardening"
down_revision = "m110_observability_and_support"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Compliance Policies Table
    op.create_table(
        "compliance_policies",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("policy_type", sa.String(50), nullable=False, server_default="DATA_RETENTION"),
        sa.Column("rules", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("retention_days", sa.Integer(), nullable=False, server_default="90"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("tenant_id", "name", name="uq_compliance_policies_tenant_name"),
    )
    op.create_index("ix_compliance_policies_tenant_type", "compliance_policies", ["tenant_id", "policy_type"])

    # 2. Compliance Audit Reports Table
    op.create_table(
        "compliance_audit_reports",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("report_type", sa.String(50), nullable=False),
        sa.Column("generated_by", sa.String(120), nullable=False, server_default="system-auditor"),
        sa.Column("verdict", sa.String(30), nullable=False, server_default="COMPLIANT"),
        sa.Column("findings", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("score_pct", sa.Float(), nullable=False, server_default="100.0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("verdict IN ('COMPLIANT', 'NON_COMPLIANT', 'FLAGGED_FOR_REVIEW')", name="ck_compliance_audit_verdict"),
    )
    op.create_index("ix_compliance_audit_reports_tenant_verdict", "compliance_audit_reports", ["tenant_id", "verdict"])

    # Enable Row-Level Security
    tables = ["compliance_policies", "compliance_audit_reports"]
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
    tables = ["compliance_audit_reports", "compliance_policies"]
    for tbl in tables:
        op.execute(f"DROP POLICY IF EXISTS {tbl}_tenant_isolation ON {tbl};")
        op.drop_table(tbl)
