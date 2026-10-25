"""Project-level Role-Based Access Control (RBAC) and Member Management.

Enforces least-privilege role hierarchy, database-enforced tenant boundaries,
last-owner protection, and server-side authorization.
"""

from datetime import datetime
from uuid import UUID
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from authentication import get_authorized_tenant_db
from models import Project, ProjectMembership, TenantMembership, User

router = APIRouter(prefix="/api/v1/tenants/{tenant_id}/workspace/projects/{project_id}")

Db = Annotated[Session, Depends(get_authorized_tenant_db)]

ALLOWED_ROLES = ("OWNER", "ADMIN", "EDITOR", "VIEWER")

ROLE_HIERARCHY = {
    "OWNER": 4,
    "ADMIN": 3,
    "EDITOR": 2,
    "VIEWER": 1,
}


class MemberIn(BaseModel):
    user_id: UUID
    role: str = Field(pattern="^(OWNER|ADMIN|EDITOR|VIEWER)$")


class MemberRoleUpdate(BaseModel):
    role: str = Field(pattern="^(OWNER|ADMIN|EDITOR|VIEWER)$")


class MemberOut(BaseModel):
    id: UUID
    project_id: UUID
    user_id: UUID
    display_name: str
    role: str
    created_at: datetime
    granted_by: UUID | None


class ProjectPermissions(BaseModel):
    can_view: bool
    can_edit: bool
    can_manage_members: bool
    can_delete: bool


class ProjectPermissionsOut(BaseModel):
    project_id: UUID
    user_id: UUID
    role: str | None
    permissions: ProjectPermissions


def compute_permissions(role: str | None) -> ProjectPermissions:
    """Evaluate granular capabilities for a given project role.
    
    Default-deny: A user with None role has zero permissions.
    """
    if role == "OWNER":
        return ProjectPermissions(
            can_view=True,
            can_edit=True,
            can_manage_members=True,
            can_delete=True,
        )
    if role == "ADMIN":
        return ProjectPermissions(
            can_view=True,
            can_edit=True,
            can_manage_members=True,
            can_delete=False,
        )
    if role == "EDITOR":
        return ProjectPermissions(
            can_view=True,
            can_edit=True,
            can_manage_members=False,
            can_delete=False,
        )
    if role == "VIEWER":
        return ProjectPermissions(
            can_view=True,
            can_edit=False,
            can_manage_members=False,
            can_delete=False,
        )
    return ProjectPermissions(
        can_view=False,
        can_edit=False,
        can_manage_members=False,
        can_delete=False,
    )


def get_user_project_role(
    db: Session,
    project_id: UUID,
    user_id: UUID,
    tenant_id: UUID,
) -> str | None:
    """Retrieve the effective project role for a user, confirming active tenant membership."""
    # First, verify user is an ACTIVE tenant member
    tenant_active = db.scalar(
        select(func.count())
        .select_from(TenantMembership)
        .where(
            TenantMembership.user_id == user_id,
            TenantMembership.tenant_id == tenant_id,
            TenantMembership.status == "ACTIVE",
        )
    )
    if not tenant_active:
        return None

    membership = db.scalar(
        select(ProjectMembership).where(
            ProjectMembership.project_id == project_id,
            ProjectMembership.user_id == user_id,
            ProjectMembership.tenant_id == tenant_id,
        )
    )
    return membership.role if membership else None


def require_project_capability(
    db: Session,
    project_id: UUID,
    user_id: UUID,
    tenant_id: UUID,
    capability: str,
) -> str:
    """Server-side gate enforcing capability requirement or raising 403."""
    role = get_user_project_role(db, project_id, user_id, tenant_id)
    perms = compute_permissions(role)
    if not getattr(perms, capability, False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"User lacks '{capability}' capability on project {project_id}",
        )
    return role  # type: ignore


def verify_last_owner_protection(
    db: Session,
    project_id: UUID,
    target_user_id: UUID,
) -> None:
    """Prevent removing or demoting the last remaining owner of a project."""
    target_membership = db.scalar(
        select(ProjectMembership)
        .where(
            ProjectMembership.project_id == project_id,
            ProjectMembership.user_id == target_user_id,
        )
        .with_for_update()
    )
    if not target_membership or target_membership.role != "OWNER":
        return

    # Count all current owners
    owner_count = db.scalar(
        select(func.count())
        .select_from(ProjectMembership)
        .where(
            ProjectMembership.project_id == project_id,
            ProjectMembership.role == "OWNER",
        )
    )
    if owner_count <= 1:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot remove or demote the last remaining owner of the project",
        )


@router.get("/permissions", response_model=ProjectPermissionsOut)
def get_effective_permissions(
    tenant_id: UUID,
    project_id: UUID,
    db: Db,
    request: Request,
):
    """Retrieve the calling user's effective permissions for this project."""
    actor_id: UUID = request.state.verified_actor_id
    role = get_user_project_role(db, project_id, actor_id, tenant_id)
    perms = compute_permissions(role)
    return ProjectPermissionsOut(
        project_id=project_id,
        user_id=actor_id,
        role=role,
        permissions=perms,
    )


