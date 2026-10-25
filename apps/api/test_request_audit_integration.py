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



def _audit_rows(tenant_id, correlation_ids):
    from database import tenant_session
    with tenant_session(tenant_id) as session:
        return session.execute(text("""
            SELECT correlation_id, tenant_id, actor_id, http_method,
                   normalized_route, status_code, duration_ms
            FROM public.api_request_audit
            WHERE correlation_id = ANY(:ids)
        """), {"ids": list(correlation_ids)}).all()


def test_audit_writer_privileges():
    from sqlalchemy.exc import DBAPIError
    with audit_session() as session:
        assert session.scalar(text("SELECT current_user")) == "architectiq_audit_writer"
        # A write-only role must not be able to read audit rows.
        with pytest.raises(DBAPIError):
            session.execute(text("SELECT correlation_id FROM public.api_request_audit LIMIT 1")).all()
    tid, cid = uuid4(), uuid4()
    write_request_audit(correlation_id=cid, tenant_id=tid, actor_id=uuid4(),
                        method="GET", route="/test", status_code=200, duration_ms=100)
    assert {r.correlation_id for r in _audit_rows(tid, [cid])} == {cid}


def test_tenant_isolation():
    a, b = uuid4(), uuid4()
    ca, cb = uuid4(), uuid4()
    for tid, cid, route in ((a, ca, "/test-a"), (b, cb, "/test-b")):
        write_request_audit(correlation_id=cid, tenant_id=tid, actor_id=uuid4(),
                            method="GET", route=route, status_code=200, duration_ms=50)
    assert {r.correlation_id for r in _audit_rows(a, [ca, cb])} == {ca}
    assert {r.correlation_id for r in _audit_rows(b, [ca, cb])} == {cb}
    from database import RuntimeSessionLocal
    with RuntimeSessionLocal() as session:
        assert session.scalar(text(
            "SELECT count(*) FROM public.api_request_audit WHERE correlation_id = ANY(:ids)"
        ), {"ids": [ca, cb]}) == 0


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
    cid, tid, actor = uuid4(), uuid4(), uuid4()
    write_request_audit(correlation_id=cid, tenant_id=tid, actor_id=actor,
                        method="POST", route="/api/test", status_code=201,
                        duration_ms=250)
    rows = _audit_rows(tid, [cid])
    assert len(rows) == 1
    row = rows[0]
    assert row.correlation_id == cid
    assert row.tenant_id == tid
    assert row.actor_id == actor
    assert row.http_method == "POST"
    assert row.normalized_route == "/api/test"
    assert row.status_code == 201
    assert row.duration_ms == 250


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