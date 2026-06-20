from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List
from datetime import datetime, timezone, timedelta
from dateutil.relativedelta import relativedelta
from app.auth.jwt import get_current_user
from app.db.supabase import get_supabase
from app.models.profile import ProfileResponse, ProfileUpdate, SubscriptionUpdate
from app.models.sharing import CollaboratorProfile

# Backup retention days per tier — must match canAccess.js LIMITS.backup_days
BACKUP_DAYS = {"pro": 7, "business": 15}


def _next_renewal(started_at: datetime, billing_cycle: str) -> datetime:
    """
    Calculate the next renewal datetime from the original subscription start,
    preserving the exact time-of-day (e.g. 17:30:00 UTC).

    Monthly: same day-of-month and time each month from started_at.
    Yearly:  same day, month, and time each year from started_at.

    Example:
        started_at = 2027-01-01 17:30:00 UTC, billing_cycle = 'monthly'
        → next renewal after now = 2027-02-01 17:30:00 UTC
          then 2027-03-01 17:30:00 UTC, etc.
    """
    now = datetime.now(timezone.utc)
    # Ensure started_at is tz-aware
    if started_at.tzinfo is None:
        started_at = started_at.replace(tzinfo=timezone.utc)

    delta = relativedelta(months=1) if billing_cycle == "monthly" else relativedelta(years=1)

    renewal = started_at
    # Advance until we pass now
    while renewal <= now:
        renewal += delta
    return renewal

router = APIRouter()


@router.get("", response_model=ProfileResponse)
async def get_profile(user_id: str = Depends(get_current_user)):
    sb = get_supabase()
    result = sb.table("profiles").select("*").eq("id", user_id).single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Profile not found")
    profile = result.data
    try:
        db_b = sb.rpc("get_user_data_bytes", {"p_user_id": user_id}).execute()
        db_bytes = db_b.data or 0
    except Exception:
        db_bytes = 0
    try:
        st_b = sb.rpc("get_user_storage_bytes", {"p_user_id": user_id}).execute()
        storage_bytes = st_b.data or 0
    except Exception:
        storage_bytes = 0
    profile["storage_mb"] = round((db_bytes + storage_bytes) / (1024 * 1024), 3)
    try:
        entries_res = sb.table("entries").select("id").eq("user_id", user_id).execute()
        profile["entry_count"] = len(entries_res.data or [])
    except Exception:
        profile["entry_count"] = 0
    try:
        shares_res = (
            sb.table("book_shares")
            .select("id")
            .eq("owner_id", user_id)
            .eq("status", "accepted")
            .execute()
        )
        profile["shared_books_count"] = len(shares_res.data or [])
    except Exception:
        profile["shared_books_count"] = 0
    return profile


