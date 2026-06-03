"""
Custom OTP auth router — production email path.

Flow:
  POST /api/v1/auth/send-otp   → generate code, store in otp_codes, send via Gmail SMTP
  POST /api/v1/auth/verify-otp → validate code, upsert Supabase user, return JWT session

The Gmail SMTP credentials are read from config.  When GMAIL_SMTP_USER is empty
(local dev), this router is still registered but will return 503 on send-otp so
the frontend knows to fall back to the native Supabase OTP flow.
"""

import random
import smtplib
import logging
from datetime import datetime, timezone, timedelta
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.config import settings
from app.db.supabase import get_supabase

logger = logging.getLogger(__name__)

router = APIRouter()


# ── Pydantic models ────────────────────────────────────────────────────────────

class SendOtpRequest(BaseModel):
    email: str

class VerifyOtpRequest(BaseModel):
    email: str
    code: str


# ── Helpers ────────────────────────────────────────────────────────────────────

def _normalize(email: str) -> str:
    return email.strip().lower()

def _is_valid_email(email: str) -> bool:
    return "@" in email and "." in email.split("@")[-1]

def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _send_otp_email(to_email: str, code: str) -> None:
    """Send the OTP email via Gmail SMTP (STARTTLS, port 587)."""
    msg = MIMEMultipart("alternative")
    # Gmail SMTP requires From to match the authenticated SMTP user.
    # Use GMAIL_FROM_ADDRESS only if it is the same account; otherwise fall back to SMTP user.
    from_address = settings.GMAIL_FROM_ADDRESS if settings.GMAIL_FROM_ADDRESS else settings.GMAIL_SMTP_USER
    msg["Subject"] = f"{code} is your Ultimate CashBook sign-in code"
    msg["From"]    = f"{settings.GMAIL_FROM_NAME} <{from_address}>"
    msg["To"]      = to_email
    msg["Reply-To"] = from_address

    plain = (
        f"Your Ultimate CashBook sign-in code is: {code}\n\n"
        f"This code expires in 5 minutes.\n"
        f"If you did not request this, ignore this email."
    )
    html = f"""
<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
  <h2 style="color:#39AAAA;margin-bottom:4px;">Ultimate CashBook</h2>
  <p style="color:#64748B;font-size:14px;margin-top:0;">Your sign-in code is:</p>
  <div style="font-size:36px;font-weight:bold;letter-spacing:8px;color:#0F172A;
              background:#F4FAFA;border:2px solid #39AAAA;border-radius:12px;
              padding:20px;text-align:center;margin:20px 0;">
    {code}
  </div>
  <p style="color:#64748B;font-size:13px;">
    This code expires in <strong>5 minutes</strong>.<br>
    If you did not request this, ignore this email.
  </p>
  <hr style="border:none;border-top:1px solid #E2E8F0;margin:24px 0;">
  <p style="color:#94A3B8;font-size:12px;">
    Ultimate CashBook &middot; {from_address}
  </p>
</div>
"""
    msg.attach(MIMEText(plain, "plain"))
    msg.attach(MIMEText(html,  "html"))

    with smtplib.SMTP("smtp.gmail.com", 587, timeout=10) as smtp:
        smtp.ehlo()
        smtp.starttls()
        smtp.login(settings.GMAIL_SMTP_USER, settings.GMAIL_SMTP_PASSWORD)
        smtp.sendmail(settings.GMAIL_SMTP_USER, to_email, msg.as_string())


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("/send-otp")
async def send_otp(body: SendOtpRequest):
    """
    Generate a 6-digit OTP, store it in otp_codes, and send via Gmail SMTP.
    Returns 503 when GMAIL_SMTP_USER is not configured (local dev).
    """
    if not settings.GMAIL_SMTP_USER:
        raise HTTPException(
            status_code=503,
            detail="SMTP not configured — use Supabase native OTP in dev mode",
        )

    email = _normalize(body.email)
    if not _is_valid_email(email):
        raise HTTPException(status_code=400, detail="Invalid email address")

    sb = get_supabase()

    # Rate-limit: max 3 requests per email per 10 minutes
    window_start = (_now_utc() - timedelta(minutes=10)).isoformat()
    rate_check = (
        sb.table("otp_codes")
        .select("id", count="exact")
        .eq("email", email)
        .gte("created_at", window_start)
        .execute()
    )
    if (rate_check.count or 0) >= 3:
        raise HTTPException(
            status_code=429,
            detail="Too many OTP requests. Please wait a few minutes.",
        )

    # Delete any existing unused codes for this email
    sb.table("otp_codes").delete().eq("email", email).eq("used", False).execute()

    # Generate and store new code (5-minute expiry)
    code = str(random.randint(100000, 999999))
    expires_at = (_now_utc() + timedelta(minutes=5)).isoformat()
    sb.table("otp_codes").insert({
        "email":      email,
        "code":       code,
        "expires_at": expires_at,
        "used":       False,
    }).execute()

    # Send email
    try:
        _send_otp_email(email, code)
    except smtplib.SMTPAuthenticationError as exc:
        logger.error("SMTP auth failed for %s: %s", email, exc)
        raise HTTPException(status_code=500, detail="Email service authentication failed. Contact support.")
    except smtplib.SMTPRecipientsRefused as exc:
        logger.error("SMTP recipient refused for %s: %s", email, exc)
        raise HTTPException(status_code=400, detail="Could not deliver to that email address.")
    except Exception as exc:
        logger.error("SMTP send failed for %s: %s", email, exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to send OTP email: {exc}")

    return {"message": "OTP sent"}


@router.post("/verify-otp")
async def verify_otp(body: VerifyOtpRequest):
    """
    Validate the OTP, upsert the user in Supabase Auth, and return a JWT session.
    Always returns the same error message for wrong/expired codes (no brute-force hint).
    """
    if not settings.GMAIL_SMTP_USER:
        raise HTTPException(
            status_code=503,
            detail="SMTP not configured — use Supabase native OTP in dev mode",
        )

    email = _normalize(body.email)
    code  = body.code.strip()

    if not _is_valid_email(email):
        raise HTTPException(status_code=400, detail="Invalid email address")
    if len(code) != 6 or not code.isdigit():
        raise HTTPException(status_code=400, detail="Invalid or expired code")

    sb = get_supabase()
    INVALID = HTTPException(status_code=400, detail="Invalid or expired code")

    # Fetch the latest unused, unexpired code for this email
    now_iso = _now_utc().isoformat()
    res = (
        sb.table("otp_codes")
        .select("*")
        .eq("email", email)
        .eq("used", False)
        .gt("expires_at", now_iso)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )

    rows = res.data or []
    if not rows:
        raise INVALID

    row = rows[0]
    if row["code"] != code:
        raise INVALID

    # Mark used + clean up old codes
    sb.table("otp_codes").update({"used": True}).eq("id", row["id"]).execute()
    sb.table("otp_codes").delete().eq("email", email).execute()

    # ── Upsert user in Supabase Auth ────────────────────────────────────────────
    service_url = settings.SUPABASE_URL.rstrip("/")
    headers = {
        "apikey":        settings.SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {settings.SUPABASE_SERVICE_KEY}",
        "Content-Type":  "application/json",
    }

    async with httpx.AsyncClient(timeout=15) as client:
        # Try to create the user; 422 means they already exist
        create_res = await client.post(
            f"{service_url}/auth/v1/admin/users",
            headers=headers,
            json={"email": email, "email_confirm": True},
        )

        if create_res.status_code == 422:
            # User already exists — fetch by email
            list_res = await client.get(
                f"{service_url}/auth/v1/admin/users",
                headers=headers,
                params={"email": email},
            )
            list_res.raise_for_status()
            users = list_res.json().get("users", [])
            if not users:
                raise HTTPException(status_code=500, detail="Could not resolve user")
            auth_user = users[0]
        elif create_res.status_code in (200, 201):
            auth_user = create_res.json()
        else:
            logger.error("Supabase admin create user failed: %s %s", create_res.status_code, create_res.text)
            raise HTTPException(status_code=500, detail="Auth service error")

        user_id = auth_user["id"]

        # Generate a magic-link token and exchange it for a real session
        link_res = await client.post(
            f"{service_url}/auth/v1/admin/users/{user_id}/generate-link",
            headers=headers,
            json={"type": "magiclink", "email": email},
        )
        link_res.raise_for_status()
        link_data = link_res.json()
        hashed_token = link_data.get("hashed_token") or link_data.get("properties", {}).get("hashed_token")
        if not hashed_token:
            raise HTTPException(status_code=500, detail="Could not generate session token")

        # Exchange the hashed token for access + refresh tokens
        verify_res = await client.get(
            f"{service_url}/auth/v1/verify",
            params={"token": hashed_token, "type": "magiclink"},
            follow_redirects=False,
        )
        # Supabase returns a redirect (3xx) with the tokens in the fragment.
        # Extract access_token + refresh_token from the Location header.
        location = verify_res.headers.get("location", "")
        if not location:
            raise HTTPException(status_code=500, detail="Session exchange failed")

        # Parse fragment: ...#access_token=...&refresh_token=...
        fragment = location.split("#", 1)[-1] if "#" in location else ""
        params_map: dict[str, str] = {}
        for part in fragment.split("&"):
            if "=" in part:
                k, v = part.split("=", 1)
                params_map[k] = v

        access_token  = params_map.get("access_token")
        refresh_token = params_map.get("refresh_token")

        if not access_token:
            raise HTTPException(status_code=500, detail="Could not extract session from token exchange")

    # Fetch profile (created by the handle_new_user trigger)
    profile_res = (
        sb.table("profiles")
        .select("id,email,full_name,role")
        .eq("id", user_id)
        .single()
        .execute()
    )
    profile = profile_res.data or {}

    return {
        "access_token":  access_token,
        "refresh_token": refresh_token,
        "user": {
            "id":        user_id,
            "email":     email,
            "full_name": profile.get("full_name"),
            "role":      profile.get("role", "user"),
        },
    }
