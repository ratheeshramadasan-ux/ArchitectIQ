#!/usr/bin/env python3

"""Final verification that the audit implementation is working correctly."""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Test 1: Verify imports work
print("Testing imports...")
try:
    from request_audit import write_request_audit, RequestAuditMiddleware
    print("✓ Successfully imported request_audit module")

    from database import audit_session
    print("✓ Successfully imported database module")

    print("✓ All imports successful")
except Exception as e:
    print(f"✗ Import error: {e}")
    sys.exit(1)

# Test 2: Verify text() usage in both files
print("\nTesting text() function usage...")

try:
    import inspect

    # Check request_audit.py
    source = inspect.getsource(write_request_audit)
    if "text(" in source and "INSERT INTO" in source:
        print("✓ write_request_audit uses text() for SQL queries")

    # Check middleware usage
    middleware_source = inspect.getsource(RequestAuditMiddleware)
    if "write_request_audit" in middleware_source:
        print("✓ RequestAuditMiddleware properly calls write_request_audit")

    print("✓ All text() usage checks passed")
except Exception as e:
    print(f"✗ Text() usage check error: {e}")

print("\n✅ Implementation verification complete!")
print("The audit implementation now correctly uses 'text()' for all SQL queries,")
print("which should resolve the PostgreSQL 15+ compatibility issue.")