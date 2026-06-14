"""
Server-side subscription entitlement — the source of truth for paywalls.

Mirrors the frontend feature map (frontend/src/lib/canAccess.js + constants/plans.js)
but is authoritative: the client gates are cosmetic (instant UX), the server is what
actually enforces limits. Tier is read from the profiles row and never trusted from
the request body.

Paywall violations raise HTTP 402 (Payment Required) — NOT 403 — so the frontend can
surface an upgrade sheet without the axios interceptor treating it as an auth failure.
"""

from datetime import datetime, timezone
from fastapi import HTTPException

# Ordered tiers: free < pro < business
TIER_RANK = {"free": 0, "pro": 1, "business": 2}

# Minimum tier required for each gated feature.
FEATURES = {
    "cloud_sync":     "pro",
    "export_reports": "pro",
    "book_sharing":   "pro",
    "guest_access":   "pro",
    "backup_history": "pro",
    "attachments":    "free",
}

# Per-feature numeric caps per tier. None = unlimited.
LIMITS = {
    "books":        {"free": 3,  "pro": 15, "business": None},
    "guest_access": {"free": 0,  "pro": 1,  "business": 10},
    "backup_days":  {"free": 0,  "pro": 7,  "business": 30},
}


def _parse_ts(value) -> datetime | None:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except (ValueError, TypeError):
        return None


def effective_tier(profile: dict) -> str:
    """
    Resolve the entitlement tier from a profiles row, honoring status + expiry.
      - superadmin                      -> always 'business' (full access)
      - status 'active'                 -> the stored tier
      - status 'cancelled' (not expired)-> the stored tier until expires_at passes
      - anything else / expired         -> 'free'
    """
    if profile.get("role") == "superadmin":
        return "business"

    tier = profile.get("subscription_tier") or "free"
    if tier == "free":
        return "free"

    status = profile.get("subscription_status") or "free"
    if status == "active":
        return tier
    if status == "cancelled":
        exp = _parse_ts(profile.get("subscription_expires_at"))
        if exp is None or exp > datetime.now(timezone.utc):
            return tier
    return "free"


def get_user_tier(sb, user_id: str) -> str:
    """Read the user's effective entitlement tier from the database."""
    res = (
        sb.table("profiles")
        .select("role, subscription_tier, subscription_status, subscription_expires_at")
        .eq("id", user_id)
        .single()
        .execute()
    )
    if not res.data:
        return "free"
    return effective_tier(res.data)


def can_access(tier: str, feature: str) -> bool:
    required = FEATURES.get(feature, "free")
    return TIER_RANK.get(tier, 0) >= TIER_RANK.get(required, 0)


def get_limit(tier: str, feature: str):
    """Numeric cap for a feature on a tier, or None for unlimited / unknown."""
    table = LIMITS.get(feature)
    if table is None:
        return None
    return table.get(tier)


def require_feature(sb, user_id: str, feature: str) -> str:
    """Raise 402 if the user's tier cannot access `feature`. Returns the tier."""
    tier = get_user_tier(sb, user_id)
    if not can_access(tier, feature):
        required = FEATURES.get(feature, "pro")
        raise HTTPException(
            status_code=402,
            detail=f"This feature requires the {required} plan or higher.",
        )
    return tier
