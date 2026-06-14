from fastapi import Header, HTTPException
from fastapi.concurrency import run_in_threadpool
import jwt
from jwt import PyJWKClient
from app.config import settings
from app.db.supabase import get_supabase
import logging

logger = logging.getLogger(__name__)

# JWKS client for asymmetric (ES256/RS256) Supabase tokens. PyJWKClient caches
# fetched signing keys internally, so a single module-level instance is reused.
_jwks_client: PyJWKClient | None = None


def _get_jwks_client() -> PyJWKClient:
    global _jwks_client
    if _jwks_client is None:
        _jwks_client = PyJWKClient(f"{settings.SUPABASE_URL}/auth/v1/.well-known/jwks.json")
    return _jwks_client


async def _assert_active(user_id: str) -> None:
    """Reject deactivated accounts. Uses 401 so the client signs out cleanly.
    The synchronous supabase call is run off the event loop."""
    def _check():
        sb = get_supabase()
        return (
            sb.table("profiles").select("is_active").eq("id", user_id).single().execute()
        ).data

    try:
        data = await run_in_threadpool(_check)
    except Exception:
        # Profile not found / transient lookup failure: don't hard-block here;
        # downstream handlers enforce their own access checks.
        return
    if data is not None and data.get("is_active") is False:
        raise HTTPException(status_code=401, detail="Account deactivated")


async def get_current_user(authorization: str = Header(...)) -> str:
    """Validate a Supabase JWT (HS256 or ES256/RS256) and return the user UUID."""
    try:
        token = authorization.removeprefix("Bearer ").strip()
        header = jwt.get_unverified_header(token)
        alg = header.get("alg", "HS256")

        if alg == "HS256":
            payload = jwt.decode(
                token,
                settings.SUPABASE_JWT_SECRET,
                algorithms=["HS256"],
                options={"verify_aud": False},
            )
        else:
            # ES256 / RS256 — resolve the signing key from Supabase JWKS (cached
            # by PyJWKClient, which also handles unknown-kid refresh). The fetch is
            # blocking, so run it off the event loop.
            signing_key = await run_in_threadpool(
                lambda: _get_jwks_client().get_signing_key_from_jwt(token)
            )
            payload = jwt.decode(
                token,
                signing_key.key,
                algorithms=[alg],
                options={"verify_aud": False},
            )

        user_id: str | None = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token: missing sub")
        await _assert_active(user_id)
        return user_id

    except HTTPException:
        raise
    except jwt.PyJWTError as exc:
        logger.error("JWT error: %s", exc)
        raise HTTPException(status_code=401, detail="Could not validate token") from exc
    except Exception as exc:
        logger.error("Auth error: %s", exc)
        raise HTTPException(status_code=401, detail="Could not validate token") from exc
