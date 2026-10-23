"""Return only tenants belonging to the verified current user."""
from typing import Annotated
from uuid import UUID
from fastapi import APIRouter, Depends
from sqlalchemy import text
from authentication import get_authenticated_user_id
from database import IAMSessionLocal

router = APIRouter(prefix='/api/v1', tags=['Tenant discovery'])

@router.get('/me/tenants')
def my_tenants(user_id: Annotated[UUID, Depends(get_authenticated_user_id)]):
    with IAMSessionLocal() as db, db.begin():
        db.execute(text('SET LOCAL ROLE architectiq_iam'))
        rows = db.execute(text('SELECT id,name,slug FROM public.architectiq_list_user_tenants(CAST(:uid AS uuid))'), {'uid':str(user_id)}).all()
        return [{'id':str(row.id),'name':row.name,'slug':row.slug} for row in rows]
