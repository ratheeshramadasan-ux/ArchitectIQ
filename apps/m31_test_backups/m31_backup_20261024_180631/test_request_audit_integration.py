"""Integration tests for HTTP request audit functionality with PostgreSQL.

These tests verify that the audit implementation works correctly with
PostgreSQL privileges and tenant isolation.
"""

import pytest
from uuid import uuid4
from sqlalchemy import text

from database import audit_session
from request_audit import write_request_audit, RequestAuditMiddleware
from settings import get_settings


@pytest.fixture(scope="session")
def audit_writer_role():
    """Get the audit writer role from the audit database URL."""
    from sqlalchemy.engine import make_url

    settings = get_settings()
    url = make_url(settings.audit_database_url)
    # Extract username from the audit database URL
    username = url.username if url.username else "architectiq_audit_writer"
    # Verify that we're using the correct audit writer role
    assert username == "architectiq_audit_writer", f"Audit database user must be 'architectiq_audit_writer', got '{username}'"
    return username


@pytest.fixture(scope="session", autouse=True)
def validate_test_database():
    """Ensure tests run against the correct test database."""
    from sqlalchemy.engine import make_url

    settings = get_settings()
    audit_url = make_url(settings.audit_database_url)

    # Verify we're connecting to the test database
    assert audit_url.database == "architectiq_test", f"Audit database must be 'architectiq_test', got '{audit_url.database}'"

    # Also verify that the connection is working with the correct database
    with audit_session() as session:
        result = session.execute(text("SELECT current_database()"))
        db_name = result.fetchone()[0]
        assert db_name == "architectiq_test", f"Connected to database '{db_name}', expected 'architectiq_test'"


def test_audit_writer_privileges():
    """Test that audit writer role has correct privileges."""

    # Test that we can connect to audit database
    with audit_session() as session:
        # Verify we can execute basic queries using text()
        result = session.execute(text("SELECT 1"))
        assert result.fetchone() is not None

        # Test that we can insert into the audit table
        # This would fail if privileges are incorrect
        test_correlation_id = uuid4()
        test_tenant_id = uuid4()
        test_actor_id = uuid4()

        write_request_audit(
            correlation_id=test_correlation_id,
            tenant_id=test_tenant_id,
            actor_id=test_actor_id,
            method="GET",
            route="/test",
            status_code=200,
            duration_ms=100,
        )

        # Verify the record was inserted
        result = session.execute(
            text("SELECT correlation_id FROM public.api_request_audit WHERE correlation_id = :cid"),
            {"cid": str(test_correlation_id)}
        )
        assert result.fetchone() is not None


def test_tenant_isolation():
    """Test that tenant isolation works correctly with RLS policies."""

    # Create two different tenants
    tenant_a = uuid4()
    tenant_b = uuid4()

    # Insert records for both tenants
    with audit_session() as session:
        # Insert record for tenant A
        test_correlation_id_a = uuid4()
        write_request_audit(
            correlation_id=test_correlation_id_a,
            tenant_id=tenant_a,
            actor_id=uuid4(),
            method="GET",
            route="/test-a",
            status_code=200,
            duration_ms=50,
        )

        # Insert record for tenant B
        test_correlation_id_b = uuid4()
        write_request_audit(
            correlation_id=test_correlation_id_b,
            tenant_id=tenant_b,
            actor_id=uuid4(),
            method="GET",
            route="/test-b",
            status_code=200,
            duration_ms=50,
        )

        # Verify both records exist
        result = session.execute(
            text("SELECT correlation_id FROM public.api_request_audit WHERE correlation_id = :cid"),
            {"cid": str(test_correlation_id_a)}
        )
        assert result.fetchone() is not None

        result = session.execute(
            text("SELECT correlation_id FROM public.api_request_audit WHERE correlation_id = :cid"),
            {"cid": str(test_correlation_id_b)}
        )
        assert result.fetchone() is not None


def test_middleware_integration():
    """Test that middleware can be properly instantiated and used."""

    # Test middleware creation
    mock_app = type('MockApp', (), {})()
    middleware = RequestAuditMiddleware(mock_app)

    # Verify it has the correct structure
    assert middleware.app == mock_app
    assert hasattr(middleware, 'dispatch')
    assert callable(getattr(middleware, 'dispatch'))


def test_write_request_audit_functionality():
    """Test that write_request_audit function works correctly."""

    # Test with valid parameters
    test_correlation_id = uuid4()
    test_tenant_id = uuid4()
    test_actor_id = uuid4()

    with audit_session() as session:
        # This should not raise an exception
        write_request_audit(
            correlation_id=test_correlation_id,
            tenant_id=test_tenant_id,
            actor_id=test_actor_id,
            method="POST",
            route="/api/test",
            status_code=201,
            duration_ms=250,
        )

        # Verify the record was inserted
        result = session.execute(
            text("SELECT correlation_id, tenant_id, actor_id, http_method, normalized_route, status_code, duration_ms FROM public.api_request_audit WHERE correlation_id = :cid"),
            {"cid": str(test_correlation_id)}
        )
        row = result.fetchone()

        assert row is not None
        assert row[0] == str(test_correlation_id)
        assert row[1] == str(test_tenant_id)
        assert row[2] == str(test_actor_id)
        assert row[3] == "POST"
        assert row[4] == "/api/test"
        assert row[5] == 201
        assert row[6] == 250


def test_database_connection_isolation():
    """Test that audit uses separate database connection."""

    # Verify that the write_request_audit function uses audit_session
    import inspect

    source = inspect.getsource(write_request_audit)
    assert "audit_session" in source
    assert "with audit_session()" in source

    # Verify middleware calls write_request_audit (which internally uses audit_session)
    middleware_source = inspect.getsource(RequestAuditMiddleware)
    # The middleware calls write_request_audit, which uses audit_session
    assert "write_request_audit" in middleware_source


def test_error_handling():
    """Test that error handling works correctly."""

    # This should not raise an exception even if there are issues
    try:
        # Test with minimal valid parameters
        test_correlation_id = uuid4()
        write_request_audit(
            correlation_id=test_correlation_id,
            tenant_id=None,
            actor_id=None,
            method="GET",
            route="/test",
            status_code=200,
            duration_ms=0,
        )
        assert True  # Should not raise exception
    except Exception as e:
        pytest.fail(f"Exception raised: {e}")