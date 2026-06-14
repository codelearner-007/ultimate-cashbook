from fastapi import APIRouter, Depends, HTTPException
from typing import List
from datetime import datetime, timezone
from app.auth.jwt import get_current_user
from app.db.supabase import get_supabase
from app.models.category import CategoryCreate, CategoryUpdate, CategoryResponse, CategoryReorder
from app.models.entry import EntryResponse
from app.utils.book_access import get_book_owner_id, get_book_access, require_rights
from app.utils.reorder import apply_display_order

router = APIRouter()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@router.get("/{book_id}/categories", response_model=List[CategoryResponse])
async def get_categories(book_id: str, user_id: str = Depends(get_current_user)):
    sb = get_supabase()
    owner_id = get_book_owner_id(sb, book_id, user_id)
    result = (
        sb.table("categories")
        .select("*")
        .eq("book_id", book_id)
        .eq("user_id", owner_id)
        .is_("deleted_at", "null")
        .order("display_order")
        .order("created_at")
        .execute()
    )
    return result.data or []


@router.post("/{book_id}/categories", response_model=CategoryResponse, status_code=201)
async def create_category(
    book_id: str,
    payload: CategoryCreate,
    user_id: str = Depends(get_current_user),
):
    sb = get_supabase()
    owner_id, rights = get_book_access(sb, book_id, user_id)
    require_rights(rights, "view_create_edit")

    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Category name cannot be blank")

    existing = (
        sb.table("categories")
        .select("id")
        .eq("book_id", book_id)
        .eq("user_id", owner_id)
        .ilike("name", name)
        .is_("deleted_at", "null")
        .limit(1)
        .execute()
    )
    if existing.data:
        raise HTTPException(status_code=409, detail="Category name already exists in this book")

    insert_data = {
        "book_id": book_id,
        "user_id": owner_id,
        "name":    name,
    }
    # Trust the client-supplied shared UUID when present (else Postgres default).
    if payload.id:
        insert_data["id"] = payload.id

    result = sb.table("categories").insert(insert_data).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create category")
    return result.data[0]


@router.put("/{book_id}/categories/{category_id}", response_model=CategoryResponse)
async def update_category(
    book_id: str,
    category_id: str,
    payload: CategoryUpdate,
    user_id: str = Depends(get_current_user),
):
    sb = get_supabase()
    owner_id, rights = get_book_access(sb, book_id, user_id)
    require_rights(rights, "view_create_edit")

    if not (
        sb.table("categories")
        .select("id")
        .eq("id", category_id)
        .eq("book_id", book_id)
        .eq("user_id", owner_id)
        .is_("deleted_at", "null")
        .limit(1)
        .execute()
    ).data:
        raise HTTPException(status_code=404, detail="Category not found")

    update_data = payload.model_dump(exclude_unset=True)
    if "name" in update_data:
        name = update_data["name"].strip()
        if not name:
            raise HTTPException(status_code=422, detail="Category name cannot be blank")
        existing = (
            sb.table("categories")
            .select("id")
            .eq("book_id", book_id)
            .eq("user_id", owner_id)
            .ilike("name", name)
            .neq("id", category_id)
            .is_("deleted_at", "null")
            .limit(1)
            .execute()
        )
        if existing.data:
            raise HTTPException(status_code=409, detail="Category name already exists in this book")
        update_data["name"] = name

    sb.table("categories").update(update_data).eq("id", category_id).eq("user_id", owner_id).execute()
    result = (
        sb.table("categories")
        .select("*")
        .eq("id", category_id)
        .eq("user_id", owner_id)
        .limit(1)
        .execute()
    )
    return result.data[0]


@router.delete("/{book_id}/categories/{category_id}", status_code=204)
async def delete_category(
    book_id: str,
    category_id: str,
    user_id: str = Depends(get_current_user),
):
    sb = get_supabase()
    owner_id, rights = get_book_access(sb, book_id, user_id)
    require_rights(rights, "view_create_edit_delete")

    if not (
        sb.table("categories")
        .select("id")
        .eq("id", category_id)
        .eq("book_id", book_id)
        .eq("user_id", owner_id)
        .is_("deleted_at", "null")
        .limit(1)
        .execute()
    ).data:
        raise HTTPException(status_code=404, detail="Category not found")

    # Soft delete: hidden from lists; surfaced by the delta endpoint as a tombstone.
    sb.table("categories").update({"deleted_at": _now_iso()}).eq("id", category_id).eq("user_id", owner_id).execute()


@router.patch("/{book_id}/categories/reorder", status_code=204)
async def reorder_categories(
    book_id: str,
    payload: CategoryReorder,
    user_id: str = Depends(get_current_user),
):
    sb = get_supabase()
    owner_id, rights = get_book_access(sb, book_id, user_id)
    require_rights(rights, "view_create_edit")
    apply_display_order(sb, "categories", book_id, owner_id, payload.ordered_ids)


@router.get("/{book_id}/categories/{category_id}/entries", response_model=List[EntryResponse])
async def get_category_entries(
    book_id: str,
    category_id: str,
    user_id: str = Depends(get_current_user),
):
    sb = get_supabase()
    owner_id = get_book_owner_id(sb, book_id, user_id)

    if not (
        sb.table("categories")
        .select("id")
        .eq("id", category_id)
        .eq("book_id", book_id)
        .eq("user_id", owner_id)
        .is_("deleted_at", "null")
        .limit(1)
        .execute()
    ).data:
        raise HTTPException(status_code=404, detail="Category not found")

    result = (
        sb.table("entries")
        .select("*")
        .eq("book_id", book_id)
        .eq("user_id", owner_id)
        .eq("category_id", category_id)
        .is_("deleted_at", "null")
        .order("entry_date", desc=True)
        .order("entry_time", desc=True)
        .execute()
    )
    return result.data or []
