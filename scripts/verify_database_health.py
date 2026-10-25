"""ArchitectIQ Database Health, Catalog & RLS Verification Tool (Milestone M12 / OPS-02).

Performs:
1. Explicit connection requirement (zero hardcoded credentials or fallback strings).
2. Protection against targeting architectiq_dev or production databases.
3. Schema-qualified PostgreSQL catalog inspection for all 32 required tables.
4. Schema-qualified inspection of Row-Level Security (RLS) policies on all 28 multi-tenant tables.
5. Actual runtime RLS enforcement testing using the restricted architectiq_app role.
6. WAL settings and replication state inspection (archive_mode, archive_command, wal_level).
"""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.parse
import uuid
from datetime import UTC, datetime

import psycopg

FORBIDDEN_DB_NAMES = {"architectiq_dev", "architectiq_prod", "architectiq_production", "postgres"}

REQUIRED_TABLES = [
    "tenants",
    "users",
    "tenant_memberships",
    "organizations",
    "folders",
    "projects",
    "project_memberships",
    "project_environments",
    "promotion_requests",
    "workflow_definitions",
    "workflow_versions",
    "workflow_runs",
    "workflow_step_runs",
    "workflow_queues",
    "approval_tasks",
    "business_rules",
    "ai_agents",
    "ai_agent_invocations",
    "ai_agent_evaluations",
    "document_schemas",
    "documents",
    "document_annotations",
    "credential_references",
    "connectors",
    "integration_tools",
    "project_templates",
    "system_metrics",
    "incident_tickets",
    "sla_breach_events",
    "runbooks",
    "compliance_policies",
    "compliance_audit_reports",
]

RLS_TABLES = [
    "organizations",
    "folders",
    "projects",
    "project_memberships",
    "project_environments",
    "workflow_definitions",
    "workflow_versions",
    "workflow_runs",
    "workflow_step_runs",
    "workflow_queues",
    "approval_tasks",
    "business_rules",
    "ai_agents",
    "ai_agent_invocations",
    "ai_agent_evaluations",
    "document_schemas",
    "documents",
    "document_annotations",
    "credential_references",
    "connectors",
    "integration_tools",
    "project_templates",
    "system_metrics",
    "incident_tickets",
    "sla_breach_events",
    "runbooks",
    "compliance_policies",
    "compliance_audit_reports",
]


def validate_target_url(raw_url: str | None) -> str:
    if not raw_url or not raw_url.strip():
        print("[FAIL] CONFIGURATION ERROR: TARGET_DATABASE_URL or DATABASE_URL must be explicitly provided.")
        print("Hardcoded credentials and fallback connection strings are strictly prohibited.")
        sys.exit(1)

    parsed = urllib.parse.urlparse(raw_url)
    db_name = parsed.path.lstrip("/").lower()
    hostname = (parsed.hostname or "").lower()

    if db_name in FORBIDDEN_DB_NAMES or "prod" in db_name or "production" in db_name:
        print(f"[FAIL] SECURITY GUARDRAIL REJECTION: Target database '{db_name}' is a protected development or production database.")
        print("Refusing execution to prevent unintended impact on development/production environments.")
        sys.exit(2)

    if "prod" in hostname or "production" in hostname:
        print(f"[FAIL] SECURITY GUARDRAIL REJECTION: Hostname '{hostname}' indicates production environment.")
        sys.exit(2)

    return raw_url


