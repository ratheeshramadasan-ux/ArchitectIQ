"""M3.1 HTTP request audit table and access policies."""

from alembic import op

revision = "m31_api_request_audit"
down_revision = "f9c6210d8e44"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE public.api_request_audit (
            id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            correlation_id uuid NOT NULL,
            tenant_id uuid NULL,
            actor_id uuid NULL,
            http_method varchar(12) NOT NULL,
            normalized_route text NOT NULL,
            status_code integer NOT NULL
                CHECK (status_code BETWEEN 100 AND 599),
            duration_ms integer NOT NULL
                CHECK (duration_ms >= 0),
            error_code varchar(100) NULL,
            happened_at timestamptz NOT NULL
                DEFAULT now()
        )
    """)

    op.execute("""
        CREATE INDEX ix_api_request_audit_tenant_time
        ON public.api_request_audit
        (tenant_id, happened_at DESC)
    """)

    op.execute("""
        CREATE INDEX ix_api_request_audit_correlation
        ON public.api_request_audit (correlation_id)
    """)

    op.execute("""
        ALTER TABLE public.api_request_audit
        ENABLE ROW LEVEL SECURITY
    """)

    op.execute("""
        ALTER TABLE public.api_request_audit
        FORCE ROW LEVEL SECURITY
    """)

    op.execute("""
        CREATE POLICY api_audit_tenant_read
        ON public.api_request_audit
        FOR SELECT
        TO architectiq_app
        USING (
            tenant_id =
            public.architectiq_current_tenant_id()
        )
    """)

    op.execute("""
        CREATE POLICY api_audit_writer_insert
        ON public.api_request_audit
        FOR INSERT
        TO architectiq_audit_writer
        WITH CHECK (true)
    """)

    op.execute("""
        GRANT SELECT
        ON public.api_request_audit
        TO architectiq_app
    """)

    op.execute("""
        GRANT INSERT (
            correlation_id,
            tenant_id,
            actor_id,
            http_method,
            normalized_route,
            status_code,
            duration_ms,
            error_code
        )
        ON public.api_request_audit
        TO architectiq_audit_writer
    """)

    op.execute("""
        GRANT USAGE
        ON SEQUENCE public.api_request_audit_id_seq
        TO architectiq_audit_writer
    """)


def downgrade() -> None:
    op.execute("""
        DROP TABLE public.api_request_audit
    """)