#!/usr/bin/env python3

"""Simple test to verify imports work correctly."""

import sys
import os

# Add the current directory to Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

try:
    from request_audit import write_request_audit, RequestAuditMiddleware
    print("✓ Successfully imported request_audit module")

    # Test that we can at least access the functions
    print(f"✓ write_request_audit function: {write_request_audit}")
    print(f"✓ RequestAuditMiddleware class: {RequestAuditMiddleware}")

    # Check if database connection works
    from database import audit_session
    print("✓ Successfully imported database module")

    # Test that we can connect to the database
    with audit_session() as session:
        result = session.execute("SELECT 1")
        print("✓ Database connection test passed")

except Exception as e:
    print(f"✗ Error: {e}")
    import traceback
    traceback.print_exc()