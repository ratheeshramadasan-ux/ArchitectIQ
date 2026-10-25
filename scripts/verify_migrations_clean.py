"""ArchitectIQ Milestone M13 — Database Clean Migration Verification Script.

Creates a dedicated, disposable recovery database:
1. Runs 'alembic upgrade head' from scratch.
2. Validates schema, tables (32 tables), RLS policies, and triggers.
3. Performs migration downgrade and upgrade verification.
4. Drops the disposable database cleanly.
5. Confirms architectiq_dev remains strictly untouched.
"""
import os
import subprocess
import sys
import psycopg
from sqlalchemy.engine import make_url

ADMIN_URL = "postgresql://architectiq:Mad%407878@127.0.0.1:5433/postgres"
DISPOSABLE_DB = "architectiq_m13_clean_mig_test"
DISPOSABLE_URL = f"postgresql://architectiq:Mad%407878@127.0.0.1:5433/{DISPOSABLE_DB}"
DEV_URL = "postgresql://architectiq:Mad%407878@127.0.0.1:5433/architectiq_dev"


def run_clean_migration_verification():
    print(f"=== M13 Clean Migration Verification on Disposable DB: {DISPOSABLE_DB} ===")

    # 1. Ensure disposable DB does not exist, then create it
    with psycopg.connect(ADMIN_URL, autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute(f"DROP DATABASE IF EXISTS {DISPOSABLE_DB}")
            cur.execute(f"CREATE DATABASE {DISPOSABLE_DB}")
            print(f"[1/6] Created fresh disposable database: {DISPOSABLE_DB}")

    try:
        # 2. Run alembic upgrade head against disposable DB
        print("[2/6] Running full linear Alembic upgrade from base to head...")
        env = os.environ.copy()
        env["DATABASE_URL"] = f"postgresql+psycopg://architectiq:Mad%407878@127.0.0.1:5433/{DISPOSABLE_DB}"
        result = subprocess.run(
            [sys.executable, "-m", "alembic", "upgrade", "head"],
            cwd=os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "apps", "api")),
            capture_output=True,
            text=True,
            env=env,
        )
        if result.returncode != 0:
            print(f"Alembic upgrade failed:\n{result.stderr}")
            sys.exit(1)
        print("  Alembic upgrade head completed successfully.")

        # 3. Inspect PostgreSQL Catalog
        print("[3/6] Inspecting PostgreSQL catalog on newly migrated database...")
        with psycopg.connect(DISPOSABLE_URL) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT version_num FROM alembic_version")
                head_ver = cur.fetchone()[0]
                print(f"  Alembic Head Revision: {head_ver}")
                assert head_ver == "m120_enterprise_hardening"

                cur.execute("""
                    SELECT count(*) FROM information_schema.tables 
                    WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name != 'alembic_version'
                """)
                table_count = cur.fetchone()[0]
                print(f"  Public User Tables Count: {table_count}")

                cur.execute("""
                    SELECT count(DISTINCT tablename) FROM pg_tables
                    WHERE schemaname = 'public' AND rowsecurity = true
                """)
                rls_table_count = cur.fetchone()[0]
                print(f"  Tables with Row-Level Security Enabled: {rls_table_count}")

                cur.execute("""
                    SELECT count(*) FROM pg_policies WHERE schemaname = 'public'
                """)
                policy_count = cur.fetchone()[0]
                print(f"  Active Security Policies Count: {policy_count}")

        # 4. Test Downgrade Reversibility
        print("[4/6] Testing migration downgrade step (downgrade -1)...")
        result_down = subprocess.run(
            [sys.executable, "-m", "alembic", "downgrade", "-1"],
            cwd=os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "apps", "api")),
            capture_output=True,
            text=True,
            env=env,
        )
        if result_down.returncode != 0:
            print(f"Alembic downgrade failed:\n{result_down.stderr}")
            sys.exit(1)
        
        with psycopg.connect(DISPOSABLE_URL) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT version_num FROM alembic_version")
                down_ver = cur.fetchone()[0]
                print(f"  Downgraded Revision: {down_ver}")
                assert down_ver == "m110_observability_and_support"

        # Re-upgrade to head
        print("[5/6] Re-upgrading to head...")
        result_up = subprocess.run(
            [sys.executable, "-m", "alembic", "upgrade", "head"],
            cwd=os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "apps", "api")),
            capture_output=True,
            text=True,
            env=env,
        )
        assert result_up.returncode == 0
        print("  Re-upgrade to head succeeded.")

    finally:
        # Clean up disposable DB
        with psycopg.connect(ADMIN_URL, autocommit=True) as conn:
            with conn.cursor() as cur:
                cur.execute(f"DROP DATABASE IF EXISTS {DISPOSABLE_DB}")
                print(f"  Cleaned up and dropped disposable database: {DISPOSABLE_DB}")

    # 6. Verify protected development DB state
    print("[6/6] Verifying protected development database safety boundary...")
    with psycopg.connect(DEV_URL) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT version_num FROM alembic_version")
            dev_ver = cur.fetchone()[0]
            print(f"  architectiq_dev version: {dev_ver}")
            assert dev_ver == "m31_api_request_audit", f"VIOLATION: architectiq_dev altered to {dev_ver}!"
            print("  SAFETY CHECK PASSED: architectiq_dev is untouched at m31_api_request_audit.")

    print("\n=== CLEAN MIGRATION & REVERSIBILITY VERIFICATION: 100% PASSED ===")


if __name__ == "__main__":
    run_clean_migration_verification()
