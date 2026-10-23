"""ArchitectIQ native sign-in, with DB-backed revocable short-lived tokens.

No public sign-up. Password provisioning is performed by a trusted local CLI.
"""
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4
import hmac
import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, VerificationError
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import text
from database import IAMSessionLocal
from settings import get_settings

router = APIRouter(prefix='/api/v1/auth/native', tags=['Native IAM'])
ph = PasswordHasher(time_cost=3, memory_cost=65536, parallelism=2)
bearer = HTTPBearer(auto_error=False)
DUMMY_HASH = ph.hash('architectiq-dummy-password-not-a-real-account')

class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=1024)

class LoginResponse(BaseModel):
    access_token: str
    token_type: str = 'bearer'
    expires_in: int = 900

def _secret():
    value = get_settings().native_jwt_secret
    if not value or len(value.encode()) < 32:
        raise HTTPException(503, 'Native authentication not configured')
    return value

def _iam_scalar(sql, params):
    with IAMSessionLocal() as session, session.begin():
        session.execute(text('SET LOCAL ROLE architectiq_iam'))
        return session.scalar(text(sql), params)

def validate_native_token(token: str):
    try:
        claims = jwt.decode(token, _secret(), algorithms=['HS256'], audience='architectiq-api', issuer='architectiq-native', options={'require':['sub','jti','iat','exp','iss','aud']}, leeway=0)
        user = UUID(claims['sub']); session_id = UUID(claims['jti'])
        valid = _iam_scalar('SELECT public.architectiq_native_validate_session(CAST(:sid AS uuid),CAST(:uid AS uuid))', {'sid':str(session_id),'uid':str(user)})
        if valid is not True:
            raise ValueError('Session invalid')
        return user, session_id
    except (jwt.PyJWTError, ValueError, KeyError, TypeError) as exc:
        raise HTTPException(401, 'Invalid or expired access token', headers={'WWW-Authenticate':'Bearer'}) from exc

@router.post('/login', response_model=LoginResponse)
def login(body: LoginRequest):
    secret = _secret()
    with IAMSessionLocal() as session, session.begin():
        session.execute(text('SET LOCAL ROLE architectiq_iam'))
        record = session.execute(text('SELECT user_id,password_hash FROM public.architectiq_native_lookup(:email)'), {'email':body.email.lower()}).first()
    stored = record.password_hash if record else DUMMY_HASH
    try:
        matches = ph.verify(stored, body.password)
    except (VerifyMismatchError, VerificationError):
        matches = False
    if not matches or not record:
        raise HTTPException(401, 'Invalid credentials')
    now = datetime.now(timezone.utc)
    sid = uuid4(); uid = record.user_id
    created = _iam_scalar('SELECT public.architectiq_native_open_session(CAST(:sid AS uuid),CAST(:uid AS uuid),:expiry)', {'sid':str(sid),'uid':str(uid),'expiry':now+timedelta(minutes=15)})
    if created is not True:
        raise HTTPException(401, 'Invalid credentials')
    payload = {'iss':'architectiq-native','aud':'architectiq-api','sub':str(uid),'jti':str(sid),'iat':now,'exp':now+timedelta(minutes=15)}
    return LoginResponse(access_token=jwt.encode(payload,secret,algorithm='HS256'))

@router.post('/logout', status_code=204)
def logout(credentials: HTTPAuthorizationCredentials | None = Depends(bearer)):
    if credentials is None:
        raise HTTPException(401, 'Bearer access token required')
    uid,sid = validate_native_token(credentials.credentials)
    _iam_scalar('SELECT public.architectiq_native_revoke_session(CAST(:sid AS uuid),CAST(:uid AS uuid))', {'sid':str(sid),'uid':str(uid)})