@router.get("/members", response_model=list[MemberOut])
def list_project_members(
    tenant_id: UUID,
    project_id: UUID,
    db: Db,
    request: Request,
):
    """List all members and their roles for a project. Requires can_view."""
    actor_id: UUID = request.state.verified_actor_id
    require_project_capability(db, project_id, actor_id, tenant_id, "can_view")

    # Fetch project members joined with users table
    stmt = (
        select(ProjectMembership, User.display_name)
        .join(User, User.id == ProjectMembership.user_id)
        .where(
            ProjectMembership.project_id == project_id,
            ProjectMembership.tenant_id == tenant_id,
        )
        .order_by(ProjectMembership.created_at)
    )
    rows = db.execute(stmt).all()

    return [
        MemberOut(
            id=pm.id,
            project_id=pm.project_id,
            user_id=pm.user_id,
            display_name=display_name,
            role=pm.role,
            created_at=pm.created_at,
            granted_by=pm.granted_by,
        )
        for pm, display_name in rows
    ]


@router.post("/members", response_model=MemberOut, status_code=status.HTTP_201_CREATED)
def add_project_member(
    tenant_id: UUID,
    project_id: UUID,
    body: MemberIn,
    db: Db,
    request: Request,
):
    """Assign a user to a project role. Requires can_manage_members."""
    actor_id: UUID = request.state.verified_actor_id
    caller_role = require_project_capability(
        db, project_id, actor_id, tenant_id, "can_manage_members"
    )

    # Privilege escalation defense: ADMIN cannot appoint OWNER
    if caller_role != "OWNER" and body.role == "OWNER":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only project owners can assign the OWNER role",
        )

    # Caller cannot grant a role strictly higher than their own hierarchy level
    if ROLE_HIERARCHY.get(body.role, 0) > ROLE_HIERARCHY.get(caller_role, 0):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot grant a role higher than caller's effective role",
        )

    # Verify project exists
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Verify target user exists and has ACTIVE tenant membership
    target_user = db.get(User, body.user_id)
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    is_tenant_member = db.scalar(
        select(func.count())
        .select_from(TenantMembership)
        .where(
            TenantMembership.user_id == body.user_id,
            TenantMembership.tenant_id == tenant_id,
            TenantMembership.status == "ACTIVE",
        )
    )
    if not is_tenant_member:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User is not an active member of this tenant",
        )

    # Check for existing membership
    existing = db.scalar(
        select(ProjectMembership).where(
            ProjectMembership.project_id == project_id,
            ProjectMembership.user_id == body.user_id,
        )
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User is already a member of this project",
        )

    membership = ProjectMembership(
        tenant_id=tenant_id,
        project_id=project_id,
        user_id=body.user_id,
        role=body.role,
        granted_by=actor_id,
    )
    db.add(membership)
    try:
        db.flush()
    except IntegrityError as exc:
        raise HTTPException(status_code=409, detail="Membership constraint violation") from exc

    return MemberOut(
        id=membership.id,
        project_id=membership.project_id,
        user_id=membership.user_id,
        display_name=target_user.display_name,
        role=membership.role,
        created_at=membership.created_at,
        granted_by=membership.granted_by,
    )


@router.patch("/members/{target_user_id}", response_model=MemberOut)
def update_project_member_role(
    tenant_id: UUID,
    project_id: UUID,
    target_user_id: UUID,
    body: MemberRoleUpdate,
    db: Db,
    request: Request,
):
    """Update a member's role. Requires can_manage_members with last-owner protection."""
    actor_id: UUID = request.state.verified_actor_id
    caller_role = require_project_capability(
        db, project_id, actor_id, tenant_id, "can_manage_members"
    )

    membership = db.scalar(
        select(ProjectMembership)
        .where(
            ProjectMembership.project_id == project_id,
            ProjectMembership.user_id == target_user_id,
            ProjectMembership.tenant_id == tenant_id,
        )
        .with_for_update()
    )
    if not membership:
        raise HTTPException(status_code=404, detail="Project membership not found")

    # Privilege escalation defense:
    # 1. ADMIN cannot modify an OWNER's role
    if membership.role == "OWNER" and caller_role != "OWNER":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only an OWNER can modify another OWNER's role",
        )
    # 2. ADMIN cannot elevate anyone to OWNER
    if body.role == "OWNER" and caller_role != "OWNER":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only an OWNER can promote a member to OWNER",
        )

    # Last-owner protection if demoting an owner
    if membership.role == "OWNER" and body.role != "OWNER":
        verify_last_owner_protection(db, project_id, target_user_id)

    membership.role = body.role
    db.flush()

    user = db.get(User, target_user_id)
    return MemberOut(
        id=membership.id,
        project_id=membership.project_id,
        user_id=membership.user_id,
        display_name=user.display_name if user else "",
        role=membership.role,
        created_at=membership.created_at,
        granted_by=membership.granted_by,
    )


@router.delete("/members/{target_user_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_project_member(
    tenant_id: UUID,
    project_id: UUID,
    target_user_id: UUID,
    db: Db,
    request: Request,
):
    """Remove a user from the project. Requires can_manage_members with last-owner protection."""
    actor_id: UUID = request.state.verified_actor_id
    caller_role = require_project_capability(
        db, project_id, actor_id, tenant_id, "can_manage_members"
    )

    membership = db.scalar(
        select(ProjectMembership)
        .where(
            ProjectMembership.project_id == project_id,
            ProjectMembership.user_id == target_user_id,
            ProjectMembership.tenant_id == tenant_id,
        )
        .with_for_update()
    )
    if not membership:
        raise HTTPException(status_code=404, detail="Project membership not found")

    # Privilege escalation defense: ADMIN cannot remove an OWNER
    if membership.role == "OWNER" and caller_role != "OWNER":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only an OWNER can remove an OWNER from the project",
        )

    # Last-owner protection
    if membership.role == "OWNER":
        verify_last_owner_protection(db, project_id, target_user_id)

    db.delete(membership)
    db.flush()
