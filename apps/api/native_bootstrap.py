"""Trusted local provisioning CLI. Requires privileged DATABASE_URL; never expose via API.
Usage: uv run python native_bootstrap.py --email ... --name ... --tenant-id ...
Prompts for password without echo. Existing users are not silently overwritten.
"""
import argparse
import getpass
from uuid import UUID, uuid4
from sqlalchemy import text
from argon2 import PasswordHasher
from database import SessionLocal


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--email', required=True)
    parser.add_argument('--name', required=True)
    parser.add_argument('--tenant-id', required=True, type=UUID)
    args = parser.parse_args()
    email=args.email.strip().lower()
    if '@' not in email or len(email)>320: parser.error('Invalid email')
    pw=getpass.getpass('New password (minimum 12 characters): ')
    if len(pw)<12: parser.error('Password must contain at least 12 characters')
    confirm=getpass.getpass('Confirm password: ')
    if pw!=confirm: parser.error('Passwords do not match')
    with SessionLocal() as db, db.begin():
        exists=db.scalar(text('SELECT 1 FROM public.native_credentials WHERE email=:email'),{'email':email})
        if exists: parser.error('Email already provisioned')
        tenant=db.scalar(text('SELECT 1 FROM public.tenants WHERE id=:tid'),{'tid':args.tenant_id})
        if not tenant: parser.error('Tenant does not exist')
        uid=uuid4(); mid=uuid4()
        db.execute(text("INSERT INTO public.users(id,display_name,status,created_at) VALUES (:id,:name,'ACTIVE',CURRENT_TIMESTAMP)"),{'id':uid,'name':args.name})
        db.execute(text("INSERT INTO public.tenant_memberships(id,user_id,tenant_id,status,created_at) VALUES (:mid,:uid,:tid,'ACTIVE',CURRENT_TIMESTAMP)"),{'mid':mid,'uid':uid,'tid':args.tenant_id})
        db.execute(text('INSERT INTO public.native_credentials(user_id,email,password_hash) VALUES (:uid,:email,:hash)'),{'uid':uid,'email':email,'hash':PasswordHasher().hash(pw)})
    print('Native user provisioned:',uid)

if __name__=='__main__': main()
