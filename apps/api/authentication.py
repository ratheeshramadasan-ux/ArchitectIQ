from dataclasses import dataclass
from urllib.parse import urlsplit
from typing import Annotated


import jwt
from fastapi import Depends
from fastapi import HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient

from collections.abc import Iterator
from sqlalchemy import text
from sqlalchemy.orm import Session
from iam import TenantAccessDenied, authorized_tenant_session

from uuid import UUID
from iam import resolve_external_identity

from settings import get_settings


bearer_scheme = HTTPBearer(auto_error=False)

@dataclass(frozen=True)
class VerifiedIdentity:
    issuer: str
    subject: str

def validate_jwks_url(url: str) -> str:
    """Validate the configured JWKS endpoint URL."""

    try:
        parsed = urlsplit(url)
        port = parsed.port
    except ValueError as exc:
        raise ValueError("Invalid JWKS URL") from exc

    if (
        parsed.scheme != "https"
        or not parsed.hostname
        or parsed.username is not None
        or parsed.password is not None
        or parsed.fragment
        or port not in (None, 443)
    ):
        raise ValueError("Invalid JWKS URL")

    return url


def validate_oidc_trust_binding(
    issuer: str,
    jwks_url: str,
) -> str:
    """Require the JWKS endpoint to use the configured issuer host."""

    validated_url = validate_jwks_url(jwks_url)

    issuer_parts = urlsplit(issuer)
    jwks_parts = urlsplit(validated_url)

    if (
        issuer_parts.scheme != "https"
        or not issuer_parts.hostname
        or issuer_parts.username is not None
        or issuer_parts.password is not None
        or issuer_parts.port not in (None, 443)
        or issuer_parts.fragment
        or issuer_parts.hostname != jwks_parts.hostname
    ):
        raise ValueError(
            "JWKS endpoint is not bound to the configured issuer"
        )

    return validated_url

def verify_access_token(token: str) -> VerifiedIdentity:
    """Validate a JWT access token from the configured OIDC issuer."""

    settings = get_settings()

    if not all((
        settings.oidc_issuer,
        settings.oidc_audience,
        settings.oidc_jwks_url,
    )):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication provider is not configured",
        )

    # Only the explicitly supported signing algorithm is accepted.
    if settings.oidc_allowed_algorithms != "RS256":
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unsupported authentication configuration",
        )

    try:
        jwks_client = PyJWKClient(
            validate_oidc_trust_binding(
                settings.oidc_issuer,
                settings.oidc_jwks_url,
            ),
            timeout=5,
        )

        signing_key = jwks_client.get_signing_key_from_jwt(token)

        claims = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            audience=settings.oidc_audience,
            issuer=settings.oidc_issuer,
            options={
                "require": ["exp", "iat", "iss", "aud", "sub"],
                "verify_exp": True,
                "verify_iat": True,
                "verify_nbf": True,
            },
            leeway=30,
        )

        subject = claims["sub"]

        if not isinstance(subject, str) or not subject.strip():
            raise jwt.InvalidTokenError("Invalid subject")

        return VerifiedIdentity(
            issuer=claims["iss"],
            subject=subject,
        )

    except (
        jwt.PyJWTError,
        ValueError,
        TimeoutError,
        OSError,
    ) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired access token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc



def get_verified_identity(
    credentials: Annotated[
        HTTPAuthorizationCredentials | None,
        Depends(bearer_scheme),
    ],
) -> VerifiedIdentity:
    """Require and verify a Bearer access token."""

    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Bearer access token required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Native HS256 tokens are verified separately; external OIDC remains RS256-only.
    from native_auth import validate_native_token
    import jwt as _jwt
    try:
        _header = _jwt.get_unverified_header(credentials.credentials)
    except _jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid access token")
    if _header.get("alg") == "HS256":
        user_id, _ = validate_native_token(credentials.credentials)
        return VerifiedIdentity(issuer="architectiq-native", subject=str(user_id))
    return verify_access_token(credentials.credentials)

def get_authenticated_user_id(
    identity: Annotated[
        VerifiedIdentity,
        Depends(get_verified_identity),
    ],
) -> UUID:
    """Resolve a verified OIDC identity to an active internal user."""

    if identity.issuer == "architectiq-native":
        return UUID(identity.subject)

    user_id = resolve_external_identity(
        issuer=identity.issuer,
        subject=identity.subject,
    )

    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authenticated identity is not registered or active",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user_id

def get_authorized_tenant_db(
    tenant_id: UUID,
    user_id: Annotated[
        UUID,
        Depends(get_authenticated_user_id),
    ],
) -> Iterator[Session]:
    """Provide a tenant-scoped session after authentication and authorization."""

    try:
        with authorized_tenant_session(
            user_id=user_id,
            tenant_id=tenant_id,
        ) as session:
            # Transaction-local identity for immutable audit attribution.
            session.execute(text("SELECT set_config('architectiq.actor_id', :actor, true)"), {"actor": str(user_id)})
            yield session

    except TenantAccessDenied as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access to this tenant is denied",
        ) from exc