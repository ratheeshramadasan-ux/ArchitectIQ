#!/usr/bin/env python3

"""Simple test script to check database connections."""

import os
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def test_connections():
    """Test database connections."""

    # Check what database URLs are available
    print("Environment variables:")
    for key in sorted(os.environ.keys()):
        if 'DATABASE' in key:
            print(f"  {key}: {os.environ[key]}")

    # Try to connect to each database
    db_urls = {
        'DATABASE_URL': os.environ.get('DATABASE_URL'),
        'APP_DATABASE_URL': os.environ.get('APP_DATABASE_URL'),
        'IAM_DATABASE_URL': os.environ.get('IAM_DATABASE_URL'),
        'AUDIT_DATABASE_URL': os.environ.get('AUDIT_DATABASE_URL')
    }

    for name, url in db_urls.items():
        if url:
            print(f"\nTesting {name}:")
            print(f"  URL: {url}")

            try:
                engine = create_engine(url, pool_pre_ping=True)
                with engine.connect() as conn:
                    result = conn.execute(text("SELECT current_database(), current_user"))
                    db_name, user_name = result.fetchone()
                    print(f"  Connected to database: {db_name}")
                    print(f"  Connected as user: {user_name}")
            except Exception as e:
                print(f"  ERROR: {e}")

if __name__ == "__main__":
    test_connections()