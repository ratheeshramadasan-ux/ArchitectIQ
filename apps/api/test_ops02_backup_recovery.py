"""Automated Unit & Integration Test Suite for OPS-02 Backup & Disaster Recovery.

Validates:
- Strict security guardrails against missing credentials, architectiq_dev, and production databases.
- PostgreSQL backup artifact binary integrity validation (PGDMP magic header, minimum size, sha256).
- Schema-qualified catalog queries for table existence and RLS policy verification.
- Runtime Row-Level Security isolation using the restricted architectiq_app role.
- End-to-end isolated restore into dedicated disposable recovery environment with timing & clean teardown.
- Accurate reporting of unconfigured WAL archiving and PITR rather than fabricated success.
- Preservation of target and development databases.
"""
from __future__ import annotations

import os
import sys
import uuid
import pytest
import psycopg

# Add scripts directory to path for importing verification modules
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "scripts")))

from verify_backup_recovery import (
    EXPECTED_MIGRATION_HEAD,
    FORBIDDEN_DB_NAMES,
    REQUIRED_TABLES,
    RLS_TABLES,
    run_backup_and_recovery_verification,
    validate_connection_url,
    verify_backup_artifact,
)
from verify_database_health import (
    run_database_health_checks,
    validate_target_url,
)

TEST_DB_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://architectiq:Mad%407878@127.0.0.1:5433/architectiq_test",
).replace("postgresql+psycopg://", "postgresql://")


def test_guardrails_reject_empty_or_missing_url():
    """Security Guardrail: Empty or missing connection string must be rejected immediately."""
    with pytest.raises(SystemExit) as exc_info:
        validate_connection_url(None)
    assert exc_info.value.code == 1

    with pytest.raises(SystemExit) as exc_info:
        validate_connection_url("")
    assert exc_info.value.code == 1


def test_guardrails_reject_architectiq_dev_and_production():
    """Security Guardrail: Targeting architectiq_dev, prod, or postgres must be rejected."""
    # Test dev rejection
    with pytest.raises(SystemExit) as exc_info:
        validate_connection_url("postgresql://user:pass@127.0.0.1:5433/architectiq_dev")
    assert exc_info.value.code == 2

    # Test prod rejection
    with pytest.raises(SystemExit) as exc_info:
        validate_connection_url("postgresql://user:pass@127.0.0.1:5433/architectiq_prod")
    assert exc_info.value.code == 2

    with pytest.raises(SystemExit) as exc_info:
        validate_connection_url("postgresql://user:pass@127.0.0.1:5433/architectiq_production")
    assert exc_info.value.code == 2

    # Test production hostname rejection
    with pytest.raises(SystemExit) as exc_info:
        validate_connection_url("postgresql://user:pass@prod-db.internal:5432/architectiq_staging")
    assert exc_info.value.code == 2


def test_guardrails_accept_authorized_test_database():
    """Security Guardrail: An authorized non-dev/non-prod database must be accepted."""
    clean_url, host, port, user, pwd, db = validate_connection_url(
        "postgresql://architectiq:secret@127.0.0.1:5433/architectiq_test"
    )
    assert db == "architectiq_test"
    assert host == "127.0.0.1"
    assert port == 5433
    assert user == "architectiq"


def test_verify_backup_artifact_format():
    """Backup Artifact: Must reject corrupt/invalid payloads and accept valid PGDMP headers."""
    # Too small
    with pytest.raises(ValueError, match="below minimum valid archive threshold"):
        verify_backup_artifact(b"short")

    # Invalid header
    with pytest.raises(ValueError, match="lacks valid PostgreSQL custom format header"):
        verify_backup_artifact(b"CORRUPT_HEADER" + b"\x00" * 2000)

    # Valid PGDMP header
    valid_payload = b"PGDMP\x01\x0f" + b"\x00" * 2000
    meta = verify_backup_artifact(valid_payload)
    assert meta["header_valid"] is True
    assert meta["size_bytes"] == len(valid_payload)
    assert len(meta["sha256"]) == 64


def test_schema_qualified_database_health():
    """Database Health: Verifies 32 tables and 28 RLS tables using schema-qualified catalog queries."""
    results = run_database_health_checks(TEST_DB_URL)
    assert results["DATABASE_CONNECTIVITY"] == "PASS"
    assert results["PROTECTED_TARGET_GUARD"] == "PASS"
    assert results["SCHEMA_TABLE_INVENTORY"] == "PASS"
    assert results["SCHEMA_QUALIFIED_RLS_CATALOG"] == "PASS"
    assert results["RESTRICTED_ROLE_RLS_ENFORCEMENT"] == "PASS"
    assert results["WAL_ARCHIVING_CONFIGURATION"] in ("CONFIGURED", "NOT CONFIGURED")


def test_isolated_restore_verification_lifecycle():
    """Disaster Recovery: Executes full dump, creates disposable DB, restores, verifies, and tears down cleanly."""
    os.environ["ALLOW_DISPOSABLE_RECOVERY_DB"] = "true"
    os.environ["TARGET_DATABASE_URL"] = TEST_DB_URL

    evidence = run_backup_and_recovery_verification(TEST_DB_URL)

    # Core verifications
    assert evidence["TARGET_CONNECTION_SECURITY"] == "PASS"
    assert evidence["PROTECTED_TARGET_GUARD"] == "PASS"
    assert evidence["BACKUP_ARTIFACT_INTEGRITY"] == "PASS"
    assert evidence["ISOLATED_RESTORE_EXECUTION"] == "PASS"
    assert evidence["RESTORED_SCHEMA_VERIFICATION"] == "PASS"
    assert evidence["RESTORED_MIGRATION_HEAD"] == "PASS"
    assert evidence["RESTORED_RLS_CATALOG"] == "PASS"
    assert evidence["RESTORED_APP_ROLE_ISOLATION"] == "PASS"

    # Timing / RTO verification
    assert evidence["restore_duration_seconds"] <= 300

    # Honest WAL and PITR reporting (not fabricated)
    if evidence["wal_settings"].get("archive_mode") == "off":
        assert evidence["WAL_ARCHIVE_VERIFICATION"] == "NOT CONFIGURED"
        assert "NOT VERIFIED" in evidence["POINT_IN_TIME_RECOVERY"]
        assert evidence["OVERALL_DISASTER_RECOVERY_VERDICT"] == "RESTORE_VERIFIED_STANDBY_PITR_NOT_CONFIGURED"
    else:
        assert evidence["WAL_ARCHIVE_VERIFICATION"] == "PASS"
        assert evidence["OVERALL_DISASTER_RECOVERY_VERDICT"] == "PASS"
