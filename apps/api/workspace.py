"""Tenant-isolated workspace API. Authentication is mandatory on every route."""
from typing import Annotated, Literal
from datetime import datetime
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from authentication import get_authorized_tenant_db
from models import Folder, Organization, Project, ProjectEnvironment

router = APIRouter(prefix="/api/v1/tenants/{tenant_id}/workspace", tags=["Workspace"])
Db = Annotated[Session, Depends(get_authorized_tenant_db)]

class NameIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)

class OrganizationIn(NameIn):
    slug: str = Field(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$", max_length=100)

class FolderIn(NameIn):
    organization_id: UUID
    parent_folder_id: UUID | None = None

class ProjectIn(NameIn):
    folder_id: UUID

class EnvironmentIn(BaseModel):
    environment: Literal["DEV", "TEST", "UAT", "PROD"]

class EnvironmentFolderIn(NameIn):
    organization_id: UUID
    parent_folder_id: UUID | None = None

class RenameIn(NameIn):
    pass

class MoveFolderIn(BaseModel):
    parent_folder_id: UUID | None = None

class MoveProjectIn(BaseModel):
    folder_id: UUID


def record(obj, **extras):
    result = {"id": str(obj.id), "name": obj.name} if hasattr(obj, "name") else {"id": str(obj.id)}
    return {**result, **extras}

def require(db, model, identifier):
    obj = db.get(model, identifier)
    if obj is None:
        raise HTTPException(404, "Resource not found")
    return obj

def safe_flush(db):
    try:
        db.flush()
    except IntegrityError as exc:
        raise HTTPException(409, "Workspace constraint violation") from exc

@router.get("/tree")
def tree(tenant_id: UUID, db: Db):
    orgs = db.scalars(select(Organization).order_by(Organization.name)).all()
    folders = db.scalars(select(Folder).order_by(Folder.name)).all()
    projects = db.scalars(select(Project).order_by(Project.name)).all()
    envs = db.execute(text("SELECT id, organization_id, name FROM organization_environments ORDER BY name")).mappings().all()
    project_by_folder = {}
    for p in projects:
        project_by_folder.setdefault(p.folder_id, []).append({"id": str(p.id), "name": p.name, "kind": "project", "children": []})
    folder_nodes = {f.id: {"id": str(f.id), "name": f.name, "kind": "folder", "children": []} for f in folders}
    root_folders = {}
    for f in folders:
        folder_nodes[f.id]["children"].extend(project_by_folder.get(f.id, []))
        if f.parent_folder_id is not None and f.parent_folder_id in folder_nodes:
            folder_nodes[f.parent_folder_id]["children"].append(folder_nodes[f.id])
        else:
            root_folders.setdefault(f.organization_id, []).append(folder_nodes[f.id])
    env_by_org = {}
    for e in envs:
        env_by_org.setdefault(e["organization_id"], []).append({"id": str(e["id"]), "name": e["name"], "kind": "environment", "children": []})
    return [{"id": str(o.id), "name": o.name, "kind": "org", "children": root_folders.get(o.id, []) + env_by_org.get(o.id, [])} for o in orgs]

@router.get("/summary")
def summary(tenant_id: UUID, db: Db):
    return {"organizations": db.scalar(select(func.count()).select_from(Organization)) or 0,
            "folders": db.scalar(select(func.count()).select_from(Folder)) or 0,
            "projects": db.scalar(select(func.count()).select_from(Project)) or 0,
            "environments": db.scalar(text("SELECT count(*) FROM organization_environments")) or 0}

@router.post("/organizations", status_code=201)
def create_org(tenant_id: UUID, body: OrganizationIn, db: Db):
    obj = Organization(id=uuid4(), tenant_id=tenant_id, name=body.name, slug=body.slug)
    db.add(obj); safe_flush(db)
    return record(obj, slug=obj.slug)

@router.post("/folders", status_code=201)
def create_folder(tenant_id: UUID, body: FolderIn, db: Db):
    require(db, Organization, body.organization_id)
    if body.parent_folder_id:
        parent = require(db, Folder, body.parent_folder_id)
        if parent.organization_id != body.organization_id:
            raise HTTPException(422, "Parent folder belongs to another organization")
    obj = Folder(id=uuid4(), organization_id=body.organization_id, parent_folder_id=body.parent_folder_id, name=body.name)
    db.add(obj); safe_flush(db)
    return record(obj, organization_id=str(obj.organization_id), parent_folder_id=str(obj.parent_folder_id) if obj.parent_folder_id else None)

@router.post("/projects", status_code=201)
def create_project(tenant_id: UUID, body: ProjectIn, db: Db):
    require(db, Folder, body.folder_id)
    obj = Project(id=uuid4(), folder_id=body.folder_id, name=body.name)
    db.add(obj); safe_flush(db)
    return record(obj, folder_id=str(obj.folder_id))

@router.post("/projects/{project_id}/environments", status_code=201)
def create_environment(tenant_id: UUID, project_id: UUID, body: EnvironmentIn, db: Db):
    raise HTTPException(410, "Project environments are deprecated; create environments at organization level")
    obj = ProjectEnvironment(id=uuid4(), project_id=project_id, environment=body.environment)
    db.add(obj); safe_flush(db)
    return {"id": str(obj.id), "project_id": str(project_id), "environment": obj.environment}

@router.patch("/organizations/{resource_id}")
def rename_org(tenant_id: UUID, resource_id: UUID, body: RenameIn, db: Db):
    obj = require(db, Organization, resource_id); obj.name = body.name; safe_flush(db); return record(obj)

@router.patch("/folders/{resource_id}")
def rename_folder(tenant_id: UUID, resource_id: UUID, body: RenameIn, db: Db):
    obj = require(db, Folder, resource_id); obj.name = body.name; safe_flush(db); return record(obj)

@router.patch("/projects/{resource_id}")
def rename_project(tenant_id: UUID, resource_id: UUID, body: RenameIn, db: Db):
    obj = require(db, Project, resource_id); obj.name = body.name; safe_flush(db); return record(obj)


@router.get("/organizations/{organization_id}/settings")
def organization_settings(tenant_id: UUID, organization_id: UUID, db: Db):
    require(db, Organization, organization_id)
    strategy = db.scalar(text("SELECT folder_hierarchy_strategy FROM organizations WHERE id=:id"), {"id": organization_id})
    return {"organization_id": str(organization_id), "folder_hierarchy_strategy": strategy,
            "strategy_editable": db.scalar(text("""SELECT NOT EXISTS (
              SELECT 1 FROM projects p JOIN folders f ON p.folder_id=f.id
              WHERE f.organization_id=:id)"""), {"id": organization_id})}


@router.get("/organizations/{organization_id}/environments")
def list_org_environments(tenant_id: UUID, organization_id: UUID, db: Db):
    require(db, Organization, organization_id)
    rows = db.execute(text("""SELECT id, name FROM organization_environments
        WHERE organization_id=:org ORDER BY name"""), {"org": organization_id}).mappings().all()
    return [{"id": str(row["id"]), "name": row["name"]} for row in rows]


@router.post("/organizations/{organization_id}/environments", status_code=201)
def create_org_environment(tenant_id: UUID, organization_id: UUID, body: EnvironmentIn, db: Db):
    require(db, Organization, organization_id)
    identifier = uuid4()
    try:
        db.execute(text("""INSERT INTO organization_environments (id, organization_id, name)
            VALUES (:id,:org,:name)"""), {"id": identifier, "org": organization_id, "name": body.environment})
        safe_flush(db)
    except IntegrityError as exc:
        raise HTTPException(409, "Environment already exists") from exc
    return {"id": str(identifier), "organization_id": str(organization_id), "name": body.environment}


@router.get("/organizations/{organization_id}/environments/{environment_id}/folders")
def list_environment_folders(tenant_id: UUID, organization_id: UUID, environment_id: UUID, db: Db):
    require(db, Organization, organization_id)
    rows = db.execute(text("""SELECT f.id, f.name, f.parent_folder_id FROM environment_folders f
        JOIN organization_environments e ON e.id=f.environment_id
        WHERE e.id=:env AND e.organization_id=:org ORDER BY f.name"""),
        {"env": environment_id, "org": organization_id}).mappings().all()
    return [{"id": str(r["id"]), "name": r["name"],
             "parent_folder_id": str(r["parent_folder_id"]) if r["parent_folder_id"] else None} for r in rows]


@router.post("/organizations/{organization_id}/environments/{environment_id}/folders", status_code=201)
def create_environment_folder(tenant_id: UUID, organization_id: UUID, environment_id: UUID, body: EnvironmentFolderIn, db: Db):
    require(db, Organization, organization_id)
    if body.organization_id != organization_id:
        raise HTTPException(422, "Organization mismatch")
    env = db.scalar(text("SELECT id FROM organization_environments WHERE id=:env AND organization_id=:org"),
                    {"env": environment_id, "org": organization_id})
    if not env:
        raise HTTPException(404, "Environment not found")
    identifier = uuid4()
    try:
        db.execute(text("""INSERT INTO environment_folders
          (id,organization_id,environment_id,parent_folder_id,name)
          VALUES (:id,:org,:env,:parent,:name)"""),
          {"id": identifier, "org": organization_id, "env": environment_id,
           "parent": body.parent_folder_id, "name": body.name})
        safe_flush(db)
    except IntegrityError as exc:
        raise HTTPException(409, "Invalid environment folder parent") from exc
    return {"id": str(identifier), "name": body.name, "environment_id": str(environment_id)}


@router.patch("/folders/{resource_id}/move")
def move_folder(tenant_id: UUID, resource_id: UUID, body: MoveFolderIn, db: Db):
    """Relocate a development folder without crossing organization boundaries."""
    folder = require(db, Folder, resource_id)
    # Serialize competing moves under the same organization.
    db.execute(text("SELECT id FROM organizations WHERE id=:id FOR UPDATE"),
               {"id": folder.organization_id})
    if body.parent_folder_id == resource_id:
        raise HTTPException(422, "A folder cannot contain itself")
    if body.parent_folder_id:
        parent = require(db, Folder, body.parent_folder_id)
        if parent.organization_id != folder.organization_id:
            raise HTTPException(422, "Cannot move folders between organizations")
        # Walk upward from the proposed parent; cycles must be rejected.
        seen = set()
        cursor = parent
        while cursor is not None:
            if cursor.id == resource_id or cursor.id in seen:
                raise HTTPException(422, "Folder hierarchy cycle detected")
            seen.add(cursor.id)
            cursor = db.get(Folder, cursor.parent_folder_id) if cursor.parent_folder_id else None
    old_parent = folder.parent_folder_id
    folder.parent_folder_id = body.parent_folder_id
    safe_flush(db)
    return record(folder, organization_id=str(folder.organization_id),
                  previous_parent_folder_id=str(old_parent) if old_parent else None,
                  parent_folder_id=str(folder.parent_folder_id) if folder.parent_folder_id else None)


@router.patch("/projects/{resource_id}/move")
def move_project(tenant_id: UUID, resource_id: UUID, body: MoveProjectIn, db: Db):
    """Move a project within its organization, retaining its stable ID."""
    project = require(db, Project, resource_id)
    source = require(db, Folder, project.folder_id)
    destination = require(db, Folder, body.folder_id)
    if source.organization_id != destination.organization_id:
        raise HTTPException(422, "Cannot move projects between organizations")
    db.execute(text("SELECT id FROM organizations WHERE id=:id FOR UPDATE"),
               {"id": source.organization_id})
    previous = project.folder_id
    project.folder_id = destination.id
    safe_flush(db)
    return record(project, previous_folder_id=str(previous), folder_id=str(project.folder_id))


@router.get("/activity")
def workspace_activity(tenant_id: UUID, db: Db, resource_kind: str | None = None,
                       resource_id: UUID | None = None, limit: int = 100):
    """Tenant-scoped append-only resource activity; filtered by exact resource."""
    if limit < 1 or limit > 200:
        raise HTTPException(422, "limit must be between 1 and 200")
    allowed = {"organization", "folder", "project", "environment", "environment_folder"}
    if resource_kind is not None and resource_kind not in allowed:
        raise HTTPException(422, "Invalid resource kind")
    rows = db.execute(text("""
        SELECT id, resource_kind, resource_id, operation, actor_id, happened_at,
               old_values, new_values
        FROM public.workspace_activity
        WHERE tenant_id = :tenant_id
          AND ( CAST(:kind AS text) IS NULL
              OR resource_kind = CAST(:kind AS text))
          AND ( CAST(:resource_id AS uuid) IS NULL
              OR resource_id = CAST(:resource_id AS uuid))
        ORDER BY happened_at DESC, id DESC LIMIT :limit
    """), {"tenant_id": tenant_id, "kind": resource_kind,
           "resource_id": resource_id, "limit": limit}).mappings().all()
    return [{"id": str(r["id"]), "resource_kind": r["resource_kind"],
             "resource_id": str(r["resource_id"]), "operation": r["operation"],
             "actor_id": str(r["actor_id"]) if r["actor_id"] else None,
             "happened_at": r["happened_at"].isoformat(),
             "old_values": r["old_values"], "new_values": r["new_values"]}
            for r in rows]
