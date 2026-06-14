from fastapi import APIRouter, Depends, HTTPException
from typing import List, Any
from datetime import datetime, timezone
from app.auth.jwt import get_current_user
from app.db.supabase import get_supabase
from app.models.payment_mode import PaymentModeCreate, PaymentModeUpdate, PaymentModeResponse, PaymentModeReorder
from app.utils.book_access import get_book_owner_id, get_book_access, require_rights
from app.utils.reorder import apply_display_order

router = APIRouter()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@router.get("/{book_id}/payment-modes", response_model=List[PaymentModeResponse])
async def get_payment_modes(book_id: str, user_id: str = Depends(get_current_user)):
    sb = get_supabase()
    owner_id = get_book_owner_id(sb, book_id, user_id)
    result = (
        sb.table("payment_modes")
        .select("*")
        .eq("book_id", book_id)
        .eq("user_id", owner_id)
        .is_("deleted_at", "null")
        .order("display_order")
        .order("created_at")
        .execute()
    )
    return result.data or []


@router.post("/{book_id}/payment-modes", response_model=PaymentModeResponse, status_code=201)
async def create_payment_mode(
    book_id: str,
    payload: PaymentModeCreate,
    user_id: str = Depends(get_current_user),
):
    sb = get_supabase()
    owner_id, rights = get_book_access(sb, book_id, user_id)
    require_rights(rights, "view_create_edit")

    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Payment mode name cannot be blank")

    existing = (
        sb.table("payment_modes")
        .select("id")
        .eq("book_id", book_id)
        .eq("user_id", owner_id)
        .ilike("name", name)
        .is_("deleted_at", "null")
        .limit(1)
        .execute()
    )
    if existing.data:
        raise HTTPException(status_code=409, detail="Payment mode already exists in this book")

    count_res = (
        sb.table("payment_modes")
        .select("id", count="exact")
        .eq("book_id", book_id)
        .is_("deleted_at", "null")
        .execute()
    )
    next_order = count_res.count or 0

    insert_data = {
        "book_id":       book_id,
        "user_id":       owner_id,
        "name":          name,
        "display_order": next_order,
    }
    # Trust the client-supplied shared UUID when present (else Postgres default).
    if payload.id:
        insert_data["id"] = payload.id

    result = sb.table("payment_modes").insert(insert_data).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create payment mode")
    return result.data[0]


@router.put("/{book_id}/payment-modes/{mode_id}", response_model=PaymentModeResponse)
async def update_payment_mode(
    book_id: str,
    mode_id: str,
    payload: PaymentModeUpdate,
    user_id: str = Depends(get_current_user),
):
    sb = get_supabase()
    owner_id, rights = get_book_access(sb, book_id, user_id)
    require_rights(rights, "view_create_edit")

    if not (
        sb.table("payment_modes")
        .select("id")
        .eq("id", mode_id)
        .eq("book_id", book_id)
        .eq("user_id", owner_id)
        .is_("deleted_at", "null")
        .limit(1)
        .execute()
    ).data:
        raise HTTPException(status_code=404, detail="Payment mode not found")

    update_data = payload.model_dump(exclude_unset=True)
    if "name" in update_data:
        name = update_data["name"].strip()
        if not name:
            raise HTTPException(status_code=422, detail="Payment mode name cannot be blank")
        existing = (
            sb.table("payment_modes")
            .select("id")
            .eq("book_id", book_id)
            .eq("user_id", owner_id)
            .ilike("name", name)
            .neq("id", mode_id)
            .is_("deleted_at", "null")
            .limit(1)
            .execute()
        )
        if existing.data:
            raise HTTPException(status_code=409, detail="Payment mode already exists in this book")
        update_data["name"] = name

    sb.table("payment_modes").update(update_data).eq("id", mode_id).eq("user_id", owner_id).execute()
    result = (
        sb.table("payment_modes")
        .select("*")
        .eq("id", mode_id)
        .eq("user_id", owner_id)
        .limit(1)
        .execute()
    )
    return result.data[0]


@router.delete("/{book_id}/payment-modes/{mode_id}", status_code=204)
async def delete_payment_mode(
    book_id: str,
    mode_id: str,
    user_id: str = Depends(get_current_user),
):
    sb = get_supabase()
    owner_id, rights = get_book_access(sb, book_id, user_id)
    require_rights(rights, "view_create_edit_delete")

    if not (
        sb.table("payment_modes")
        .select("id")
        .eq("id", mode_id)
        .eq("book_id", book_id)
        .eq("user_id", owner_id)
        .is_("deleted_at", "null")
        .limit(1)
        .execute()
    ).data:
        raise HTTPException(status_code=404, detail="Payment mode not found")

    count_res = (
        sb.table("payment_modes")
        .select("id", count="exact")
        .eq("book_id", book_id)
        .eq("user_id", owner_id)
        .is_("deleted_at", "null")
        .execute()
    )
    if (count_res.count or 0) <= 1:
        raise HTTPException(status_code=400, detail="Cannot delete the last payment mode")

    # Soft delete: hidden from lists; surfaced by the delta endpoint as a tombstone.
    sb.table("payment_modes").update({"deleted_at": _now_iso()}).eq("id", mode_id).eq("user_id", owner_id).execute()


@router.patch("/{book_id}/payment-modes/reorder", status_code=204)
async def reorder_payment_modes(
    book_id: str,
    payload: PaymentModeReorder,
    user_id: str = Depends(get_current_user),
):
    sb = get_supabase()
    owner_id, rights = get_book_access(sb, book_id, user_id)
    require_rights(rights, "view_create_edit")

    apply_display_order(sb, "payment_modes", book_id, owner_id, payload.ordered_ids)


@router.get("/{book_id}/payment-modes/{mode_id}/entries", response_model=List[Any])
async def get_payment_mode_entries(
    book_id: str,
    mode_id: str,
    user_id: str = Depends(get_current_user),
):
    sb = get_supabase()
    owner_id = get_book_owner_id(sb, book_id, user_id)

    if not (
        sb.table("payment_modes")
        .select("id")
        .eq("id", mode_id)
        .eq("book_id", book_id)
        .eq("user_id", owner_id)
        .is_("deleted_at", "null")
        .limit(1)
        .execute()
    ).data:
        raise HTTPException(status_code=404, detail="Payment mode not found")

    result = (
        sb.table("entries")
        .select("*")
        .eq("book_id", book_id)
        .eq("user_id", owner_id)
        .eq("payment_mode_id", mode_id)
        .is_("deleted_at", "null")
        .order("entry_date", desc=True)
        .order("entry_time", desc=True)
        .execute()
    )
    return result.data or []
