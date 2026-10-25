"""Isolated pytest database configuration for ArchitectIQ."""

import os
import sys
import pytest
from dotenv import dotenv_values
from sqlalchemy.engine import make_url

TARGET_DB = "architectiq_test"

ROLES = {
    "DATABASE_URL": "architectiq",
    "APP_DATABASE_URL": "architectiq_app",
    "IAM_DATABASE_URL": "architectiq_iam_login",
    "AUDIT_DATABASE_URL": "architectiq_audit_writer",
}


def pytest_configure(config):
    # Engines are created at database.py import time.
    # Refuse to proceed if configuration is already too late.
    if "database" in sys.modules or "apps.api.database" in sys.modules:
        raise pytest.UsageError(
            "database.py was imported before test isolation was configured"
        )

    from pathlib import Path

    env_file = Path(__file__).resolve().parent / ".env"
    file_values = dotenv_values(env_file) if env_file.exists() else {}

    prepared = {}

    for key, expected_role in ROLES.items():
        raw = os.environ.get(key) or file_values.get(key)

        if not raw:
            raise pytest.UsageError(
                f"Missing {key}; test configuration cannot continue"
            )

        url = make_url(raw)

        if url.username != expected_role:
            raise pytest.UsageError(
                f"{key}: unexpected PostgreSQL role"
            )

        if url.database != "architectiq_dev" and url.database != TARGET_DB:
            raise pytest.UsageError(
                f"{key}: unexpected source database"
            )

        if url.host not in ("127.0.0.1", "localhost"):
            raise pytest.UsageError(
                f"{key}: unexpected database host"
            )

        prepared[key] = url.set(database=TARGET_DB).render_as_string(
            hide_password=False
        )

    # Apply only after every URL has passed validation.
    os.environ.update(prepared)

    from settings import get_settings
    get_settings.cache_clear()
    settings = get_settings()

    for key, expected_role in ROLES.items():
        effective = make_url(getattr(settings, key.lower()))
        if effective.database != TARGET_DB or effective.username != expected_role:
            raise pytest.UsageError(
                f"{key}: effective configuration failed isolation validation"
            )

    print("ArchitectIQ test database configuration verified.")


@pytest.fixture(scope="session")
def audit_writer_role():
    from settings import get_settings

    role = make_url(get_settings().audit_database_url).username
    if role != "architectiq_audit_writer":
        raise RuntimeError("Incorrect audit writer role")
    return role
