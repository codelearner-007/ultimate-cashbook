from fastapi import APIRouter, Depends, HTTPException
from typing import List
from app.auth.jwt import get_current_user
from app.db.supabase import get_supabase
from app.models.book import BookCreate, BookUpdate, BookResponse, FieldSettingsBody
from app.models.sharing import SharedBookResponse
from app.utils.book_access import get_book_owner_id

router = APIRouter()

# Mirrors canAccess.js LIMITS.books — superadmin is handled by role check
BOOK_LIMITS = {"free": 5, "pro": 15, "business": None}  # None = unlimited


@router.get("/shared", response_model=List[SharedBookResponse])
async def get_shared_books(user_id: str = Depends(get_current_user)):
    """Return all books shared WITH the current user (where they are a recipient)."""
    sb = get_supabase()

    shares = (
        sb.table("book_shares")
        .select("*")
        .eq("shared_with_id", user_id)
        .eq("status", "accepted")
        .execute()
    ).data or []

    if not shares:
        return []

    book_ids  = [s["book_id"]  for s in shares]
    owner_ids = list({s["owner_id"] for s in shares})

    books_map = {
        b["id"]: b
        for b in (
            sb.table("books").select("*").in_("id", book_ids).execute()
        ).data or []
    }
    owners_map = {
        p["id"]: p
        for p in (
            sb.table("profiles")
            .select("id, full_name, email")
            .in_("id", owner_ids)
            .execute()
        ).data or []
    }

    result = []
    for share in shares:
        book  = books_map.get(share["book_id"])
        owner = owners_map.get(share["owner_id"])
        if not book or not owner:
            continue
        result.append({
            "id":              book["id"],
            "name":            book["name"],
            "currency":        book.get("currency", "PKR"),
            "net_balance":     book.get("net_balance", 0),
            "last_entry_at":   None,
            "show_customer":   book.get("show_customer", True),
            "show_supplier":   book.get("show_supplier", True),
            "show_category":   book.get("show_category", True),
            "show_attachment": book.get("show_attachment", True),
            "share_id":        share["id"],
            "rights":          share["rights"],
            "screens":         share.get("screens", {}),
            "owner_id":        share["owner_id"],
            "owner_name":      owner.get("full_name"),
            "owner_email":     owner.get("email", ""),
        })
    return result


@router.get("", response_model=List[BookResponse])
async def get_books(user_id: str = Depends(get_current_user)):
    sb = get_supabase()
    try:
        result = sb.rpc("get_books_with_summary", {"p_user_id": user_id}).execute()
        return result.data or []
    except Exception:
        # Fallback: direct query if RPC not yet created (migration 002 not run)
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


@router.post("", response_model=BookResponse, status_code=201)
async def create_book(payload: BookCreate, user_id: str = Depends(get_current_user)):
    sb = get_supabase()

    # Resolve caller's tier and role
    profile = (
        sb.table("profiles")
        .select("role, subscription_tier")
        .eq("id", user_id)
        .single()
        .execute()
    ).data or {}

    if profile.get("role") != "superadmin":
        tier  = profile.get("subscription_tier") or "free"
        limit = BOOK_LIMITS.get(tier)          # None = unlimited
        if limit is not None:
            count = (
                sb.table("books")
                .select("id", count="exact")
                .eq("user_id", user_id)
                .execute()
            ).count or 0
            if count >= limit:
                raise HTTPException(
                    status_code=403,
                    detail=f"BOOK_LIMIT_REACHED:{limit}",
                )

    result = sb.table("books").insert({
        "user_id": user_id,
        "name": payload.name.strip(),
        "currency": payload.currency,
    }).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create book")
    book = result.data[0]
    return {**book, "net_balance": book.get("net_balance", 0), "last_entry_at": None}


@router.put("/{book_id}", response_model=BookResponse)
async def update_book(
    book_id: str,
    payload: BookUpdate,
    user_id: str = Depends(get_current_user),
):
    sb = get_supabase()
    update_data = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    check = (
        sb.table("books")
        .select("id")
        .eq("id", book_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    if not check.data:
        raise HTTPException(status_code=404, detail="Book not found")

    sb.table("books").update(update_data).eq("id", book_id).eq("user_id", user_id).execute()

    result = (
        sb.table("books")
        .select("*")
        .eq("id", book_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    book = result.data[0]
    return {**book, "net_balance": book.get("net_balance", 0), "last_entry_at": None}


@router.delete("/{book_id}", status_code=204)
async def delete_book(book_id: str, user_id: str = Depends(get_current_user)):
    sb = get_supabase()
    check = (
        sb.table("books")
        .select("id")
        .eq("id", book_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    if not check.data:
        raise HTTPException(status_code=404, detail="Book not found")
    sb.table("books").delete().eq("id", book_id).eq("user_id", user_id).execute()


@router.patch("/{book_id}/field-settings", response_model=BookResponse)
async def update_field_settings(
    book_id: str,
    payload: FieldSettingsBody,
    user_id: str = Depends(get_current_user),
):
    sb = get_supabase()
    # Resolves to owner_id for both owners and collaborators (raises 404 if no access)
    owner_id = get_book_owner_id(sb, book_id, user_id)

    # Collaborators need at least view_create_edit rights to change field settings
    if owner_id != user_id:
        share = (
            sb.table("book_shares")
            .select("rights")
            .eq("book_id", book_id)
            .eq("shared_with_id", user_id)
            .limit(1)
            .execute()
        )
        if not share.data or share.data[0]["rights"] == "view":
            raise HTTPException(status_code=403, detail="Edit access required to change field settings")

    sb.table("books").update({
        "show_customer":   payload.showCustomer,
        "show_supplier":   payload.showSupplier,
        "show_category":   payload.showCategory,
        "show_attachment": payload.showAttachment,
    }).eq("id", book_id).eq("user_id", owner_id).execute()

    result = (
        sb.table("books")
        .select("*")
        .eq("id", book_id)
        .eq("user_id", owner_id)
        .limit(1)
        .execute()
    )
    book = result.data[0]
    return {**book, "net_balance": book.get("net_balance", 0), "last_entry_at": None}
