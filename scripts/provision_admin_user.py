"""Provision default enterprise administrator credentials into architectiq_test.

Creates:
- Tenant: 'ArchitectIQ Enterprise' (slug: 'enterprise-demo')
- User: 'Enterprise Admin' (email: 'admin@architectiq.io', password: 'Password@12345')
- Active tenant membership
- Native credential record
- Sample organization, folder, and project with OWNER permission
"""
import uuid
from uuid import UUID
import psycopg
from argon2 import PasswordHasher

DB_URL = "postgresql://architectiq:Mad%407878@127.0.0.1:5433/architectiq_test"
EMAIL = "admin@architectiq.io"
PASSWORD = "Password@12345"
NAME = "Enterprise Admin"

TENANT_ID = UUID("a0000000-0000-4000-8000-000000000001")
USER_ID = UUID("a0000000-0000-4000-8000-000000000002")
ORG_ID = UUID("a0000000-0000-4000-8000-000000000003")
FOLDER_ID = UUID("a0000000-0000-4000-8000-000000000004")
PROJECT_ID = UUID("a0000000-0000-4000-8000-000000000005")

ph = PasswordHasher(time_cost=3, memory_cost=65536, parallelism=2)
pwd_hash = ph.hash(PASSWORD)


def provision():
    with psycopg.connect(DB_URL, autocommit=True) as conn:
        with conn.cursor() as cur:
            # 1. Tenant
            cur.execute("""
                INSERT INTO public.tenants (id, name, slug, created_at)
                VALUES (%s, 'ArchitectIQ Enterprise', 'enterprise-demo', now())
                ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name
            """, (TENANT_ID,))

            # 2. User
            cur.execute("""
                INSERT INTO public.users (id, display_name, status, created_at)
                VALUES (%s, %s, 'ACTIVE', now())
                ON CONFLICT (id) DO UPDATE SET status = 'ACTIVE'
            """, (USER_ID, NAME))

            # 3. Tenant membership
            cur.execute("""
                INSERT INTO public.tenant_memberships (id, user_id, tenant_id, status, created_at)
                VALUES (%s, %s, %s, 'ACTIVE', now())
                ON CONFLICT (user_id, tenant_id) DO UPDATE SET status = 'ACTIVE'
            """, (uuid.uuid4(), USER_ID, TENANT_ID))

            # 4. Native credentials
            cur.execute("""
                INSERT INTO public.native_credentials (user_id, email, password_hash, created_at)
                VALUES (%s, %s, %s, now())
                ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
            """, (USER_ID, EMAIL, pwd_hash))

            # 5. Organization
            cur.execute("""
                INSERT INTO public.organizations (id, tenant_id, name, slug, created_at)
                VALUES (%s, %s, 'Global Operations', 'global-ops', now())
                ON CONFLICT (id) DO NOTHING
            """, (ORG_ID, TENANT_ID))

            # 6. Folder
            cur.execute("""
                INSERT INTO public.folders (id, organization_id, name, created_at)
                VALUES (%s, %s, 'Enterprise Automations', now())
                ON CONFLICT (id) DO NOTHING
            """, (FOLDER_ID, ORG_ID))

            # 7. Project
            cur.execute("""
                INSERT INTO public.projects (id, folder_id, name, lifecycle_status, created_at)
                VALUES (%s, %s, 'Invoice AI Automation', 'ACTIVE', now())
                ON CONFLICT (id) DO NOTHING
            """, (PROJECT_ID, FOLDER_ID))

            # 8. Project membership (OWNER)
            cur.execute("""
                INSERT INTO public.project_memberships (id, tenant_id, project_id, user_id, role, created_at)
                VALUES (%s, %s, %s, %s, 'OWNER', now())
                ON CONFLICT (project_id, user_id) DO UPDATE SET role = 'OWNER'
            """, (uuid.uuid4(), TENANT_ID, PROJECT_ID, USER_ID))

    print(f"Provisioned successfully:")
    print(f"  Email: {EMAIL}")
    print(f"  Password: {PASSWORD}")
    print(f"  Tenant: ArchitectIQ Enterprise ({TENANT_ID})")


if __name__ == "__main__":
    provision()
