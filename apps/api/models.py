import uuid
from datetime import UTC, datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    func,
    ForeignKey,
    ForeignKeyConstraint,
    Integer,
    JSON,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def utc_now() -> datetime:
    return datetime.now(UTC)

class Base(DeclarativeBase):
    pass

class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
    )

    display_name: Mapped[str] = mapped_column(String(200))

    status: Mapped[str] = mapped_column(
        String(20),
        default="ACTIVE",
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
    )

    __table_args__ = (
        CheckConstraint(
            "status IN ('ACTIVE', 'SUSPENDED', 'DISABLED')",
            name="ck_users_allowed_status",
        ),
    )

class TenantMembership(Base):
    __tablename__ = "tenant_memberships"

    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "tenant_id",
            name="uq_tenant_memberships_user_tenant",
        ),
        CheckConstraint(
            "status IN ('ACTIVE', 'SUSPENDED', 'REVOKED')",
            name="ck_tenant_memberships_allowed_status",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id"),
        nullable=False,
    )

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tenants.id"),
        nullable=False,
    )

    status: Mapped[str] = mapped_column(
        String(20),
        default="ACTIVE",
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
    )

class Tenant(Base):
    __tablename__ = "tenants"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True)
    name: Mapped[str] = mapped_column(String(200))
    slug: Mapped[str] = mapped_column(String(100), unique=True)
    status: Mapped[str] = mapped_column(String(20), default="Active", server_default="Active", nullable=True)
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now
    )


