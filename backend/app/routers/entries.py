from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List, Optional
from app.auth.jwt import get_current_user
from app.db.supabase import get_supabase
from app.models.entry import EntryCreate, EntryUpdate, EntryResponse, BookSummary
from app.utils.book_access import get_book_owner_id, get_book_access, require_rights

router = APIRouter()


def _resolve_attachment_urls(sb, entries: list) -> list:
    """Replace any stale signed URL with the permanent public URL using attachment_path."""
    result = []
    for entry in entries:
        path = entry.get("attachment_path")
        if path:
            try:
                public_url = sb.storage.from_("attachments").get_public_url(path)
                if isinstance(public_url, dict):
                    public_url = public_url.get("publicURL") or public_url.get("publicUrl", "")
                if public_url:
                    entry = {**entry, "attachment_url": public_url}
            except Exception:
                pass
        result.append(entry)
    return result


@router.get("/{book_id}/entries", response_model=List[EntryResponse])
async def get_entries(
    book_id: str,
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    type: Optional[str] = Query(None),
    user_id: str = Depends(get_current_user),
):
    sb = get_supabase()
    owner_id = get_book_owner_id(sb, book_id, user_id)

    q = (
        sb.table("entries")
        .select("*")
        .eq("book_id", book_id)
        .eq("user_id", owner_id)
    )
    if date_from:
        q = q.gte("entry_date", date_from)
    if date_to:
        q = q.lte("entry_date", date_to)
    if type in ("in", "out"):
        q = q.eq("type", type)

    result = q.order("entry_date", desc=True).order("entry_time", desc=True).execute()
    return _resolve_attachment_urls(sb, result.data or [])


@router.post("/{book_id}/entries", response_model=EntryResponse, status_code=201)
async def create_entry(
    book_id: str,
    payload: EntryCreate,
    user_id: str = Depends(get_current_user),
):
    sb = get_supabase()
    owner_id, rights = get_book_access(sb, book_id, user_id)
    require_rights(rights, "view_create_edit")

    customer_id = payload.customer_id if not payload.supplier_id else None
    supplier_id = payload.supplier_id if not payload.customer_id else None

    result = sb.table("entries").insert({
        "book_id":              book_id,
        "user_id":              owner_id,
        "type":                 payload.type,
        "amount":               float(payload.amount),
        "remark":               payload.remark,
        "category":             payload.category,
        "category_id":          payload.category_id,
        "payment_mode":         payload.payment_mode,
        "payment_mode_id":      payload.payment_mode_id,
        "contact_name":         payload.contact_name,
        "customer_id":          customer_id,
        "supplier_id":          supplier_id,
        "attachment_url":       payload.attachment_url,
        "attachment_path":      payload.attachment_path,
        "attachment_provider":  payload.attachment_provider,
        "entry_date":           payload.entry_date,
        "entry_time":           payload.entry_time,
    }).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create entry")
    return result.data[0]


@router.put("/{book_id}/entries/{entry_id}", response_model=EntryResponse)
async def update_entry(
    book_id: str,
    entry_id: str,
    payload: EntryUpdate,
    user_id: str = Depends(get_current_user),
):
    sb = get_supabase()
    owner_id, rights = get_book_access(sb, book_id, user_id)
    require_rights(rights, "view_create_edit")

    update_data = {k: v for k, v in payload.model_dump(exclude_unset=True).items()}
    if "amount" in update_data and update_data["amount"] is not None:
        update_data["amount"] = float(update_data["amount"])

    if update_data.get("customer_id"):
        update_data["supplier_id"] = None
    elif update_data.get("supplier_id"):
        update_data["customer_id"] = None

    existing = (
        sb.table("entries")
        .select("id, attachment_path, attachment_provider")
        .eq("id", entry_id)
        .eq("book_id", book_id)
        .eq("user_id", owner_id)
        .limit(1)
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Entry not found")

    old_path = existing.data[0].get("attachment_path")
    old_provider = existing.data[0].get("attachment_provider", "supabase")

    sb.table("entries").update(update_data).eq("id", entry_id).eq("book_id", book_id).eq("user_id", owner_id).execute()

    # Delete old storage file when attachment was replaced or cleared
    new_path = update_data.get("attachment_path", old_path)
    if old_path and old_path != new_path and old_provider == "supabase":
        try:
            sb.storage.from_("attachments").remove([old_path])
        except Exception:
            pass

    result = (
        sb.table("entries")
        .select("*")
        .eq("id", entry_id)
        .eq("user_id", owner_id)
        .limit(1)
        .execute()
    )
    return result.data[0]


@router.delete("/{book_id}/entries", status_code=204)
async def delete_all_entries(
    book_id: str,
    user_id: str = Depends(get_current_user),
):
    sb = get_supabase()
    owner_id, rights = get_book_access(sb, book_id, user_id)
    require_rights(rights, "view_create_edit_delete")

    # Collect Supabase attachment paths before deleting rows
    paths_res = (
        sb.table("entries")
        .select("attachment_path, attachment_provider")
        .eq("book_id", book_id)
        .eq("user_id", owner_id)
        .not_.is_("attachment_path", "null")
        .execute()
    )
    supabase_paths = [
        r["attachment_path"] for r in (paths_res.data or [])
        if r.get("attachment_provider", "supabase") == "supabase"
    ]

    sb.table("entries").delete().eq("book_id", book_id).eq("user_id", owner_id).execute()

    if supabase_paths:
        try:
            sb.storage.from_("attachments").remove(supabase_paths)
        except Exception:
            pass


@router.delete("/{book_id}/entries/{entry_id}", status_code=204)
async def delete_entry(
    book_id: str,
    entry_id: str,
    user_id: str = Depends(get_current_user),
):
    sb = get_supabase()
    owner_id, rights = get_book_access(sb, book_id, user_id)
    require_rights(rights, "view_create_edit_delete")

    existing = (
        sb.table("entries")
        .select("id, attachment_path, attachment_provider")
        .eq("id", entry_id)
        .eq("book_id", book_id)
        .eq("user_id", owner_id)
        .limit(1)
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Entry not found")

    attachment_path = existing.data[0].get("attachment_path")
    attachment_provider = existing.data[0].get("attachment_provider", "supabase")

    sb.table("entries").delete().eq("id", entry_id).eq("book_id", book_id).eq("user_id", owner_id).execute()

    if attachment_path and attachment_provider == "supabase":
        try:
            sb.storage.from_("attachments").remove([attachment_path])
        except Exception:
            pass


@router.get("/{book_id}/summary", response_model=BookSummary)
async def get_summary(book_id: str, user_id: str = Depends(get_current_user)):
    sb = get_supabase()
    owner_id = get_book_owner_id(sb, book_id, user_id)
    try:
        result = sb.rpc("get_book_summary", {"p_book_id": book_id, "p_user_id": owner_id}).execute()
        row = result.data[0] if result.data else {}
    except Exception:
        result = (
            sb.table("entries")
            .select("type, amount")
            .eq("book_id", book_id)
            .eq("user_id", owner_id)
            .execute()
        )
        rows = result.data or []
        total_in  = sum(r["amount"] for r in rows if r["type"] == "in")
        total_out = sum(r["amount"] for r in rows if r["type"] == "out")
        row = {"total_in": total_in, "total_out": total_out, "net_balance": total_in - total_out}
    return {
        "total_in":    float(row.get("total_in", 0)),
        "total_out":   float(row.get("total_out", 0)),
        "net_balance": float(row.get("net_balance", 0)),
    }
