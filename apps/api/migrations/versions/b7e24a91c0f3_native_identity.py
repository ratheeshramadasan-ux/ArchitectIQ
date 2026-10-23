"""Native credential and revocable session storage.

Revision ID: b7e24a91c0f3
Revises: a3c1d90e7b22
"""
from alembic import op
revision = "b7e24a91c0f3"
down_revision = "a3c1d90e7b22"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""CREATE TABLE public.native_credentials (
        user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
        email text NOT NULL UNIQUE,
        password_hash text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
    )""")
    op.execute("""CREATE TABLE public.native_sessions (
        id uuid PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
        expires_at timestamptz NOT NULL,
        revoked_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
    )""")
    op.execute("CREATE INDEX ix_native_sessions_user ON public.native_sessions(user_id)")
    op.execute("ALTER TABLE public.native_credentials OWNER TO architectiq_iam_owner")
    op.execute("ALTER TABLE public.native_sessions OWNER TO architectiq_iam_owner")
    op.execute("REVOKE ALL ON public.native_credentials, public.native_sessions FROM PUBLIC")
    # The IAM connection only invokes narrowly scoped SECURITY DEFINER functions.
    functions = [
      ("architectiq_native_lookup", "p_email text", "TABLE(user_id uuid, password_hash text)", """
          SELECT c.user_id, c.password_hash FROM public.native_credentials c
          JOIN public.users u ON u.id=c.user_id
          WHERE c.email=lower(trim(p_email)) AND u.status='ACTIVE'"""),
      ("architectiq_native_open_session", "p_id uuid, p_user uuid, p_exp timestamptz", "boolean", """
          WITH inserted AS (
            INSERT INTO public.native_sessions(id,user_id,expires_at)
            SELECT p_id,u.id,p_exp FROM public.users u
            WHERE u.id=p_user AND u.status='ACTIVE' AND p_exp>now()
            RETURNING id
          ) SELECT EXISTS(SELECT 1 FROM inserted)"""),
      ("architectiq_native_validate_session", "p_id uuid, p_user uuid", "boolean", """
          SELECT EXISTS(SELECT 1 FROM public.native_sessions s
            JOIN public.users u ON u.id=s.user_id
            WHERE s.id=p_id AND s.user_id=p_user AND u.status='ACTIVE'
              AND s.revoked_at IS NULL AND s.expires_at>now())"""),
      ("architectiq_native_revoke_session", "p_id uuid, p_user uuid", "boolean", """
          WITH changed AS (UPDATE public.native_sessions SET revoked_at=now()
          WHERE id=p_id AND user_id=p_user AND revoked_at IS NULL RETURNING id)
          SELECT EXISTS(SELECT 1 FROM changed)"""),
    ]
    for name,args,returns,query in functions:
        op.execute(f"CREATE FUNCTION public.{name}({args}) RETURNS {returns} LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$ {query} $fn$")
        sig=", ".join(a.split()[1] for a in args.split(", "))
        op.execute(f"ALTER FUNCTION public.{name}({sig}) OWNER TO architectiq_iam_owner")
        op.execute(f"REVOKE ALL ON FUNCTION public.{name}({sig}) FROM PUBLIC")
        op.execute(f"GRANT EXECUTE ON FUNCTION public.{name}({sig}) TO architectiq_iam")


def downgrade():
    for name,sig in [
        ('architectiq_native_revoke_session','uuid, uuid'),
        ('architectiq_native_validate_session','uuid, uuid'),
        ('architectiq_native_open_session','uuid, uuid, timestamptz'),
        ('architectiq_native_lookup','text'),
    ]:
        op.execute(f'DROP FUNCTION public.{name}({sig})')
    op.execute('DROP TABLE public.native_sessions')
    op.execute('DROP TABLE public.native_credentials')
