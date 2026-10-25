"""Return and create tenants belonging to the verified current user."""
import re
from typing import Annotated
from uuid import UUID, uuid4
from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from authentication import get_authenticated_user_id
from database import IAMSessionLocal, SessionLocal

router = APIRouter(prefix='/api/v1', tags=['Tenant discovery'])


class TenantCreateIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    slug: str | None = Field(default=None, max_length=120)


@router.get('/me/tenants')
def my_tenants(user_id: Annotated[UUID, Depends(get_authenticated_user_id)]):
    with IAMSessionLocal() as db, db.begin():
        db.execute(text('SET LOCAL ROLE architectiq_iam'))
        rows = db.execute(text('SELECT id,name,slug FROM public.architectiq_list_user_tenants(CAST(:uid AS uuid))'), {'uid':str(user_id)}).all()
        return [{'id':str(row.id),'name':row.name,'slug':row.slug} for row in rows]


@router.post('/tenants', status_code=status.HTTP_201_CREATED)
def create_tenant(
    body: TenantCreateIn,
    user_id: Annotated[UUID, Depends(get_authenticated_user_id)],
):
    name = body.name.strip()
    slug = (body.slug or re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-'))
    if not slug:
        slug = f"tenant-{uuid4().hex[:6]}"

    tenant_id = uuid4()
    org_id = uuid4()
    with SessionLocal() as db, db.begin():
        existing = db.execute(text("SELECT id FROM public.tenants WHERE slug = :s"), {"s": slug}).scalar()
        if existing:
            slug = f"{slug}-{uuid4().hex[:4]}"
        db.execute(
            text("INSERT INTO public.tenants (id, name, slug, created_at) VALUES (:tid, :name, :slug, clock_timestamp())"),
            {"tid": tenant_id, "name": name, "slug": slug},
        )
        db.execute(
            text("INSERT INTO public.tenant_memberships (id, user_id, tenant_id, status, created_at) VALUES (:mid, :uid, :tid, 'ACTIVE', clock_timestamp())"),
            {"mid": uuid4(), "uid": user_id, "tid": tenant_id},
        )
        db.execute(
            text("INSERT INTO public.organizations (id, tenant_id, name, slug, created_at, folder_hierarchy_strategy) VALUES (:oid, :tid, :name, :slug, clock_timestamp(), 'INDEPENDENT')"),
            {"oid": org_id, "tid": tenant_id, "name": name, "slug": slug},
        )
        for env_name in ["DEV", "TEST", "PROD"]:
            db.execute(
                text("INSERT INTO public.organization_environments (id, organization_id, name, created_at) VALUES (:eid, :oid, :ename, clock_timestamp())"),
                {"eid": uuid4(), "oid": org_id, "ename": env_name},
            )
    return {"id": str(tenant_id), "name": name, "slug": slug}
