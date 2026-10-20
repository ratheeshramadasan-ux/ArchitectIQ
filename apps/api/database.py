
from collections.abc import Iterator
from contextlib import contextmanager
from uuid import UUID

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from settings import get_settings

settings = get_settings()

engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
)

runtime_engine = create_engine(
    settings.app_database_url,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
)

iam_engine = create_engine(
    settings.iam_database_url,
    pool_pre_ping=True,
    pool_size=3,
    max_overflow=5,
)

IAMSessionLocal = sessionmaker(
    bind=iam_engine,
    autoflush=False,
    expire_on_commit=False,
)

SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    expire_on_commit=False,
)

RuntimeSessionLocal = sessionmaker(
    bind=runtime_engine,
    autoflush=False,
    expire_on_commit=False,
)


def get_admin_db() -> Iterator[Session]:
    """Provide a privileged database session for trusted internal operations only.

    Never use this dependency in tenant-facing API endpoints.
    This connection can bypass PostgreSQL Row-Level Security.
    """
    with SessionLocal() as session:
        yield session

@contextmanager
def tenant_session(tenant_id: UUID) -> Iterator[Session]:
    """Create a transaction with tenant-local PostgreSQL context.

    The tenant ID must already have been verified by the
    authentication and authorization layer.
    """
    if not isinstance(tenant_id, UUID):
        raise TypeError("tenant_id must be a UUID")

    with RuntimeSessionLocal() as session, session.begin():
        session.execute(
            text(
                """
                    SELECT set_config(
                        'architectiq.tenant_id',
                        :tenant_id,
                        true
                    )
                    """
            ),
            {"tenant_id": str(tenant_id)},
        )
        yield session
