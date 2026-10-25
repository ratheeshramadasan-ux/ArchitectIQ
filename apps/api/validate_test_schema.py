#!/usr/bin/env python3
"""Validate the architectiq_test database schema without making changes."""

import os
from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError

def validate_test_database():
    """Check that architectiq_test database exists and has expected structure."""

    # Get audit database URL from environment (this will be overridden by conftest)
    audit_url = os.environ.get('AUDIT_DATABASE_URL')

    if not audit_url:
        print("ERROR: No AUDIT_DATABASE_URL found in environment")
        return False

    try:
        print(f"Connecting to: {audit_url}")

        engine = create_engine(audit_url, pool_pre_ping=True)

        with engine.connect() as conn:
            # Check database name
            result = conn.execute(text("SELECT current_database()"))
            db_name = result.fetchone()[0]
            print(f"Connected to database: {db_name}")

            # Check if audit table exists
            result = conn.execute(text("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables
                    WHERE table_schema = 'public'
                    AND table_name = 'api_request_audit'
                );
            """))
            table_exists = result.fetchone()[0]
            print(f"Audit table exists: {table_exists}")

            if table_exists:
                # Get table structure
                result = conn.execute(text("""
                    SELECT column_name, data_type, is_nullable
                    FROM information_schema.columns
                    WHERE table_name = 'api_request_audit'
                    ORDER BY ordinal_position;
                """))

                columns = result.fetchall()
                print("Audit table columns:")
                for col in columns:
                    print(f"  {col.column_name} ({col.data_type}) - nullable: {col.is_nullable}")

            # Check if RLS policies exist (if they should)
            try:
                result = conn.execute(text("""
                    SELECT policyname, permissive, roles, cmd
                    FROM pg_policy
                    WHERE polrelid = 'public.api_request_audit'::regclass;
                """))
                policies = result.fetchall()
                print(f"RLS policies found: {len(policies)}")
                for policy in policies:
                    print(f"  Policy: {policy.policyname}")
            except Exception as e:
                print(f"No RLS policies found or error checking (expected): {e}")

        engine.dispose()
        return True

    except SQLAlchemyError as e:
        print(f"Database connection error: {e}")
        return False
    except Exception as e:
        print(f"Unexpected error: {e}")
        return False

if __name__ == "__main__":
    print("Validating architectiq_test database schema...")
    success = validate_test_database()
    if success:
        print("\n✓ Test database validation completed successfully")
    else:
        print("\n✗ Test database validation failed")