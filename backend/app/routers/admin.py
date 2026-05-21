from fastapi import APIRouter, Depends, HTTPException
from typing import List
import httpx
import logging
from app.auth.jwt import get_current_user
from app.db.supabase import get_supabase
from app.models.profile import UserWithStats
from app.models.book import BookResponse
from app.models.notification import NotificationCreate, NotificationResponse

logger = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/push/send"
EXPO_PUSH_BATCH = 100   # Expo max per request


async def _send_expo_push(tokens: list[str], title: str, body: str, notification_id: str):
    """Fire-and-forget: send push notifications via Expo Push API.
    Batches tokens in groups of 100. Errors are silently ignored so a
    failed push never blocks the DB fan-out."""
    if not tokens:
        return
    messages = [
        {
            "to": token,
            "title": title,
            "body": body,
            "sound": "default",
            "data": {"notification_id": notification_id},
            "channelId": "default",
        }
        for token in tokens
    ]
    async with httpx.AsyncClient(timeout=10) as client:
        for i in range(0, len(messages), EXPO_PUSH_BATCH):
            batch = messages[i : i + EXPO_PUSH_BATCH]
            try:
                await client.post(
                    EXPO_PUSH_URL,
                    json=batch,
                    headers={
                        "Accept": "application/json",
                        "Accept-Encoding": "gzip, deflate",
                        "Content-Type": "application/json",
                    },
                )
            except Exception as exc:
                logger.warning("Push batch failed (tokens %d–%d): %s", i, i + EXPO_PUSH_BATCH, exc)

router = APIRouter()


async def require_superadmin(user_id: str = Depends(get_current_user)) -> str:
    """Dependency — 403 if caller is not a superadmin."""
    sb = get_supabase()
    res = sb.table("profiles").select("role").eq("id", user_id).single().execute()
    if not res.data or res.data["role"] != "superadmin":
        raise HTTPException(status_code=403, detail="Superadmin access required")
    return user_id


@router.get("/users", response_model=List[UserWithStats])
async def get_all_users(admin_id: str = Depends(require_superadmin)):
    """All non-superadmin profiles with book/entry stats."""
    sb = get_supabase()
    profiles_res = (
        sb.table("profiles")
        .select("*")
        .neq("role", "superadmin")
        .order("created_at", desc=True)
        .execute()
    )
    users = profiles_res.data or []

    result = []
    for u in users:
        books_res = sb.table("books").select("id").eq("user_id", u["id"]).execute()
        book_count = len(books_res.data or [])

        entries_res = (
            sb.table("entries")
            .select("id")
            .eq("user_id", u["id"])
            .execute()
        )
        entry_count = len(entries_res.data or [])

        try:
            db_b = sb.rpc("get_user_data_bytes", {"p_user_id": u["id"]}).execute()
            db_bytes = db_b.data or 0
        except Exception:
            db_bytes = 0

        try:
            st_b = sb.rpc("get_user_storage_bytes", {"p_user_id": u["id"]}).execute()
            storage_bytes = st_b.data or 0
        except Exception:
            storage_bytes = 0

        storage_mb = round((db_bytes + storage_bytes) / (1024 * 1024), 3)

        try:
            shares_res = (
                sb.table("book_shares")
                .select("id")
                .eq("owner_id", u["id"])
                .eq("status", "accepted")
                .execute()
            )
            shared_books_count = len(shares_res.data or [])
        except Exception:
            shared_books_count = 0

        result.append({
            **u,
            "book_count": book_count,
            "entry_count": entry_count,
            "storage_mb": storage_mb,
            "shared_books_count": shared_books_count,
        })

    return result


@router.get("/users/{user_id}/books", response_model=List[BookResponse])
async def get_user_books(user_id: str, admin_id: str = Depends(require_superadmin)):
    """Admin view of any user's books."""
    sb = get_supabase()
    try:
        result = sb.rpc("get_books_with_summary", {"p_user_id": user_id}).execute()
        return result.data or []
    except Exception:
        result = (
            sb.table("books")
            .select("*")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .execute()
        )
        return [
            {**b, "net_balance": b.get("net_balance", 0), "last_entry_at": None}
            for b in (result.data or [])
        ]


# ── Notifications ──────────────────────────────────────────────────────────────

