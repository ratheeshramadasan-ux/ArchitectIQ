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
