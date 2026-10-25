"""Purge all dummy and test data from architectiq_test, preserving only the Admin User."""
import os
import sys
import psycopg

DB_URL = os.environ.get(
    "CLEAN_DATABASE_URL",
    "postgresql://architectiq:Mad%407878@localhost:5433/architectiq_test",
)

if "architectiq_dev" in DB_URL:
    print("FATAL ERROR: Refusing to run clean script against architectiq_dev!")
    sys.exit(1)


def clean_database():
    print(f"Connecting to {DB_URL}...")
    with psycopg.connect(DB_URL) as conn:
        with conn.cursor() as cur:
            # 1. Identify admin user ID
            cur.execute("SELECT user_id, email FROM public.native_credentials WHERE email = 'admin@architectiq.io'")
            admin_row = cur.fetchone()
            if not admin_row:
                print("ERROR: admin@architectiq.io not found in native_credentials!")
                sys.exit(1)
            admin_id, admin_email = admin_row
            print(f"Preserving Admin User: {admin_email} (ID: {admin_id})")

            # 2. Ordered deletions / truncations
            tables_to_empty = [
                "workflow_step_runs",
                "workflow_runs",
                "workflow_versions",
                "workflow_definitions",
                "workflow_queues",
                "ai_agent_evaluations",
                "ai_agent_invocations",
                "ai_agents",
                "document_annotations",
                "documents",
                "document_schemas",
                "approval_tasks",
                "business_rules",
                "compliance_audit_reports",
                "compliance_policies",
                "incident_tickets",
                "sla_breach_events",
                "system_metrics",
                "integration_tools",
                "connectors",
                "credential_references",
                "runbooks",
                "promotion_requests",
                "project_environment_bindings",
                "project_environments",
                "project_memberships",
                "project_templates",
                "projects",
                "environment_folders",
                "folders",
                "organization_environments",
                "organizations",
                "workspace_activity",
                "api_request_audit",
                "tenant_memberships",
                "tenants",
                "user_external_identities",
                "native_sessions",
            ]

            for tbl in tables_to_empty:
                cur.execute(f"DELETE FROM public.{tbl}")
                print(f"Cleared table public.{tbl} (rows deleted: {cur.rowcount})")

            # 3. Clean users except admin
            cur.execute("DELETE FROM public.users WHERE id != %s", (admin_id,))
            print(f"Cleared test users from public.users (rows deleted: {cur.rowcount})")

            # 4. Clean native_credentials except admin
            cur.execute("DELETE FROM public.native_credentials WHERE user_id != %s", (admin_id,))
            print(f"Cleared credentials from public.native_credentials (rows deleted: {cur.rowcount})")

            # 5. Verify status of admin user
            cur.execute("UPDATE public.users SET status = 'ACTIVE' WHERE id = %s", (admin_id,))

        conn.commit()
    print("Database cleanup completed successfully.")


if __name__ == "__main__":
    clean_database()
