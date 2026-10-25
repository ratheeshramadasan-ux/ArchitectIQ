import uuid
from datetime import UTC, datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    JSON,
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
    name: Mapped[str] = mapped_column(String(200))
    slug: Mapped[str] = mapped_column(String(100), unique=True)
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

    parent_folder_id: Mapped[uuid.UUID | None] = mapped_column(
        nullable=True,
    )

    name: Mapped[str] = mapped_column(String(200))

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

