"""
RevenueCat webhook — the ONLY writer of subscription entitlements.

RevenueCat is configured with `app_user_id == profiles.id`, so each event maps
directly to one user. The endpoint:
  - verifies the Authorization header against REVENUECAT_WEBHOOK_AUTH,
  - is idempotent (processed_webhook_events guards retries),
  - derives tier/status/expiry ONLY from the verified event payload — never
    from any client-supplied value.

The profiles column-guard trigger (migration 011) blocks users from writing
their own subscription fields, so this service-role path is the sole source of
truth for paid entitlements.
"""

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Header, HTTPException, Request

from app.config import settings
from app.db.supabase import get_supabase

logger = logging.getLogger(__name__)
router = APIRouter()

# Event types that grant or refresh a paid entitlement.
_ACTIVE_TYPES = {
    "INITIAL_PURCHASE", "RENEWAL", "PRODUCT_CHANGE",
    "UNCANCELLATION", "NON_RENEWING_PURCHASE",
}


def _product_to_tier(product_id: str, entitlement_ids: list[str]) -> str:
    hay = " ".join([product_id or ""] + (entitlement_ids or [])).lower()
    if "business" in hay or "biz" in hay:
        return "business"
    return "pro"  # any other paid entitlement maps to pro


def _billing_cycle(product_id: str, period_type) -> str:
    hay = (product_id or "").lower()
    if "year" in hay or "annual" in hay or str(period_type or "").lower() == "annual":
        return "yearly"
    return "monthly"


def _ms_to_iso(ms) -> str | None:
    if not ms:
        return None
    try:
        return datetime.fromtimestamp(int(ms) / 1000, tz=timezone.utc).isoformat()
    except (ValueError, TypeError, OSError):
        return None


@router.post("/revenuecat")
async def revenuecat_webhook(request: Request, authorization: str = Header(None)):
    # 1. Verify the shared secret (RevenueCat sends it as the Authorization header).
    if not settings.REVENUECAT_WEBHOOK_AUTH:
        raise HTTPException(status_code=503, detail="Webhook not configured")
    if authorization != settings.REVENUECAT_WEBHOOK_AUTH:
        raise HTTPException(status_code=401, detail="Invalid webhook signature")

    body = await request.json()
    event = (body or {}).get("event") or {}
    event_id = event.get("id")
    event_type = event.get("type")
    app_user_id = event.get("app_user_id")

    if not event_id or not app_user_id:
        raise HTTPException(status_code=400, detail="Malformed event")

    sb = get_supabase()

    # 2. Idempotency — RevenueCat retries on non-2xx; ignore already-seen events.
    try:
        dup = (
            sb.table("processed_webhook_events")
            .select("event_id").eq("event_id", event_id).limit(1).execute()
        )
        if dup.data:
            return {"status": "duplicate"}
    except Exception:
        pass  # table missing (migration not yet run) — proceed best-effort

    # 3. Derive entitlement strictly from the verified event.
    product_id = event.get("product_id") or ""
    entitlement_ids = event.get("entitlement_ids") or []
    expires_iso = _ms_to_iso(event.get("expiration_at_ms"))
    now_iso = datetime.now(timezone.utc).isoformat()

    update: dict = {}
    if event_type in _ACTIVE_TYPES:
        update = {
            "subscription_tier": _product_to_tier(product_id, entitlement_ids),
            "subscription_status": "active",
            "subscription_billing_cycle": _billing_cycle(product_id, event.get("period_type")),
            "subscription_expires_at": expires_iso,
            "subscription_cancel_at_period_end": False,
            "subscription_started_at": now_iso,
        }
    elif event_type == "CANCELLATION":
        # Still entitled until the period ends; just flag the pending cancel.
        update = {"subscription_status": "cancelled", "subscription_cancel_at_period_end": True}
        if expires_iso:
            update["subscription_expires_at"] = expires_iso
    elif event_type == "EXPIRATION":
        update = {
            "subscription_tier": "free",
            "subscription_status": "expired",
            "subscription_expires_at": expires_iso,
            "subscription_cancel_at_period_end": False,
        }
    elif event_type == "BILLING_ISSUE":
        update = {"subscription_status": "past_due"}
    # Other types (TRANSFER, SUBSCRIPTION_PAUSED, TEST, …): acknowledge, no change.

    if update:
        try:
            sb.table("profiles").update(update).eq("id", app_user_id).execute()
        except Exception as exc:
            logger.exception("RevenueCat entitlement update failed for %s", app_user_id)
            raise HTTPException(status_code=500, detail="Failed to apply entitlement") from exc

    # 4. Record as processed (best-effort; failure here is non-fatal).
    try:
        sb.table("processed_webhook_events").insert({
            "event_id": event_id,
            "event_type": event_type,
            "app_user_id": app_user_id,
        }).execute()
    except Exception:
        pass

    return {"status": "ok"}
