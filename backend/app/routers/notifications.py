from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timezone
from app.auth.jwt import get_current_user
from app.db.supabase import get_supabase
from app.models.notification import UserNotificationResponse

router = APIRouter()


# ── Push Token ────────────────────────────────────────────────────────────────

class PushTokenBody(BaseModel):
    token: str
    platform: Optional[str] = None   # 'ios' | 'android'


@router.post("/push-token", response_model=dict)
async def save_push_token(
    body: PushTokenBody,
    user_id: str = Depends(get_current_user),
):
    """Upsert the device's Expo push token for the current user."""
    sb = get_supabase()
    sb.table("push_tokens").upsert(
        {
            "user_id": user_id,
            "token": body.token,
            "platform": body.platform,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        },
        on_conflict="user_id,token",
    ).execute()
    return {"ok": True}


# ── Inbox ─────────────────────────────────────────────────────────────────────

@router.get("", response_model=List[UserNotificationResponse])
async def get_notifications(
    unread: Optional[bool] = None,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    user_id: str = Depends(get_current_user),
):
    """Return the current user's notification inbox, newest first."""
    sb = get_supabase()
    query = (
        sb.table("user_notifications")
        .select("id, notification_id, is_read, read_at, created_at, notifications(title, body)")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
    )
    if unread is True:
        query = query.eq("is_read", False)

    rows = query.range(offset, offset + limit - 1).execute().data or []
    return [
        {
            "id": r["id"],
            "notification_id": r["notification_id"],
            "title": r["notifications"]["title"],
            "body": r["notifications"]["body"],
            "is_read": r["is_read"],
            "read_at": r["read_at"],
            "created_at": r["created_at"],
        }
        for r in rows
    ]


# ── Bulk operations (defined before /{id} routes to avoid param shadowing) ────

class BulkIdsBody(BaseModel):
    ids: List[str]


@router.post("/bulk-delete", response_model=dict)
async def bulk_delete_notifications(
    body: BulkIdsBody,
    user_id: str = Depends(get_current_user),
):
    """Permanently delete multiple notifications from the user's inbox."""
    sb = get_supabase()
    if body.ids:
        sb.table("user_notifications") \
            .delete() \
            .in_("id", body.ids) \
            .eq("user_id", user_id) \
            .execute()
    return {"ok": True}


@router.post("/bulk-read", response_model=dict)
async def bulk_mark_read(
    body: BulkIdsBody,
    user_id: str = Depends(get_current_user),
):
    """Mark multiple notifications as read."""
    sb = get_supabase()
    if body.ids:
        sb.table("user_notifications") \
            .update({"is_read": True, "read_at": datetime.now(timezone.utc).isoformat()}) \
            .in_("id", body.ids) \
            .eq("user_id", user_id) \
            .execute()
    return {"ok": True}


# ── Single operations ─────────────────────────────────────────────────────────

@router.patch("/read-all", response_model=dict)
async def mark_all_read(user_id: str = Depends(get_current_user)):
    """Mark every unread notification as read for the current user."""
    sb = get_supabase()
    sb.table("user_notifications").update({
        "is_read": True,
        "read_at": datetime.now(timezone.utc).isoformat(),
    }).eq("user_id", user_id).eq("is_read", False).execute()
    return {"ok": True}


@router.delete("/{notification_id}", response_model=dict)
async def delete_notification(
    notification_id: str,
    user_id: str = Depends(get_current_user),
):
    """Permanently delete a notification from the current user's inbox."""
    sb = get_supabase()
    sb.table("user_notifications") \
        .delete() \
        .eq("id", notification_id) \
        .eq("user_id", user_id) \
        .execute()
    return {"ok": True}


@router.patch("/{notification_id}/read", response_model=UserNotificationResponse)
async def mark_one_read(
    notification_id: str,
    user_id: str = Depends(get_current_user),
):
    """Mark a single notification as read."""
    sb = get_supabase()
    result = (
        sb.table("user_notifications")
        .update({"is_read": True, "read_at": datetime.now(timezone.utc).isoformat()})
        .eq("id", notification_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Notification not found")

    r = result.data[0]
    notif = (
        sb.table("notifications")
        .select("title, body")
        .eq("id", r["notification_id"])
        .single()
        .execute()
    )
    return {
        "id": r["id"],
        "notification_id": r["notification_id"],
        "title": notif.data["title"],
        "body": notif.data["body"],
        "is_read": r["is_read"],
        "read_at": r["read_at"],
        "created_at": r["created_at"],
    }
