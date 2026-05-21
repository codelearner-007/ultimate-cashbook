from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List
from datetime import datetime, timezone
from app.auth.jwt import get_current_user
from app.db.supabase import get_supabase
from app.models.profile import ProfileResponse, ProfileUpdate, SubscriptionUpdate
from app.models.sharing import CollaboratorProfile

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
    update_data = {
        "subscription_tier":         payload.subscription_tier,
        "subscription_started_at":   datetime.now(timezone.utc).isoformat(),
        "subscription_billing_cycle": payload.billing_cycle,
    }
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