class Organization(Base):
    __tablename__ = "organizations"
    __table_args__ = (UniqueConstraint("tenant_id", "slug"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenants.id"))
    name: Mapped[str] = mapped_column(String(200))
    slug: Mapped[str] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now
    )


class OrganizationEnvironment(Base):
    __tablename__ = "organization_environments"
    __table_args__ = (
        UniqueConstraint("organization_id", "name", name="uq_org_environment_name"),
        CheckConstraint("name IN ('DEV', 'TEST', 'UAT', 'PROD')", name="ck_org_environment_name"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="RESTRICT"), nullable=False)
    name: Mapped[str] = mapped_column(String(10), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)


class Folder(Base):
    __tablename__ = "folders"

    __table_args__ = (
        UniqueConstraint(
            "id",
            "organization_id",
            name="uq_folders_id_organization",
        ),
        ForeignKeyConstraint(
            ["parent_folder_id", "organization_id"],
            ["folders.id", "folders.organization_id"],
            name="fk_folders_parent_same_organization",
        ),
        CheckConstraint(
            "parent_folder_id IS NULL OR parent_folder_id <> id",
            name="ck_folders_no_self_parent",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id"),
    )

    tenant_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True)

    parent_folder_id: Mapped[uuid.UUID | None] = mapped_column(
        nullable=True,
    )

    name: Mapped[str] = mapped_column(String(200))
    environment_name: Mapped[str] = mapped_column(String(20), default="DEV", server_default="DEV", nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    settings: Mapped[dict] = mapped_column(JSON, default=dict, server_default=text('\'{"inheritance": true, "auto_scaling": true, "retention_days": 90, "audit_enabled": true}\'::jsonb'), nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
    )


class Project(Base):
    __tablename__ = "projects"
    __table_args__ = (
        CheckConstraint(
            "lifecycle_status IN ('ACTIVE', 'ARCHIVED', 'SUSPENDED')",
            name="ck_projects_lifecycle_status",
        ),
        CheckConstraint(
            "criticality IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')",
            name="ck_projects_criticality",
        ),
        CheckConstraint(
            "data_classification IN ('PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED')",
            name="ck_projects_data_classification",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    folder_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("folders.id"))
    name: Mapped[str] = mapped_column(String(200))
    lifecycle_status: Mapped[str] = mapped_column(
        String(20), default="ACTIVE", server_default="ACTIVE", nullable=False
    )
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    tags: Mapped[list] = mapped_column(
        JSON, default=list, server_default=text("'[]'::jsonb"), nullable=False
    )
    criticality: Mapped[str] = mapped_column(
        String(20), default="MEDIUM", server_default="MEDIUM", nullable=False
    )
    data_classification: Mapped[str] = mapped_column(
        String(20), default="INTERNAL", server_default="INTERNAL", nullable=False
    )
    cost_center: Mapped[str | None] = mapped_column(String(100), nullable=True)
    archived_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    archived_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now
    )
  
class ProjectEnvironment(Base):
    __tablename__ = "project_environments"
    __table_args__ = (
        UniqueConstraint("project_id", "environment"),
        CheckConstraint(
            "environment IN ('DEV', 'TEST', 'UAT', 'PROD')",
            name="ck_project_environments_allowed_environment",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id")
    )
    environment: Mapped[str] = mapped_column(String(10))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
    )
class UserExternalIdentity(Base):
    __tablename__ = "user_external_identities"

    __table_args__ = (
        UniqueConstraint(
            "issuer",
            "subject",
            name="uq_user_external_identities_issuer_subject",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )

    issuer: Mapped[str] = mapped_column(
        String(500),
        nullable=False,
    )

    subject: Mapped[str] = mapped_column(
        String(500),
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        nullable=False,
    )


class ProjectMembership(Base):
    __tablename__ = "project_memberships"

    __table_args__ = (
        UniqueConstraint(
            "project_id",
            "user_id",
            name="uq_project_memberships_project_user",
        ),
        CheckConstraint(
            "role IN ('OWNER', 'ADMIN', 'EDITOR', 'VIEWER')",
            name="ck_project_memberships_role",
        ),
        ForeignKeyConstraint(
            ["user_id", "tenant_id"],
            ["tenant_memberships.user_id", "tenant_memberships.tenant_id"],
            name="fk_project_memberships_tenant_user",
            ondelete="CASCADE",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
    )

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
    )

    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    role: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        nullable=False,
    )

    granted_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )


class ProjectEnvironmentBinding(Base):
    __tablename__ = "project_environment_bindings"
    __table_args__ = (
        UniqueConstraint("project_id", "environment_id", name="uq_project_env_binding"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    environment_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organization_environments.id", ondelete="CASCADE"), nullable=False)
    config_overrides: Mapped[dict] = mapped_column(JSON, default=dict, server_default=text("'{}'::jsonb"), nullable=False)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("true"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)


class PromotionRequest(Base):
    __tablename__ = "promotion_requests"
    __table_args__ = (
        CheckConstraint(
            "status IN ('PENDING', 'APPROVED', 'REJECTED', 'EXECUTED', 'CANCELLED')",
            name="ck_promotion_requests_status",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    source_environment_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organization_environments.id", ondelete="CASCADE"), nullable=False)
    target_environment_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organization_environments.id", ondelete="CASCADE"), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="PENDING", server_default="PENDING", nullable=False)
    requested_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    review_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    drift_detected: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"), nullable=False)
    drift_details: Mapped[dict] = mapped_column(JSON, default=dict, server_default=text("'{}'::jsonb"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    executed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class WorkflowDefinition(Base):
    __tablename__ = "workflow_definitions"
    __table_args__ = (
        UniqueConstraint("project_id", "slug", name="uq_workflow_project_slug"),
        CheckConstraint(
            "status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')",
            name="ck_workflow_definitions_status",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    current_version: Mapped[int] = mapped_column(Integer, default=1, server_default=text("1"), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="DRAFT", server_default="DRAFT", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)


class WorkflowVersion(Base):
    __tablename__ = "workflow_versions"
    __table_args__ = (
        UniqueConstraint("workflow_id", "version", name="uq_workflow_version"),
        CheckConstraint(
            "status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')",
            name="ck_workflow_versions_status",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    workflow_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workflow_definitions.id", ondelete="CASCADE"), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    definition: Mapped[dict] = mapped_column(JSON, default=dict, server_default=text("'{\"nodes\": [], \"edges\": [], \"variables\": [], \"metadata\": {}}'::jsonb"), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="DRAFT", server_default="DRAFT", nullable=False)
    change_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)


class WorkflowRun(Base):
    __tablename__ = "workflow_runs"
    __table_args__ = (
        CheckConstraint(
            "status IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED', 'SUSPENDED')",
            name="ck_workflow_runs_status",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    workflow_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workflow_definitions.id", ondelete="CASCADE"), nullable=False)
    workflow_version: Mapped[int] = mapped_column(Integer, nullable=False)
    environment_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("organization_environments.id", ondelete="SET NULL"), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="PENDING", server_default="PENDING", nullable=False)
    trigger_type: Mapped[str] = mapped_column(String(50), default="MANUAL", server_default="MANUAL", nullable=False)
    trigger_payload: Mapped[dict] = mapped_column(JSON, default=dict, server_default=text("'{}'::jsonb"), nullable=False)
    execution_context: Mapped[dict] = mapped_column(JSON, default=dict, server_default=text("'{}'::jsonb"), nullable=False)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    retry_count: Mapped[int] = mapped_column(Integer, default=0, server_default=text("0"), nullable=False)
    max_retries: Mapped[int] = mapped_column(Integer, default=3, server_default=text("3"), nullable=False)
    otel_trace_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    metrics: Mapped[dict] = mapped_column(JSON, default=dict, server_default=text("'{\"total_tokens\": 0, \"estimated_cost_usd\": 0.0, \"latency_ms\": 0}'::jsonb"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)


class WorkflowStepRun(Base):
    __tablename__ = "workflow_step_runs"
    __table_args__ = (
        CheckConstraint(
            "status IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'SKIPPED')",
            name="ck_workflow_step_runs_status",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    run_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workflow_runs.id", ondelete="CASCADE"), nullable=False)
    node_id: Mapped[str] = mapped_column(String(100), nullable=False)
    node_type: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="PENDING", server_default="PENDING", nullable=False)
    input_payload: Mapped[dict] = mapped_column(JSON, default=dict, server_default=text("'{}'::jsonb"), nullable=False)
    output_payload: Mapped[dict] = mapped_column(JSON, default=dict, server_default=text("'{}'::jsonb"), nullable=False)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    retry_count: Mapped[int] = mapped_column(Integer, default=0, server_default=text("0"), nullable=False)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    otel_span_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    parent_span_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    telemetry_logs: Mapped[list] = mapped_column(JSON, default=list, server_default=text("'[]'::jsonb"), nullable=False)
    step_metrics: Mapped[dict] = mapped_column(JSON, default=dict, server_default=text("'{\"tokens\": 0, \"cost_usd\": 0.0}'::jsonb"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)


class WorkflowQueue(Base):
    __tablename__ = "workflow_queues"
    __table_args__ = (
        CheckConstraint(
            "status IN ('QUEUED', 'PROCESSING', 'DEAD_LETTER', 'COMPLETED', 'CANCELLED')",
            name="ck_workflow_queues_status",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    run_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workflow_runs.id", ondelete="CASCADE"), nullable=False)
    queue_name: Mapped[str] = mapped_column(String(100), default="default", server_default="default", nullable=False)
    priority: Mapped[int] = mapped_column(Integer, default=0, server_default=text("0"), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="QUEUED", server_default="QUEUED", nullable=False)
    locked_by: Mapped[str | None] = mapped_column(String(100), nullable=True)
    locked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    lock_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0, server_default=text("0"), nullable=False)
    max_attempts: Mapped[int] = mapped_column(Integer, default=3, server_default=text("3"), nullable=False)
    payload: Mapped[dict] = mapped_column(JSON, default=dict, server_default=text("'{}'::jsonb"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)


class ApprovalTask(Base):
    __tablename__ = "approval_tasks"
    __table_args__ = (
        CheckConstraint(
            "priority IN ('LOW', 'MEDIUM', 'HIGH', 'URGENT')",
            name="ck_approval_tasks_priority",
        ),
        CheckConstraint(
            "status IN ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED')",
            name="ck_approval_tasks_status",
        ),
        CheckConstraint(
            "required_role IN ('OWNER', 'ADMIN', 'EDITOR', 'VIEWER')",
            name="ck_approval_tasks_required_role",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    run_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("workflow_runs.id", ondelete="SET NULL"), nullable=True)
    step_run_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("workflow_step_runs.id", ondelete="SET NULL"), nullable=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    priority: Mapped[str] = mapped_column(String(20), default="MEDIUM", server_default="MEDIUM", nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="PENDING", server_default="PENDING", nullable=False)
    required_role: Mapped[str] = mapped_column(String(20), default="ADMIN", server_default="ADMIN", nullable=False)
    assigned_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    resolution_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    resolved_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    sla_deadline: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    payload: Mapped[dict] = mapped_column(JSON, default=dict, server_default=text("'{}'::jsonb"), nullable=False)
    decision_payload: Mapped[dict] = mapped_column(JSON, default=dict, server_default=text("'{}'::jsonb"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)


class BusinessRule(Base):
    __tablename__ = "business_rules"
    __table_args__ = (
        UniqueConstraint("project_id", "slug", name="uq_business_rule_project_slug"),
        CheckConstraint(
            "status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')",
            name="ck_business_rules_status",
        ),
        CheckConstraint(
            "rule_type IN ('DECISION_TABLE', 'EXPRESSION', 'POLICY_MATRIX')",
            name="ck_business_rules_type",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    version: Mapped[int] = mapped_column(Integer, default=1, server_default=text("1"), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="DRAFT", server_default="DRAFT", nullable=False)
    rule_type: Mapped[str] = mapped_column(String(50), default="DECISION_TABLE", server_default="DECISION_TABLE", nullable=False)
    conditions_schema: Mapped[list] = mapped_column(JSON, default=list, server_default=text("'[]'::jsonb"), nullable=False)
    actions_schema: Mapped[list] = mapped_column(JSON, default=list, server_default=text("'[]'::jsonb"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

class AIAgent(Base):
    __tablename__ = "ai_agents"
    __table_args__ = (
        UniqueConstraint("tenant_id", "project_id", "slug", name="ai_agents_tenant_project_slug_key"),
        CheckConstraint(
            "status IN ('ACTIVE', 'DRAFT', 'ARCHIVED')",
            name="ck_ai_agents_status",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    slug: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    system_prompt: Mapped[str] = mapped_column(Text, nullable=False)
    model_provider: Mapped[str] = mapped_column(String(40), default="ollama", server_default="ollama", nullable=False)
    model_name: Mapped[str] = mapped_column(String(100), default="qwen3-coder:30b", server_default="qwen3-coder:30b", nullable=False)
    temperature: Mapped[float] = mapped_column(Numeric(3, 2), default=0.70, server_default=text("0.70"), nullable=False)
    max_tokens: Mapped[int] = mapped_column(Integer, default=4096, server_default=text("4096"), nullable=False)
    tools_config: Mapped[list] = mapped_column(JSON, default=list, server_default=text("'[]'::jsonb"), nullable=False)
    budget_limit_usd: Mapped[float] = mapped_column(Numeric(10, 4), default=100.0, server_default=text("100.0000"), nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="ACTIVE", server_default="ACTIVE", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)


class AIAgentInvocation(Base):
    __tablename__ = "ai_agent_invocations"
    __table_args__ = (
        CheckConstraint(
            "status IN ('SUCCESS', 'FAILED', 'BUDGET_EXCEEDED')",
            name="ck_ai_agent_invocations_status",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    agent_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("ai_agents.id", ondelete="CASCADE"), nullable=False)
    caller_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    input_prompt: Mapped[str] = mapped_column(Text, nullable=False)
    output_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    model_used: Mapped[str] = mapped_column(String(100), nullable=False)
    prompt_tokens: Mapped[int] = mapped_column(Integer, default=0, server_default=text("0"), nullable=False)
    completion_tokens: Mapped[int] = mapped_column(Integer, default=0, server_default=text("0"), nullable=False)
    total_tokens: Mapped[int] = mapped_column(Integer, default=0, server_default=text("0"), nullable=False)
    estimated_cost_usd: Mapped[float] = mapped_column(Numeric(10, 6), default=0.0, server_default=text("0.000000"), nullable=False)
    duration_ms: Mapped[int] = mapped_column(Integer, default=0, server_default=text("0"), nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="SUCCESS", server_default="SUCCESS", nullable=False)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)


class AIAgentEvaluation(Base):
    __tablename__ = "ai_agent_evaluations"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    agent_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("ai_agents.id", ondelete="CASCADE"), nullable=False)
    eval_name: Mapped[str] = mapped_column(String(120), nullable=False)
    test_cases: Mapped[list] = mapped_column(JSON, default=list, server_default=text("'[]'::jsonb"), nullable=False)
    results: Mapped[dict] = mapped_column(JSON, default=dict, server_default=text("'{}'::jsonb"), nullable=False)
    pass_rate: Mapped[float] = mapped_column(Numeric(5, 2), default=0.0, server_default=text("0.00"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)

class DocumentSchema(Base):
    __tablename__ = "document_schemas"
    __table_args__ = (
        UniqueConstraint("project_id", "slug", name="uq_document_schemas_project_slug"),
        CheckConstraint(
            "status IN ('ACTIVE', 'DRAFT', 'ARCHIVED')",
            name="ck_document_schemas_status",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    slug: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    fields_schema: Mapped[list] = mapped_column(JSON, default=list, server_default=text("'[]'::jsonb"), nullable=False)
    confidence_threshold: Mapped[float] = mapped_column(Numeric(3, 2), default=0.85, server_default=text("0.85"), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="ACTIVE", server_default="ACTIVE", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)


class Document(Base):
    __tablename__ = "documents"
    __table_args__ = (
        CheckConstraint(
            "status IN ('UPLOADED', 'PROCESSING', 'EXTRACTED', 'REVIEW_REQUIRED', 'COMPLETED', 'FAILED')",
            name="ck_documents_status",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    schema_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("document_schemas.id", ondelete="SET NULL"), nullable=True)
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False)
    file_size_bytes: Mapped[int] = mapped_column(Integer, default=0, server_default=text("0"), nullable=False)
    storage_path: Mapped[str] = mapped_column(String(500), nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="UPLOADED", server_default="UPLOADED", nullable=False)
    classification: Mapped[str | None] = mapped_column(String(100), nullable=True)
    page_count: Mapped[int] = mapped_column(Integer, default=1, server_default=text("1"), nullable=False)
    raw_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    extracted_entities: Mapped[dict] = mapped_column(JSON, default=dict, server_default=text("'{}'::jsonb"), nullable=False)
    overall_confidence: Mapped[float] = mapped_column(Numeric(3, 2), default=0.0, server_default=text("0.00"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)


class DocumentAnnotation(Base):
    __tablename__ = "document_annotations"
    __table_args__ = (
        CheckConstraint(
            "status IN ('PENDING', 'ACCEPTED', 'CORRECTED', 'REJECTED')",
            name="ck_document_annotations_status",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    document_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"), nullable=False)
    field_name: Mapped[str] = mapped_column(String(100), nullable=False)
    extracted_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    corrected_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_corrected: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="PENDING", server_default="PENDING", nullable=False)
    annotated_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    annotated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)

class CredentialReference(Base):
    __tablename__ = "credential_references"
    __table_args__ = (
        CheckConstraint(
            "vault_provider IN ('VAULT', 'AWS_SECRETS_MANAGER', 'AZURE_KEY_VAULT', 'CYBERARK', 'INTERNAL_ENCRYPTED')",
            name="ck_credential_references_provider",
        ),
        CheckConstraint(
            "environment IN ('DEV', 'TEST', 'UAT', 'PROD')",
            name="ck_credential_references_environment",
        ),
        CheckConstraint(
            "status IN ('ACTIVE', 'EXPIRED', 'ROTATING')",
            name="ck_credential_references_status",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    vault_provider: Mapped[str] = mapped_column(String(40), default="INTERNAL_ENCRYPTED", server_default="INTERNAL_ENCRYPTED", nullable=False)
    vault_path: Mapped[str] = mapped_column(String(255), nullable=False)
    secret_key: Mapped[str] = mapped_column(String(120), nullable=False)
    environment: Mapped[str] = mapped_column(String(10), default="DEV", server_default="DEV", nullable=False)
    masked_preview: Mapped[str] = mapped_column(String(60), default="********", server_default="********", nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="ACTIVE", server_default="ACTIVE", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)


class Connector(Base):
    __tablename__ = "connectors"
    __table_args__ = (
        UniqueConstraint("project_id", "slug", name="uq_connectors_project_slug"),
        CheckConstraint(
            "connector_type IN ('REST', 'GRAPHQL', 'DATABASE', 'KAFKA', 'WEBHOOK')",
            name="ck_connectors_type",
        ),
        CheckConstraint(
            "auth_type IN ('NONE', 'API_KEY', 'BEARER_TOKEN', 'BASIC', 'OAUTH2', 'VAULT_REFERENCE')",
            name="ck_connectors_auth",
        ),
        CheckConstraint(
            "status IN ('ACTIVE', 'INACTIVE', 'MAINTENANCE')",
            name="ck_connectors_status",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    credential_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("credential_references.id", ondelete="SET NULL"), nullable=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    slug: Mapped[str] = mapped_column(String(120), nullable=False)
    connector_type: Mapped[str] = mapped_column(String(30), default="REST", server_default="REST", nullable=False)
    base_url: Mapped[str] = mapped_column(String(500), nullable=False)
    auth_type: Mapped[str] = mapped_column(String(30), default="API_KEY", server_default="API_KEY", nullable=False)
    headers_template: Mapped[dict] = mapped_column(JSON, default=dict, server_default=text("'{}'::jsonb"), nullable=False)
    timeout_seconds: Mapped[int] = mapped_column(Integer, default=30, server_default=text("30"), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="ACTIVE", server_default="ACTIVE", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)


class IntegrationTool(Base):
    __tablename__ = "integration_tools"
    __table_args__ = (
        UniqueConstraint("project_id", "slug", name="uq_integration_tools_project_slug"),
        CheckConstraint(
            "method IN ('GET', 'POST', 'PUT', 'DELETE', 'PATCH')",
            name="ck_integration_tools_method",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    connector_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("connectors.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    slug: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    method: Mapped[str] = mapped_column(String(10), default="POST", server_default="POST", nullable=False)
    endpoint_path: Mapped[str] = mapped_column(String(255), default="/", server_default="/", nullable=False)
    parameters_schema: Mapped[dict] = mapped_column(JSON, default=dict, server_default=text("'{}'::jsonb"), nullable=False)
    response_schema: Mapped[dict] = mapped_column(JSON, default=dict, server_default=text("'{}'::jsonb"), nullable=False)
    rate_limit_per_minute: Mapped[int] = mapped_column(Integer, default=60, server_default=text("60"), nullable=False)
    is_governed: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("true"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)


class ProjectTemplate(Base):
    __tablename__ = "project_templates"
    __table_args__ = (
        UniqueConstraint("tenant_id", "slug", name="uq_project_templates_tenant_slug"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    slug: Mapped[str] = mapped_column(String(120), nullable=False)
    category: Mapped[str] = mapped_column(String(60), default="AUTOMATION", server_default="AUTOMATION", nullable=False)
    package_bundle: Mapped[dict] = mapped_column(JSON, default=dict, server_default=text("'{}'::jsonb"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)


# ---------------------------------------------------------
# Milestone M11: Observability, Telemetry & Support Runbooks
# ---------------------------------------------------------

class SystemMetric(Base):
    __tablename__ = "system_metrics"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    metric_name: Mapped[str] = mapped_column(String(100), nullable=False)
    metric_value: Mapped[float] = mapped_column(Float, nullable=False)
    dimensions: Mapped[dict] = mapped_column(JSON, default=dict, server_default=text("'{}'::jsonb"), nullable=False)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, server_default=func.now(), nullable=False)


class IncidentTicket(Base):
    __tablename__ = "incident_tickets"
    __table_args__ = (
        CheckConstraint("severity IN ('SEV-1', 'SEV-2', 'SEV-3', 'SEV-4')", name="ck_incident_tickets_severity"),
        CheckConstraint("status IN ('OPEN', 'INVESTIGATING', 'MITIGATED', 'RESOLVED')", name="ck_incident_tickets_status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    project_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("projects.id", ondelete="SET NULL"), nullable=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    severity: Mapped[str] = mapped_column(String(20), default="SEV-3", server_default="SEV-3", nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="OPEN", server_default="OPEN", nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    affected_resource_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    assigned_to: Mapped[str | None] = mapped_column(String(120), nullable=True)
    resolution_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, server_default=func.now(), nullable=False)


class SLABreachEvent(Base):
    __tablename__ = "sla_breach_events"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    project_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("projects.id", ondelete="SET NULL"), nullable=True)
    target_type: Mapped[str] = mapped_column(String(50), nullable=False)
    target_id: Mapped[str] = mapped_column(String(100), nullable=False)
    expected_sla_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    actual_duration_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    breach_severity: Mapped[str] = mapped_column(String(20), default="WARNING", server_default="WARNING", nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="ACTIVE", server_default="ACTIVE", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, server_default=func.now(), nullable=False)


class Runbook(Base):
    __tablename__ = "runbooks"
    __table_args__ = (
        UniqueConstraint("tenant_id", "slug", name="uq_runbooks_tenant_slug"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), nullable=False)
    category: Mapped[str] = mapped_column(String(50), default="REMEDIATION", server_default="REMEDIATION", nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    steps: Mapped[list] = mapped_column(JSON, default=list, server_default=text("'[]'::jsonb"), nullable=False)
    is_automated: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("true"), nullable=False)
    last_executed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, server_default=func.now(), nullable=False)



# ---------------------------------------------------------
# Milestone M12: Enterprise Hardening & Compliance
# ---------------------------------------------------------

class CompliancePolicy(Base):
    __tablename__ = "compliance_policies"
    __table_args__ = (
        UniqueConstraint("tenant_id", "name", name="uq_compliance_policies_tenant_name"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    policy_type: Mapped[str] = mapped_column(String(50), default="DATA_RETENTION", server_default="DATA_RETENTION", nullable=False)
    rules: Mapped[dict] = mapped_column(JSON, default=dict, server_default=text("'{}'::jsonb"), nullable=False)
    retention_days: Mapped[int] = mapped_column(Integer, default=90, server_default=text("90"), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("true"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, server_default=func.now(), nullable=False)


class ComplianceAuditReport(Base):
    __tablename__ = "compliance_audit_reports"
    __table_args__ = (
        CheckConstraint("verdict IN ('COMPLIANT', 'NON_COMPLIANT', 'FLAGGED_FOR_REVIEW')", name="ck_compliance_audit_verdict"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    report_type: Mapped[str] = mapped_column(String(50), nullable=False)
    generated_by: Mapped[str] = mapped_column(String(120), default="system-auditor", server_default="system-auditor", nullable=False)
    verdict: Mapped[str] = mapped_column(String(30), default="COMPLIANT", server_default="COMPLIANT", nullable=False)
    findings: Mapped[list] = mapped_column(JSON, default=list, server_default=text("'[]'::jsonb"), nullable=False)
    score_pct: Mapped[float] = mapped_column(Float, default=100.0, server_default=text("100.0"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, server_default=func.now(), nullable=False)


# ---------------------------------------------------------
# Milestone M13: Flow Studio Enterprise & AI Gateway
# ---------------------------------------------------------

class AiModelRoute(Base):
    __tablename__ = "ai_model_routes"
    __table_args__ = (
        UniqueConstraint("tenant_id", "route_key", name="uq_ai_model_routes_tenant_key"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    route_key: Mapped[str] = mapped_column(String(100), nullable=False)
    display_name: Mapped[str] = mapped_column(String(150), nullable=False)
    primary_provider: Mapped[str] = mapped_column(String(50), default="google", server_default="google", nullable=False)
    primary_model: Mapped[str] = mapped_column(String(100), default="gemini-1.5-pro", server_default="gemini-1.5-pro", nullable=False)
    fallback_provider: Mapped[str | None] = mapped_column(String(50), nullable=True)
    fallback_model: Mapped[str | None] = mapped_column(String(100), nullable=True)
    timeout_ms: Mapped[int] = mapped_column(Integer, default=30000, server_default="30000", nullable=False)
    max_retries: Mapped[int] = mapped_column(Integer, default=3, server_default="3", nullable=False)
    cost_limit_daily: Mapped[float | None] = mapped_column(Float, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("true"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, server_default=func.now(), nullable=False)


class HumanTask(Base):
    __tablename__ = "human_tasks"
    __table_args__ = (
        CheckConstraint("status IN ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED')", name="ck_human_tasks_status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    run_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workflow_runs.id", ondelete="CASCADE"), nullable=False)
    step_run_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("workflow_step_runs.id", ondelete="CASCADE"), nullable=True)
    node_id: Mapped[str] = mapped_column(String(100), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    required_role: Mapped[str] = mapped_column(String(50), default="ADMIN", server_default="ADMIN", nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="PENDING", server_default="PENDING", nullable=False)
    task_payload: Mapped[dict] = mapped_column(JSON, default=dict, server_default=text("'{}'::jsonb"), nullable=False)
    resolution_payload: Mapped[dict] = mapped_column(JSON, default=dict, server_default=text("'{}'::jsonb"), nullable=False)
    resolved_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, server_default=func.now(), nullable=False)


# ---------------------------------------------------------
# Milestone M14: Hierarchy De-duplication & Unified Tree
# ---------------------------------------------------------

class TenantEnvironment(Base):
    __tablename__ = "tenant_environments"
    __table_args__ = (
        UniqueConstraint("tenant_id", "name", name="uq_tenant_environments_tenant_name"),
        CheckConstraint("name IN ('DEV', 'TEST', 'UAT', 'CANARY', 'PROD')", name="ck_tenant_environment_name"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(20), nullable=False)
    display_name: Mapped[str] = mapped_column(String(50), nullable=False)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("true"), nullable=False)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, server_default=func.now(), nullable=False)


class FolderDependency(Base):
    __tablename__ = "folder_dependencies"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    folder_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("folders.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    dependency_type: Mapped[str] = mapped_column(String(50), default="PACKAGE", server_default="PACKAGE", nullable=False)
    version: Mapped[str] = mapped_column(String(50), default="1.0.0", server_default="1.0.0", nullable=False)
    source_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    metadata_json: Mapped[dict] = mapped_column("metadata", JSON, default=dict, server_default=text("'{}'::jsonb"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, server_default=func.now(), nullable=False)


class Artifact(Base):
    __tablename__ = "artifacts"
    __table_args__ = (
        CheckConstraint("scope_level IN ('ORGANIZATION', 'TENANT', 'ENVIRONMENT', 'FOLDER')", name="ck_artifacts_scope_level"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    scope_level: Mapped[str] = mapped_column(String(30), nullable=False)
    scope_id: Mapped[uuid.UUID] = mapped_column(nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    artifact_type: Mapped[str] = mapped_column(String(50), default="DOCUMENT", server_default="DOCUMENT", nullable=False)
    version: Mapped[str] = mapped_column(String(50), default="1.0.0", server_default="1.0.0", nullable=False)
    content: Mapped[str | None] = mapped_column(Text, nullable=True)
    metadata_json: Mapped[dict] = mapped_column("metadata", JSON, default=dict, server_default=text("'{}'::jsonb"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, server_default=func.now(), nullable=False)
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)


# ---------------------------------------------------------
# Milestone M15: Module 01 Platform Control Center Baseline
# ---------------------------------------------------------

class PlatformOrganization(Base):
    __tablename__ = "platform_organizations"
    __table_args__ = (
        CheckConstraint("status IN ('ENABLED', 'SUSPENDED', 'ARCHIVED', 'DISABLED')", name="ck_platform_org_status"),
        CheckConstraint("tier IN ('ENTERPRISE_STARTER', 'ENTERPRISE_CORE', 'ENTERPRISE_ULTRA')", name="ck_platform_org_tier"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    tier: Mapped[str] = mapped_column(String(50), default="ENTERPRISE_CORE", server_default="ENTERPRISE_CORE", nullable=False)
    region: Mapped[str] = mapped_column(String(50), default="us-east-1", server_default="us-east-1", nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="ENABLED", server_default="ENABLED", nullable=False)
    contact_email: Mapped[str] = mapped_column(String(200), nullable=False)
    logo_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    primary_admin_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    security_policy: Mapped[dict] = mapped_column(JSON, default=dict, server_default=text("'{\"mfa_required\": true, \"sso_enforced\": false, \"data_residency\": \"US\"}'::jsonb"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, server_default=func.now(), nullable=False)


class PlatformSubscription(Base):
    __tablename__ = "platform_subscriptions"
    __table_args__ = (
        CheckConstraint("status IN ('ACTIVE', 'PAST_DUE', 'EXPIRED', 'SUSPENDED')", name="ck_platform_sub_status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("platform_organizations.id", ondelete="CASCADE"), nullable=False)
    tier: Mapped[str] = mapped_column(String(50), default="ENTERPRISE_CORE", server_default="ENTERPRISE_CORE", nullable=False)
    max_tenants: Mapped[int] = mapped_column(Integer, default=25, server_default="25", nullable=False)
    max_environments_per_tenant: Mapped[int] = mapped_column(Integer, default=5, server_default="5", nullable=False)
    max_concurrent_workers: Mapped[int] = mapped_column(Integer, default=50, server_default="50", nullable=False)
    monthly_token_budget: Mapped[int] = mapped_column(BigInteger, default=100000000, server_default="100000000", nullable=False)
    tokens_consumed: Mapped[int] = mapped_column(BigInteger, default=0, server_default="0", nullable=False)
    storage_quota_gb: Mapped[int] = mapped_column(Integer, default=1000, server_default="1000", nullable=False)
    storage_used_gb: Mapped[float] = mapped_column(Numeric(10, 2), default=0.0, server_default="0.00", nullable=False)
    renewal_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="ACTIVE", server_default="ACTIVE", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, server_default=func.now(), nullable=False)


class PlatformInfrastructurePool(Base):
    __tablename__ = "platform_infrastructure_pools"
    __table_args__ = (
        CheckConstraint("cluster_type IN ('SHARED', 'DEDICATED')", name="ck_platform_pool_type"),
        CheckConstraint("status IN ('HEALTHY', 'DEGRADED', 'MAINTENANCE')", name="ck_platform_pool_status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    region: Mapped[str] = mapped_column(String(50), nullable=False)
    cluster_type: Mapped[str] = mapped_column(String(50), default="SHARED", server_default="SHARED", nullable=False)
    total_cpu_cores: Mapped[int] = mapped_column(Integer, default=64, server_default="64", nullable=False)
    allocated_cpu_cores: Mapped[int] = mapped_column(Integer, default=16, server_default="16", nullable=False)
    total_memory_gb: Mapped[int] = mapped_column(Integer, default=256, server_default="256", nullable=False)
    allocated_memory_gb: Mapped[int] = mapped_column(Integer, default=64, server_default="64", nullable=False)
    active_pods: Mapped[int] = mapped_column(Integer, default=12, server_default="12", nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="HEALTHY", server_default="HEALTHY", nullable=False)
    assigned_org_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("platform_organizations.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, server_default=func.now(), nullable=False)


class PlatformAuditEvent(Base):
    __tablename__ = "platform_audit_events"
    __table_args__ = (
        CheckConstraint("outcome IN ('SUCCESS', 'FAILED', 'DENIED')", name="ck_platform_audit_outcome"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    actor_id: Mapped[uuid.UUID | None] = mapped_column(nullable=True)
    actor_email: Mapped[str] = mapped_column(String(200), default="platform-admin@architectiq.io", server_default="platform-admin@architectiq.io", nullable=False)
    actor_role: Mapped[str] = mapped_column(String(50), default="PLATFORM_OWNER", server_default="PLATFORM_OWNER", nullable=False)
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    target_type: Mapped[str] = mapped_column(String(50), nullable=False)
    target_id: Mapped[str] = mapped_column(String(100), nullable=False)
    outcome: Mapped[str] = mapped_column(String(20), nullable=False)
    details: Mapped[dict] = mapped_column(JSON, default=dict, server_default=text("'{}'::jsonb"), nullable=False)
    ip_address: Mapped[str] = mapped_column(String(50), default="127.0.0.1", server_default="127.0.0.1", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, server_default=func.now(), nullable=False)


class PlatformBreakGlassRequest(Base):
    __tablename__ = "platform_break_glass_requests"
    __table_args__ = (
        CheckConstraint("status IN ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'TERMINATED')", name="ck_break_glass_status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("platform_organizations.id", ondelete="CASCADE"), nullable=False)
    requester_email: Mapped[str] = mapped_column(String(200), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="PENDING", server_default="PENDING", nullable=False)
    approver_email: Mapped[str | None] = mapped_column(String(200), nullable=True)
    lease_hours: Mapped[int] = mapped_column(Integer, default=4, server_default="4", nullable=False)
    lease_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    session_token: Mapped[str | None] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, server_default=func.now(), nullable=False)


class PlatformFeatureFlag(Base):
    __tablename__ = "platform_feature_flags"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    key: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("true"), nullable=False)
    target_tier: Mapped[str] = mapped_column(String(50), default="ALL", server_default="ALL", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, server_default=func.now(), nullable=False)


# ---------------------------------------------------------
# Milestone M16: Organization & Tenant Governance Separation
# ---------------------------------------------------------

class SupportedRegion(Base):
    __tablename__ = "supported_regions"

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    country: Mapped[str] = mapped_column(String(100), nullable=False)
    compliance_tags: Mapped[dict] = mapped_column(JSON, default=list, server_default=text("'[\"SOC2\", \"ISO27001\", \"PCI-DSS\"]'::jsonb"), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("true"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, server_default=func.now(), nullable=False)


class OrganizationAdministrator(Base):
    __tablename__ = "organization_administrators"
    __table_args__ = (
        CheckConstraint("role IN ('ORGANIZATION_OWNER', 'ORGANIZATION_ADMIN', 'ORGANIZATION_VIEWER')", name="ck_org_admin_role"),
        CheckConstraint("status IN ('ACTIVE', 'PENDING', 'EXPIRED', 'REVOKED')", name="ck_org_admin_status"),
        UniqueConstraint("organization_id", "email", name="uq_org_admin_email"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("platform_organizations.id", ondelete="CASCADE"), nullable=False)
    email: Mapped[str] = mapped_column(String(200), nullable=False)
    display_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    role: Mapped[str] = mapped_column(String(50), default="ORGANIZATION_ADMIN", server_default="ORGANIZATION_ADMIN", nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="ACTIVE", server_default="ACTIVE", nullable=False)
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, server_default=func.now(), nullable=False)


class OrganizationAsset(Base):
    __tablename__ = "organization_assets"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("platform_organizations.id", ondelete="CASCADE"), nullable=False)
    asset_type: Mapped[str] = mapped_column(String(50), default="LOGO", server_default="LOGO", nullable=False)
    content_type: Mapped[str] = mapped_column(String(100), nullable=False)
    file_size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    data_base64: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, server_default=func.now(), nullable=False)


class TenantDeployment(Base):
    __tablename__ = "tenant_deployments"
    __table_args__ = (
        CheckConstraint("deployment_model IN ('saas', 'client_cloud', 'on_premises')", name="ck_tenant_deployment_model"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), unique=True, nullable=False)
    deployment_model: Mapped[str] = mapped_column(String(50), default="saas", server_default="saas", nullable=False)
    hosting_region: Mapped[str | None] = mapped_column(String(100), nullable=True)
    cloud_provider: Mapped[str | None] = mapped_column(String(50), nullable=True)
    cloud_account_id: Mapped[str | None] = mapped_column(String(150), nullable=True)
    infrastructure_region: Mapped[str | None] = mapped_column(String(100), nullable=True)
    site_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    jurisdiction: Mapped[str | None] = mapped_column(String(100), nullable=True)
    isolated_network: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"), nullable=False)
    ai_inference_allowed: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("true"), nullable=False)
    residency_enforced: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("true"), nullable=False)
    tenant_admins: Mapped[dict] = mapped_column(JSON, default=list, server_default=text("'[]'::jsonb"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, server_default=func.now(), nullable=False)


class TenantResidencyMigration(Base):
    __tablename__ = "tenant_residency_migrations"
    __table_args__ = (
        CheckConstraint("status IN ('REQUESTED', 'APPROVED', 'IN_PROGRESS', 'COMPLETED', 'REJECTED')", name="ck_residency_migration_status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    source_region: Mapped[str] = mapped_column(String(100), nullable=False)
    target_region: Mapped[str] = mapped_column(String(100), nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="REQUESTED", server_default="REQUESTED", nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    requested_by: Mapped[str] = mapped_column(String(200), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, server_default=func.now(), nullable=False)