def _resolve_recipients(sb, target_type: str, payload, admin_id: str) -> List[str]:
    """Return the list of user_ids who should receive this notification."""
    from datetime import datetime, timezone, timedelta

    if target_type == "all":
        res = (
            sb.table("profiles")
            .select("id")
            .neq("role", "superadmin")
            .execute()
        )
        ids = [p["id"] for p in (res.data or [])]

    elif target_type == "new_users":
        days = payload.days_threshold or 30
        cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        res = (
            sb.table("profiles")
            .select("id")
            .neq("role", "superadmin")
            .gte("created_at", cutoff)
            .execute()
        )
        ids = [p["id"] for p in (res.data or [])]

    elif target_type == "with_books":
        # Active users who have at least 1 book
        all_res = (
            sb.table("profiles")
            .select("id")
            .neq("role", "superadmin")
            .execute()
        )
        all_ids = {p["id"] for p in (all_res.data or [])}
        books_res = sb.table("books").select("user_id").in_("user_id", list(all_ids)).execute()
        has_book = {b["user_id"] for b in (books_res.data or [])}
        ids = [uid for uid in all_ids if uid in has_book]

    elif target_type == "without_books":
        # Active users who have NOT created any book yet
        all_res = (
            sb.table("profiles")
            .select("id")
            .neq("role", "superadmin")
            .execute()
        )
        all_ids = {p["id"] for p in (all_res.data or [])}
        books_res = sb.table("books").select("user_id").in_("user_id", list(all_ids)).execute()
        has_book = {b["user_id"] for b in (books_res.data or [])}
        ids = [uid for uid in all_ids if uid not in has_book]

    elif target_type == "specific":
        ids = list(payload.user_ids or [])

    else:
        ids = []

    # Admin always receives their own broadcasts (except 'specific' targeting,
    # where the admin deliberately chose a subset and may not want to self-include)
    if target_type != "specific" and admin_id not in ids:
        ids.append(admin_id)

    return ids


@router.post("/notifications", response_model=NotificationResponse)
async def send_notification(
    payload: NotificationCreate,
    admin_id: str = Depends(require_superadmin),
):
    """Create a notification and fan it out to the resolved target segment."""
    sb = get_supabase()

    # For 'specific': validate every supplied ID is a real non-superadmin profile
    if payload.target_type == "specific":
        if not payload.user_ids:
            raise HTTPException(status_code=422, detail="user_ids required when target_type is 'specific'")
        profiles_res = (
            sb.table("profiles")
            .select("id")
            .in_("id", payload.user_ids)
            .neq("role", "superadmin")
            .execute()
        )
        valid_ids = {p["id"] for p in (profiles_res.data or [])}
        invalid = set(payload.user_ids) - valid_ids
        if invalid:
            raise HTTPException(status_code=422, detail=f"Unknown or superadmin user IDs: {list(invalid)}")

    # Insert the notification row
    notif_res = (
        sb.table("notifications")
        .insert({
            "title": payload.title,
            "body": payload.body,
            "target_type": payload.target_type,
            "days_threshold": payload.days_threshold if payload.target_type == "new_users" else None,
            "created_by": admin_id,
        })
        .execute()
    )
    notif = notif_res.data[0]
    notif_id = notif["id"]

    # Resolve and fan out to DB
    recipient_ids = _resolve_recipients(sb, payload.target_type, payload, admin_id)
    if recipient_ids:
        rows = [{"user_id": uid, "notification_id": notif_id} for uid in recipient_ids]
        sb.table("user_notifications").insert(rows).execute()

    # Send device push notifications — wrapped in try/except so a missing
    # push_tokens table (migration 019 not yet run) never blocks the send.
    if recipient_ids:
        try:
            tokens_res = (
                sb.table("push_tokens")
                .select("token")
                .in_("user_id", recipient_ids)
                .execute()
            )
            tokens = [t["token"] for t in (tokens_res.data or [])]
            await _send_expo_push(tokens, payload.title, payload.body, notif_id)
        except Exception:
            pass

    return {**notif, "recipient_count": len(recipient_ids)}


@router.get("/notifications", response_model=List[NotificationResponse])
async def list_sent_notifications(admin_id: str = Depends(require_superadmin)):
    """All notifications sent by this admin, newest first."""
    sb = get_supabase()
    result = (
        sb.table("notifications")
        .select("*")
        .eq("created_by", admin_id)
        .order("created_at", desc=True)
        .execute()
    )
    notifications = result.data or []
    if not notifications:
        return []

    # Fetch all recipient counts in a single query instead of N+1 per notification
    notif_ids = [n["id"] for n in notifications]
    counts_res = (
        sb.table("user_notifications")
        .select("notification_id", count="exact")
        .in_("notification_id", notif_ids)
        .execute()
    )
    # Build a map: notification_id → count using the raw data rows
    count_map: dict[str, int] = {}
    for row in (counts_res.data or []):
        nid = row["notification_id"]
        count_map[nid] = count_map.get(nid, 0) + 1

    return [{**n, "recipient_count": count_map.get(n["id"], 0)} for n in notifications]
