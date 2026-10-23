
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str
    app_database_url: str
    iam_database_url: str
    audit_database_url: str
    redis_url: str

    native_jwt_secret: str | None = None
    oidc_issuer: str | None = None
    oidc_audience: str | None = None
    oidc_jwks_url: str | None = None
    oidc_allowed_algorithms: str = "RS256"

    app_name: str = "ArchitectIQ Enterprise AI & Automation Studio"
    app_environment: str = "development"


@lru_cache
def get_settings() -> Settings:
    return Settings()
