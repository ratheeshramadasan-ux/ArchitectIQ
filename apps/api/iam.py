from collections.abc import Iterator
from contextlib import contextmanager
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.orm import Session

from database import IAMSessionLocal, tenant_session


class TenantAccessDenied(Exception):
    """The user is not authorized to access the requested tenant."""


def verify_tenant_membership(
    session: Session,
    user_id: UUID,
    tenant_id: UUID,
) -> None:
    """Verify active membership using the restricted IAM database role."""

    if not isinstance(user_id, UUID) or not isinstance(tenant_id, UUID):
        raise TypeError("user_id and tenant_id must be UUID values")

    statement = text("""
        SELECT public.architectiq_verify_tenant_membership(
            CAST(:user_id AS uuid),
            CAST(:tenant_id AS uuid)
        )
    """)

    # Caller must provide a dedicated IAM session.
    # Activate the restricted role for this transaction only.
    session.execute(text("SET LOCAL ROLE architectiq_iam"))

    allowed = session.scalar(
        statement,
        {
            "user_id": str(user_id),
            "tenant_id": str(tenant_id),
        },
    )

    if allowed is not True:
        raise TenantAccessDenied(
            "User does not have an active membership in this tenant"
        )


@contextmanager
def authorized_tenant_session(
    user_id: UUID,
    tenant_id: UUID,
) -> Iterator[Session]:
    """
    Create a tenant-scoped runtime session after IAM authorization.

    Internal trusted utility only.
    user_id must originate from verified authentication identity.
    """

    if not isinstance(user_id, UUID) or not isinstance(tenant_id, UUID):
        raise TypeError("user_id and tenant_id must be UUID values")

    # Authorization is performed using restricted IAM credentials.
    with IAMSessionLocal() as iam_session:
        with iam_session.begin():
            verify_tenant_membership(
                iam_session,
                user_id,
                tenant_id,
            )

    # Business data access uses the separate RLS-restricted runtime.
    with tenant_session(tenant_id) as runtime_session:
        yield runtime_session

def resolve_external_identity(
    issuer: str,
    subject: str,
) -> UUID | None:
    """Resolve a verified external identity through restricted IAM access.

    The caller must supply issuer and subject from a verified token,
    never from untrusted request parameters.
    """

    if not isinstance(issuer, str) or not issuer:
        raise ValueError("issuer must be a non-empty string")

    if not isinstance(subject, str) or not subject:
        raise ValueError("subject must be a non-empty string")

    with IAMSessionLocal() as session:
        with session.begin():
            session.execute(text("SET LOCAL ROLE architectiq_iam"))

            user_id = session.scalar(
                text("""
                    SELECT public.architectiq_resolve_external_identity(
                        :issuer,
                        :subject
                    )
                """),
                {
                    "issuer": issuer,
                    "subject": subject,
                },
            )

            if user_id is None:
                return None

            if not isinstance(user_id, UUID):
                raise TypeError(
                    "Identity resolver returned an invalid user UUID"
                )

            return user_id