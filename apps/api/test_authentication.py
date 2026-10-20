from datetime import datetime, timedelta, timezone
from unittest.mock import patch
from authentication import validate_jwks_url

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import HTTPException

from authentication import verify_access_token
from settings import Settings


PRIVATE_KEY = rsa.generate_private_key(
    public_exponent=65537,
    key_size=2048,
)

PUBLIC_KEY = PRIVATE_KEY.public_key()

ISSUER = "https://identity.example.test"
AUDIENCE = "architectiq-api"


def make_token(**overrides):
    now = datetime.now(timezone.utc)

    claims = {
        "iss": ISSUER,
        "aud": AUDIENCE,
        "sub": "test-user-001",
        "iat": now,
        "exp": now + timedelta(minutes=10),
    }

    claims.update(overrides)

    return jwt.encode(
        claims,
        PRIVATE_KEY,
        algorithm="RS256",
        headers={"kid": "test-key-001"},
    )


@pytest.fixture(autouse=True)
def mock_oidc():
    from settings import get_settings

    config = Settings(
        oidc_issuer=ISSUER,
        oidc_audience=AUDIENCE,
        oidc_jwks_url=f"{ISSUER}/jwks",
    )

    class SigningKey:
        key = PUBLIC_KEY

    get_settings.cache_clear()

    with (
        patch("authentication.get_settings", return_value=config),
        patch("authentication.PyJWKClient") as client,
    ):
        client.return_value.get_signing_key_from_jwt.return_value = SigningKey()
        yield

    get_settings.cache_clear()


def assert_rejected(token):
    with pytest.raises(HTTPException) as error:
        verify_access_token(token)

    assert error.value.status_code == 401


def test_valid_token():
    identity = verify_access_token(make_token())

    assert identity.issuer == ISSUER
    assert identity.subject == "test-user-001"


def test_tampered_signature():
    token = make_token()
    parts = token.split(".")

    replacement = "A" if parts[2][0] != "A" else "B"
    parts[2] = replacement + parts[2][1:]

    assert_rejected(".".join(parts))


def test_expired_token():
    token = make_token(
        exp=datetime.now(timezone.utc) - timedelta(minutes=5)
    )

    assert_rejected(token)


def test_wrong_issuer():
    assert_rejected(
        make_token(iss="https://untrusted.example.test")
    )


def test_wrong_audience():
    assert_rejected(
        make_token(aud="another-api")
    )


def test_missing_subject():
    now = datetime.now(timezone.utc)

    token = jwt.encode(
        {
            "iss": ISSUER,
            "aud": AUDIENCE,
            "iat": now,
            "exp": now + timedelta(minutes=10),
        },
        PRIVATE_KEY,
        algorithm="RS256",
    )

    assert_rejected(token)

@pytest.mark.parametrize(
    "url",
    [
        "http://identity.example.test/jwks",
        "http://127.0.0.1:8080/keys",
        "https://user:password@identity.example.test/jwks",
        "https://identity.example.test:8443/jwks",
        "https://identity.example.test/jwks#fragment",
        "not-a-valid-url",
        "",
    ],
)
def test_unsafe_jwks_url_rejected(url):
    with pytest.raises(ValueError):
        validate_jwks_url(url)


def test_valid_https_jwks_url():
    url = "https://identity.example.test/.well-known/jwks.json"

    assert validate_jwks_url(url) == url

from authentication import validate_oidc_trust_binding


def test_matching_issuer_and_jwks_host():
    issuer = "https://identity.example.test"
    jwks = "https://identity.example.test/.well-known/jwks.json"

    assert validate_oidc_trust_binding(issuer, jwks) == jwks


@pytest.mark.parametrize(
    "jwks_url",
    [
        "https://untrusted.example.test/jwks",
        "https://localhost/jwks",
        "https://127.0.0.1/jwks",
        "https://10.0.0.5/jwks",
        "https://identity.example.test.evil.test/jwks",
        "http://identity.example.test/jwks",
    ],
)
def test_mismatched_jwks_host_rejected(jwks_url):
    with pytest.raises(ValueError):
        validate_oidc_trust_binding(
            "https://identity.example.test",
            jwks_url,
        )


def test_invalid_issuer_rejected():
    with pytest.raises(ValueError):
        validate_oidc_trust_binding(
            "http://identity.example.test",
            "https://identity.example.test/jwks",
        )



def test_jwks_trust_binding_enforced_before_client_creation():
    from unittest.mock import patch

    from authentication import verify_access_token
    from settings import Settings

    config = Settings(
        oidc_issuer="https://identity.example.test",
        oidc_audience="architectiq-api",
        oidc_jwks_url="https://untrusted.example.test/jwks",
    )

    with (
        patch("authentication.get_settings", return_value=config),
        patch("authentication.PyJWKClient") as jwks_client,
    ):
        with pytest.raises(HTTPException) as error:
            verify_access_token("invalid.test.token")

        assert error.value.status_code == 401
        jwks_client.assert_not_called()

def test_future_issued_at_rejected():
    future = datetime.now(timezone.utc) + timedelta(minutes=5)

    token = make_token(iat=future)

    assert_rejected(token)

def test_future_not_before_rejected():
    future = datetime.now(timezone.utc) + timedelta(minutes=5)

    token = make_token(nbf=future)

    assert_rejected(token)

def test_missing_expiration_rejected():
    now = datetime.now(timezone.utc)

    token = jwt.encode(
        {
            "iss": ISSUER,
            "aud": AUDIENCE,
            "sub": "test-user-001",
            "iat": now,
        },
        PRIVATE_KEY,
        algorithm="RS256",
    )

    assert_rejected(token)