def run_database_health_checks(raw_url: str) -> dict[str, str]:
    clean_url = validate_target_url(raw_url).replace("postgresql+psycopg://", "postgresql://")
    parsed = urllib.parse.urlparse(clean_url)
    db_name = parsed.path.lstrip("/")

    print("=" * 75)
    print("ArchitectIQ Database Health & RLS Catalog Inspection (OPS-02)")
    print(f"Timestamp: {datetime.now(UTC).isoformat()}")
    print(f"Target Database: {parsed.hostname}:{parsed.port}/{db_name}")
    print("=" * 75)

    results: dict[str, str] = {}
    t0 = time.perf_counter()

    # 1. Connection check
    try:
        conn = psycopg.connect(clean_url)
    except Exception as exc:
        print(f"[FAIL] DATABASE_CONNECTIVITY: Connection failed: {exc}")
        results["DATABASE_CONNECTIVITY"] = "FAIL"
        return results

    results["DATABASE_CONNECTIVITY"] = "PASS"
    results["PROTECTED_TARGET_GUARD"] = "PASS"

    with conn:
        with conn.cursor() as cur:
            # Check version
            cur.execute("SELECT version();")
            version_str = cur.fetchone()[0]
            print(f"[PASS] Connected successfully: {version_str.split(',')[0]}")

            # 2. Schema-qualified table inspection
            cur.execute(
                """
                SELECT c.relname
                FROM pg_catalog.pg_class c
                JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
                WHERE n.nspname = 'public' AND c.relkind = 'r'
                """
            )
            existing_tables = {row[0] for row in cur.fetchall()}
            missing_tables = [tbl for tbl in REQUIRED_TABLES if tbl not in existing_tables]

            if missing_tables:
                print(f"[FAIL] SCHEMA_TABLE_INVENTORY: Missing required tables: {missing_tables}")
                results["SCHEMA_TABLE_INVENTORY"] = "FAIL"
            else:
                print(f"[PASS] SCHEMA_TABLE_INVENTORY: All {len(REQUIRED_TABLES)} required tables present in 'public' schema.")
                results["SCHEMA_TABLE_INVENTORY"] = "PASS"

            # 3. Schema-qualified RLS catalog inspection
            cur.execute(
                """
                SELECT c.relname, c.relrowsecurity, count(p.oid) AS policy_count
                FROM pg_catalog.pg_class c
                JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
                LEFT JOIN pg_catalog.pg_policy p ON p.polrelid = c.oid
                WHERE n.nspname = 'public'
                  AND c.relkind = 'r'
                  AND c.relname = ANY(%s)
                GROUP BY c.relname, c.relrowsecurity
                """,
                (RLS_TABLES,),
            )
            rls_rows = cur.fetchall()
            rls_map = {row[0]: (row[1], row[2]) for row in rls_rows}

            rls_failures = []
            for tbl in RLS_TABLES:
                if tbl not in rls_map:
                    rls_failures.append(f"{tbl} (missing from catalog)")
                elif not rls_map[tbl][0]:
                    rls_failures.append(f"{tbl} (relrowsecurity=False)")
                elif rls_map[tbl][1] == 0:
                    rls_failures.append(f"{tbl} (0 policies defined)")

            if rls_failures:
                print(f"[FAIL] SCHEMA_QUALIFIED_RLS_CATALOG: RLS defects detected: {rls_failures}")
                results["SCHEMA_QUALIFIED_RLS_CATALOG"] = "FAIL"
            else:
                print(f"[PASS] SCHEMA_QUALIFIED_RLS_CATALOG: All {len(RLS_TABLES)} multi-tenant tables have active RLS & policies.")
                results["SCHEMA_QUALIFIED_RLS_CATALOG"] = "PASS"

            # 4. Actual runtime RLS behavior test with restricted application role
            try:
                # Seed test data for tenant isolation test in a subtransaction
                tenant_a = uuid.uuid4()
                tenant_b = uuid.uuid4()
                cur.execute(
                    """
                    INSERT INTO public.tenants (id, name, slug, created_at) VALUES
                    (%s, 'Health Test Tenant A', %s, NOW()),
                    (%s, 'Health Test Tenant B', %s, NOW())
                    ON CONFLICT DO NOTHING;
                    """,
                    (tenant_a, f"ht-a-{tenant_a.hex[:6]}", tenant_b, f"ht-b-{tenant_b.hex[:6]}"),
                )
                cur.execute(
                    """
                    INSERT INTO public.compliance_policies (id, tenant_id, name, policy_type, rules) VALUES
                    (%s, %s, 'Policy Tenant A', 'DATA_RETENTION', '{"days": 30}'::jsonb),
                    (%s, %s, 'Policy Tenant B', 'DATA_RETENTION', '{"days": 60}'::jsonb);
                    """,
                    (uuid.uuid4(), tenant_a, uuid.uuid4(), tenant_b),
                )

                # Switch to restricted application role
                cur.execute("SET ROLE architectiq_app;")

                # Test 4a: Default-deny with no tenant context
                cur.execute("RESET architectiq.tenant_id;")
                cur.execute("SELECT count(*) FROM public.compliance_policies WHERE tenant_id IN (%s, %s);", (tenant_a, tenant_b))
                count_unauth = cur.fetchone()[0]

                # Test 4b: Authorized Tenant A
                cur.execute("SELECT set_config('architectiq.tenant_id', %s, true);", (str(tenant_a),))
                cur.execute("SELECT count(*) FROM public.compliance_policies WHERE tenant_id IN (%s, %s);", (tenant_a, tenant_b))
                count_tenant_a = cur.fetchone()[0]

                # Test 4c: Authorized Tenant B
                cur.execute("SELECT set_config('architectiq.tenant_id', %s, true);", (str(tenant_b),))
                cur.execute("SELECT count(*) FROM public.compliance_policies WHERE tenant_id IN (%s, %s);", (tenant_a, tenant_b))
                count_tenant_b = cur.fetchone()[0]

                # Reset role back
                cur.execute("RESET ROLE;")

                # Clean up seeded test records
                cur.execute("DELETE FROM public.compliance_policies WHERE tenant_id IN (%s, %s);", (tenant_a, tenant_b))
                cur.execute("DELETE FROM public.tenants WHERE id IN (%s, %s);", (tenant_a, tenant_b))

                if count_unauth == 0 and count_tenant_a == 1 and count_tenant_b == 1:
                    print("[PASS] RESTRICTED_ROLE_RLS_ENFORCEMENT: architectiq_app verified under default-deny and tenant contexts.")
                    results["RESTRICTED_ROLE_RLS_ENFORCEMENT"] = "PASS"
                else:
                    print(f"[FAIL] RESTRICTED_ROLE_RLS_ENFORCEMENT: unauth={count_unauth}, tA={count_tenant_a}, tB={count_tenant_b}")
                    results["RESTRICTED_ROLE_RLS_ENFORCEMENT"] = "FAIL"

            except Exception as rls_exc:
                print(f"[FAIL] RESTRICTED_ROLE_RLS_ENFORCEMENT: Exception testing architectiq_app: {rls_exc}")
                results["RESTRICTED_ROLE_RLS_ENFORCEMENT"] = "FAIL"

            # 5. WAL and replication inspection
            cur.execute("SELECT name, setting FROM pg_catalog.pg_settings WHERE name IN ('wal_level', 'archive_mode', 'archive_command');")
            wal_settings = dict(cur.fetchall())
            cur.execute("SELECT pg_catalog.pg_current_wal_lsn();")
            current_lsn = cur.fetchone()[0]

            print(f"[INFO] Current WAL LSN: {current_lsn}")
            print(f"[INFO] wal_level: {wal_settings.get('wal_level')}")
            print(f"[INFO] archive_mode: {wal_settings.get('archive_mode')}")
            print(f"[INFO] archive_command: {wal_settings.get('archive_command')}")

            if wal_settings.get("archive_mode") == "on":
                results["WAL_ARCHIVING_CONFIGURATION"] = "CONFIGURED"
            else:
                results["WAL_ARCHIVING_CONFIGURATION"] = "NOT CONFIGURED"

    elapsed = round(time.perf_counter() - t0, 3)
    print("=" * 75)
    print(f"Health Checks Complete in {elapsed}s.")
    print(json.dumps(results, indent=2))
    print("=" * 75)

    return results


if __name__ == "__main__":
    target_env = os.environ.get("TARGET_DATABASE_URL") or os.environ.get("DATABASE_URL")
    run_database_health_checks(target_env)