@router.put("", response_model=ProfileResponse)
async def update_profile(
    payload: ProfileUpdate,
    user_id: str = Depends(get_current_user),
):
    sb = get_supabase()
    update_data = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    result = (
        sb.table("profiles")
        .update(update_data)
        .eq("id", user_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Profile not found")
    return result.data[0]


@router.patch("/subscription", response_model=ProfileResponse)
async def update_subscription(
    payload: SubscriptionUpdate,
    user_id: str = Depends(get_current_user),
):
    sb = get_supabase()
    now = datetime.now(timezone.utc)

    # Always fetch the current profile first — we need started_at and current tier
    current_res = sb.table("profiles").select(
        "subscription_tier, subscription_started_at, subscription_expires_at, subscription_billing_cycle"
    ).eq("id", user_id).single().execute()
    current = current_res.data or {}

    prior_tier        = current.get("subscription_tier", "free")
    prior_started_at  = current.get("subscription_started_at")
    prior_expires_at  = current.get("subscription_expires_at")

    # Parse prior_started_at to a tz-aware datetime if present
    if prior_started_at:
        if isinstance(prior_started_at, str):
            prior_started_at = datetime.fromisoformat(prior_started_at.replace("Z", "+00:00"))
        if prior_started_at.tzinfo is None:
            prior_started_at = prior_started_at.replace(tzinfo=timezone.utc)

    update_data: dict = {
        "subscription_tier":                 payload.subscription_tier,
        "subscription_status":               payload.subscription_status,
        "subscription_billing_cycle":        payload.billing_cycle,
        "subscription_cancel_at_period_end": payload.cancel_at_period_end,
    }

    # ── Activating or renewing a paid plan ────────────────────────────────────
    if payload.subscription_status == "active" and payload.subscription_tier != "free":

        # started_at: set only on first-ever activation (free → paid).
        # On renewal (paid → same/different paid), preserve the original started_at
        # so renewal dates stay anchored to the original purchase timestamp.
        is_first_activation = prior_tier == "free" or prior_started_at is None
        if is_first_activation:
            update_data["subscription_started_at"] = now.isoformat()
            anchor = now
        else:
            # Keep prior started_at; use it as the anchor for renewal date calculation
            anchor = prior_started_at

        # expires_at: calculate from the anchor timestamp + billing cycle.
        # This ensures the renewal window is always "same day & time each period"
        # (e.g. started 2027-01-01 17:30 → expires 2027-02-01 17:30, then 2027-03-01 17:30).
        # If the caller explicitly provides expires_at, trust it (e.g. webhook from app store).
        if payload.expires_at is not None:
            update_data["subscription_expires_at"] = payload.expires_at.isoformat()
        else:
            update_data["subscription_expires_at"] = _next_renewal(anchor, payload.billing_cycle).isoformat()

        # Resubscribing: clear any pending cloud data deletion
        update_data["cloud_data_delete_at"] = None

    # ── Lapsing: subscription expired or cancelled ────────────────────────────
    elif payload.subscription_status in ("expired", "cancelled") or payload.subscription_tier == "free":

        # expires_at: the exact moment the subscription ended.
        # Prefer the explicitly-provided value (most accurate — from the payment processor).
        # Fall back to the stored expires_at (already on the profile from prior activation).
        # Last resort: use now (shouldn't happen in practice).
        if payload.expires_at is not None:
            lapse_moment = payload.expires_at
        elif prior_expires_at:
            if isinstance(prior_expires_at, str):
                prior_expires_at = datetime.fromisoformat(prior_expires_at.replace("Z", "+00:00"))
            if prior_expires_at.tzinfo is None:
                prior_expires_at = prior_expires_at.replace(tzinfo=timezone.utc)
            lapse_moment = prior_expires_at
        else:
            lapse_moment = now

        update_data["subscription_expires_at"] = lapse_moment.isoformat()

        # cloud_data_delete_at: lapse_moment + retention_days for the prior paid tier.
        # Keeps the grace period anchored to when the plan actually ended,
        # not to when this API call was made.
        retention_days = BACKUP_DAYS.get(prior_tier, 0)
        if retention_days > 0:
            update_data["cloud_data_delete_at"] = (lapse_moment + timedelta(days=retention_days)).isoformat()
        else:
            # Was already on free tier — no cloud data to retain
            update_data["cloud_data_delete_at"] = None

        # Clear started_at when fully downgraded to free
        if payload.subscription_tier == "free":
            update_data["subscription_started_at"] = None

    result = (
        sb.table("profiles")
        .update(update_data)
        .eq("id", user_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Profile not found")
    return result.data[0]


@router.get("/search", response_model=List[CollaboratorProfile])
async def search_users(
    q: str = Query(..., min_length=1),
    user_id: str = Depends(get_current_user),
):
    """Search all active profiles by email (for share-book flow). Includes superadmin."""
    sb = get_supabase()
    results = (
        sb.table("profiles")
        .select("id, full_name, email, avatar_url")
        .ilike("email", f"%{q.strip()}%")
        .neq("id", user_id)
        .limit(10)
        .execute()
    ).data or []
    return results
