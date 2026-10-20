from unittest.mock import patch

from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from authentication import (
    VerifiedIdentity,
    get_verified_identity,
)

app = FastAPI()


@app.get("/test/protected")
def protected(
    identity: VerifiedIdentity = Depends(get_verified_identity),
):
    return {
        "issuer": identity.issuer,
        "subject": identity.subject,
    }


client = TestClient(app)


def test_missing_bearer_token():
    response = client.get("/test/protected")

    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


def test_invalid_bearer_token():
    with patch("authentication.verify_access_token") as verifier:
        from fastapi import HTTPException

        verifier.side_effect = HTTPException(
            status_code=401,
            detail="Invalid or expired access token",
        )

        response = client.get(
            "/test/protected",
            headers={"Authorization": "Bearer invalid-token"},
        )

        assert response.status_code == 401
        verifier.assert_called_once_with("invalid-token")


def test_valid_bearer_token():
    identity = VerifiedIdentity(
        issuer="https://identity.example.test",
        subject="test-user-001",
    )

    with patch(
        "authentication.verify_access_token",
        return_value=identity,
    ) as verifier:
        response = client.get(
            "/test/protected",
            headers={"Authorization": "Bearer valid-test-token"},
        )

        assert response.status_code == 200
        assert response.json() == {
            "issuer": identity.issuer,
            "subject": identity.subject,
        }

        verifier.assert_called_once_with("valid-test-token")
