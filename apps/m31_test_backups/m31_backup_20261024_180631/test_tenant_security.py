from sqlalchemy import text

from database import RuntimeSessionLocal


def test_missing_tenant_context_exposes_no_records():
    tables = (
        "tenants",
        "organizations",
        "folders",
        "projects",
        "project_environments",
    )

    with RuntimeSessionLocal() as session:
        with session.begin():
            assert session.scalar(
                text("SELECT current_user")
            ) == "architectiq_app"

            context = session.scalar(
                text(
                    "SELECT current_setting("
                    "'architectiq.tenant_id', true)"
                )
            )
            assert context in (None, "")

            for table in tables:
                count = session.scalar(
                    text(f"SELECT COUNT(*) FROM public.{table}")
                )
                assert count == 0, (
                    f"{table} exposed {count} rows "
                    "without tenant context"
                )
from uuid import UUID

from sqlalchemy import text
from database import tenant_session

TENANT_A = UUID("11111111-1111-4111-8111-111111111111")
TENANT_B = UUID("22222222-2222-4222-8222-222222222222")


def test_cross_tenant_rls_isolation():
    tables = (
        "tenants",
        "organizations",
        "folders",
        "projects",
        "project_environments",
    )

    def visible_ids(tenant_id):
        results = {}

        with tenant_session(tenant_id) as session:
            assert session.scalar(
                text("SELECT current_user")
            ) == "architectiq_app"

            for table in tables:
                results[table] = set(
                    session.execute(
                        text(f"SELECT id FROM public.{table}")
                    ).scalars().all()
                )

        return results

    tenant_a = visible_ids(TENANT_A)
    tenant_b = visible_ids(TENANT_B)

    for table in tables:
        assert tenant_a[table], (
            f"Tenant A has no test records in {table}"
        )

        assert tenant_b[table], (
            f"Tenant B has no test records in {table}"
        )

        assert tenant_a[table].isdisjoint(tenant_b[table]), (
            f"Cross-tenant exposure detected in {table}"
        )
from database import engine


def test_visible_records_have_correct_tenant_ownership():
    ownership_queries = {
        "tenants": """
            SELECT id, id AS owner_tenant_id
            FROM public.tenants
        """,
        "organizations": """
            SELECT id, tenant_id AS owner_tenant_id
            FROM public.organizations
        """,
        "folders": """
            SELECT f.id, o.tenant_id AS owner_tenant_id
            FROM public.folders f
            JOIN public.organizations o
              ON o.id = f.organization_id
        """,
        "projects": """
            SELECT p.id, o.tenant_id AS owner_tenant_id
            FROM public.projects p
            JOIN public.folders f ON f.id = p.folder_id
            JOIN public.organizations o
              ON o.id = f.organization_id
        """,
        "project_environments": """
            SELECT pe.id, o.tenant_id AS owner_tenant_id
            FROM public.project_environments pe
            JOIN public.projects p ON p.id = pe.project_id
            JOIN public.folders f ON f.id = p.folder_id
            JOIN public.organizations o
              ON o.id = f.organization_id
        """,
    }

    # Admin connection is used only to establish authoritative
    # ownership, not to test tenant-restricted visibility.
    with engine.connect() as admin:
        ownership = {
            table: {
                row.id: row.owner_tenant_id
                for row in admin.execute(text(query))
            }
            for table, query in ownership_queries.items()
        }

    for tenant_id in (TENANT_A, TENANT_B):
        with tenant_session(tenant_id) as session:
            for table in ownership_queries:
                visible_ids = session.execute(
                    text(f"SELECT id FROM public.{table}")
                ).scalars().all()

                assert visible_ids, (
                    f"No fixture records for {table}"
                )

                for record_id in visible_ids:
                    assert ownership[table][record_id] == tenant_id, (
                        f"SECURITY FAILURE: {table} record "
                        f"{record_id} belongs to another tenant"
                    )
