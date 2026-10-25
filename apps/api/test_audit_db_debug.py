#!/usr/bin/env python3

"""Debug script to understand audit database connection issues."""

import os
import sys
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Check what database URLs are available
print("Environment variables:")
for key in sorted(os.environ.keys()):
    if 'DATABASE' in key:
        print(f"  {key}: {os.environ[key]}")

# Try to connect to audit database directly
try:
    audit_url = os.environ.get('AUDIT_DATABASE_URL')
    print(f"\nAudit database URL: {audit_url}")

    if audit_url:
        engine = create_engine(audit_url, pool_pre_ping=True)
        with engine.connect() as conn:
            result = conn.execute(text("SELECT current_database(), current_user"))
            db_name, user_name = result.fetchone()
            print(f"Connected to database: {db_name}")
            print(f"Connected as user: {user_name}")

            # Try to check if the audit table exists
            try:
                result = conn.execute(text("""
                    SELECT EXISTS (
                        SELECT FROM information_schema.tables
                        WHERE table_schema = 'public'
                        AND table_name = 'api_request_audit'
                    );
                """))
                table_exists = result.fetchone()[0]
                print(f"audit table exists: {table_exists}")
            except Exception as e:
                print(f"Error checking audit table: {e}")

        engine.dispose()
    else:
        print("No AUDIT_DATABASE_URL found in environment")

except Exception as e:
    print(f"Error connecting to audit database: {e}")

# Try to understand what the test is expecting
print("\nTesting what test expects...")
try:
    from settings import get_settings
    settings = get_settings()
    print(f"Settings loaded successfully")
    print(f"AUDIT_DATABASE_URL from settings: {settings.audit_database_url}")

    # Try to parse URL
    from sqlalchemy.engine import make_url
    url_obj = make_url(settings.audit_database_url)
    print(f"Parsed URL - database: {url_obj.database}")
    print(f"Parsed URL - username: {url_obj.username}")
    print(f"Parsed URL - host: {url_obj.host}")
    print(f"Parsed URL - port: {url_obj.port}")

except Exception as e:
    print(f"Error with settings/test: {e}")