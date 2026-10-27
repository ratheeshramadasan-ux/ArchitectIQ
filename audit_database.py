import os
import json
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

load_dotenv('apps/api/.env')
db_url = os.getenv('DATABASE_URL')
engine = create_engine(db_url)

with engine.connect() as conn:
    # 1. Get all tables in public schema
    tables = conn.execute(text("""
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        ORDER BY table_name;
    """)).fetchall()
    
    print("=== TABLES IN PUBLIC SCHEMA ===")
    for (t,) in tables:
        count = conn.execute(text(f"SELECT COUNT(*) FROM public.{t}")).scalar()
        print(f"  {t}: {count} rows")
        
    print("\n=== ORGANIZATIONS ===")
    orgs = conn.execute(text("SELECT id, slug, name, subscription_tier, status, created_at FROM public.platform_organizations")).fetchall()
    for o in orgs:
        print(f"  ID: {o[0]} | Slug: {o[1]} | Name: {o[2]} | Tier: {o[3]} | Status: {o[4]} | Created: {o[5]}")

    print("\n=== TENANTS ===")
    tenants = conn.execute(text("""
        SELECT t.id, t.slug, t.name, t.organization_id, t.status, t.created_at, po.name as org_name
        FROM public.tenants t
        LEFT JOIN public.platform_organizations po ON t.organization_id = po.id
    """)).fetchall()
    for t in tenants:
        print(f"  ID: {t[0]} | Slug: {t[1]} | Name: {t[2]} | OrgID: {t[3]} ({t[6]}) | Status: {t[4]}")

    print("\n=== TENANT ENVIRONMENTS ===")
    envs = conn.execute(text("""
        SELECT te.id, te.tenant_id, te.name, te.is_enabled, t.name as tenant_name
        FROM public.tenant_environments te
        JOIN public.tenants t ON te.tenant_id = t.id
    """)).fetchall()
    for e in envs:
        print(f"  ID: {e[0]} | Tenant: {e[4]} ({e[1]}) | Name: {e[2]} | Enabled: {e[3]}")

    print("\n=== TENANT DEPLOYMENTS ===")
    deps = conn.execute(text("""
        SELECT td.id, td.tenant_id, td.deployment_model, td.hosting_region, td.cloud_provider, t.name as tenant_name
        FROM public.tenant_deployments td
        JOIN public.tenants t ON td.tenant_id = t.id
    """)).fetchall()
    for d in deps:
        print(f"  ID: {d[0]} | Tenant: {d[5]} | Model: {d[2]} | Region: {d[3]} | Cloud: {d[4]}")

    print("\n=== USERS ===")
    users = conn.execute(text("SELECT id, display_name, status, created_at FROM public.users LIMIT 10")).fetchall()
    for u in users:
        print(f"  ID: {u[0]} | Display: {u[1]} | Status: {u[2]}")

    print("\n=== FOLDERS & PROJECTS ===")
    # Check if folder or project tables exist
    has_folders = conn.execute(text("SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'folders')")).scalar()
    print(f"  Table 'folders' exists: {has_folders}")
    if has_folders:
        folder_rows = conn.execute(text("SELECT * FROM public.folders LIMIT 10")).fetchall()
        print(f"  Folders count: {len(folder_rows)}")

    has_projects = conn.execute(text("SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'projects')")).scalar()
    print(f"  Table 'projects' exists: {has_projects}")

    has_workspace_activity = conn.execute(text("SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'workspace_activity')")).scalar()
    print(f"  Table 'workspace_activity' exists: {has_workspace_activity}")
