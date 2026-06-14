from fastapi import APIRouter, Depends, HTTPException
from typing import List
from datetime import datetime, timezone
from app.auth.jwt import get_current_user
from app.db.supabase import get_supabase
from app.models.contact import ContactCreate, ContactUpdate, ContactResponse, ContactWithBalance, ContactReorder
from app.models.entry import EntryResponse
from app.utils.book_access import get_book_owner_id, get_book_access, require_rights
from app.utils.reorder import apply_display_order

router = APIRouter()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _with_balance(row: dict) -> dict:
    return {**row, "balance": float(row.get("net_balance", 0))}


# ── Shared contact logic (parametrized by table + entity_id column + label) ─────
# `table` is "customers" or "suppliers"; `entry_fk` is the entries column that
# links to this contact type; `label` is the human-readable name for 404 messages.

def _list_contacts(sb, table: str, book_id: str, user_id: str) -> list:
    owner_id = get_book_owner_id(sb, book_id, user_id)
    rows = sb.table(table).select("*").eq("book_id", book_id).eq("user_id", owner_id).is_("deleted_at", "null").order("display_order").order("name").execute().data or []
    return [_with_balance(r) for r in rows]


def _create_contact(sb, table: str, label: str, book_id: str, payload: ContactCreate, user_id: str) -> dict:
    owner_id, rights = get_book_access(sb, book_id, user_id)
    require_rights(rights, "view_create_edit")
    insert_data = {
        "book_id": book_id, "user_id": owner_id,
        "name": payload.name, "phone": payload.phone,
        "email": payload.email, "address": payload.address,
    }
    # Trust the client-supplied shared UUID when present (else Postgres default).
    if payload.id:
        insert_data["id"] = payload.id
    result = sb.table(table).insert(insert_data).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail=f"Failed to create {label}")
    return result.data[0]


def _get_contact(sb, table: str, label: str, book_id: str, contact_id: str, user_id: str) -> dict:
    owner_id = get_book_owner_id(sb, book_id, user_id)
    result = sb.table(table).select("*").eq("id", contact_id).eq("book_id", book_id).eq("user_id", owner_id).is_("deleted_at", "null").limit(1).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail=f"{label} not found")
    return _with_balance(result.data[0])


def _update_contact(sb, table: str, label: str, book_id: str, contact_id: str, payload: ContactUpdate, user_id: str) -> dict:
    owner_id, rights = get_book_access(sb, book_id, user_id)
    require_rights(rights, "view_create_edit")
    if not sb.table(table).select("id").eq("id", contact_id).eq("book_id", book_id).eq("user_id", owner_id).is_("deleted_at", "null").limit(1).execute().data:
        raise HTTPException(status_code=404, detail=f"{label} not found")
    update_data = {k: v for k, v in payload.model_dump(exclude_unset=True).items()}
    if update_data:
        sb.table(table).update(update_data).eq("id", contact_id).eq("user_id", owner_id).execute()
    return sb.table(table).select("*").eq("id", contact_id).eq("book_id", book_id).eq("user_id", owner_id).limit(1).execute().data[0]


def _delete_contact(sb, table: str, label: str, book_id: str, contact_id: str, user_id: str) -> None:
    owner_id, rights = get_book_access(sb, book_id, user_id)
    require_rights(rights, "view_create_edit_delete")
    if not sb.table(table).select("id").eq("id", contact_id).eq("book_id", book_id).eq("user_id", owner_id).is_("deleted_at", "null").limit(1).execute().data:
        raise HTTPException(status_code=404, detail=f"{label} not found")
    # Soft delete: hidden from lists; surfaced by the delta endpoint as a tombstone.
    sb.table(table).update({"deleted_at": _now_iso()}).eq("id", contact_id).eq("book_id", book_id).eq("user_id", owner_id).execute()


def _get_contact_entries(sb, table: str, label: str, entry_fk: str, book_id: str, contact_id: str, user_id: str) -> list:
    owner_id = get_book_owner_id(sb, book_id, user_id)
    if not sb.table(table).select("id").eq("id", contact_id).eq("book_id", book_id).eq("user_id", owner_id).is_("deleted_at", "null").limit(1).execute().data:
        raise HTTPException(status_code=404, detail=f"{label} not found")
    return sb.table("entries").select("*").eq(entry_fk, contact_id).eq("book_id", book_id).eq("user_id", owner_id).is_("deleted_at", "null").order("entry_date", desc=True).order("entry_time", desc=True).execute().data or []


def _reorder_contacts(sb, table: str, book_id: str, payload: ContactReorder, user_id: str) -> None:
    owner_id, rights = get_book_access(sb, book_id, user_id)
    require_rights(rights, "view_create_edit")
    apply_display_order(sb, table, book_id, owner_id, payload.ordered_ids)


# ── Customers ─────────────────────────────────────────────────────────────────

@router.get("/{book_id}/customers", response_model=List[ContactWithBalance])
async def get_customers(book_id: str, user_id: str = Depends(get_current_user)):
    return _list_contacts(get_supabase(), "customers", book_id, user_id)


@router.post("/{book_id}/customers", response_model=ContactResponse, status_code=201)
async def create_customer(book_id: str, payload: ContactCreate, user_id: str = Depends(get_current_user)):
    return _create_contact(get_supabase(), "customers", "customer", book_id, payload, user_id)


@router.get("/{book_id}/customers/{contact_id}", response_model=ContactWithBalance)
async def get_customer(book_id: str, contact_id: str, user_id: str = Depends(get_current_user)):
    return _get_contact(get_supabase(), "customers", "Customer", book_id, contact_id, user_id)


@router.put("/{book_id}/customers/{contact_id}", response_model=ContactResponse)
async def update_customer(book_id: str, contact_id: str, payload: ContactUpdate, user_id: str = Depends(get_current_user)):
    return _update_contact(get_supabase(), "customers", "Customer", book_id, contact_id, payload, user_id)


@router.delete("/{book_id}/customers/{contact_id}", status_code=204)
async def delete_customer(book_id: str, contact_id: str, user_id: str = Depends(get_current_user)):
    _delete_contact(get_supabase(), "customers", "Customer", book_id, contact_id, user_id)


@router.get("/{book_id}/customers/{contact_id}/entries", response_model=List[EntryResponse])
async def get_customer_entries(book_id: str, contact_id: str, user_id: str = Depends(get_current_user)):
    return _get_contact_entries(get_supabase(), "customers", "Customer", "customer_id", book_id, contact_id, user_id)


@router.patch("/{book_id}/customers/reorder", status_code=204)
async def reorder_customers(book_id: str, payload: ContactReorder, user_id: str = Depends(get_current_user)):
    _reorder_contacts(get_supabase(), "customers", book_id, payload, user_id)


# ── Suppliers ─────────────────────────────────────────────────────────────────

@router.get("/{book_id}/suppliers", response_model=List[ContactWithBalance])
async def get_suppliers(book_id: str, user_id: str = Depends(get_current_user)):
    return _list_contacts(get_supabase(), "suppliers", book_id, user_id)


@router.post("/{book_id}/suppliers", response_model=ContactResponse, status_code=201)
async def create_supplier(book_id: str, payload: ContactCreate, user_id: str = Depends(get_current_user)):
    return _create_contact(get_supabase(), "suppliers", "supplier", book_id, payload, user_id)


@router.get("/{book_id}/suppliers/{contact_id}", response_model=ContactWithBalance)
async def get_supplier(book_id: str, contact_id: str, user_id: str = Depends(get_current_user)):
    return _get_contact(get_supabase(), "suppliers", "Supplier", book_id, contact_id, user_id)


@router.put("/{book_id}/suppliers/{contact_id}", response_model=ContactResponse)
async def update_supplier(book_id: str, contact_id: str, payload: ContactUpdate, user_id: str = Depends(get_current_user)):
    return _update_contact(get_supabase(), "suppliers", "Supplier", book_id, contact_id, payload, user_id)


@router.delete("/{book_id}/suppliers/{contact_id}", status_code=204)
async def delete_supplier(book_id: str, contact_id: str, user_id: str = Depends(get_current_user)):
    _delete_contact(get_supabase(), "suppliers", "Supplier", book_id, contact_id, user_id)


@router.get("/{book_id}/suppliers/{contact_id}/entries", response_model=List[EntryResponse])
async def get_supplier_entries(book_id: str, contact_id: str, user_id: str = Depends(get_current_user)):
    return _get_contact_entries(get_supabase(), "suppliers", "Supplier", "supplier_id", book_id, contact_id, user_id)


@router.patch("/{book_id}/suppliers/reorder", status_code=204)
async def reorder_suppliers(book_id: str, payload: ContactReorder, user_id: str = Depends(get_current_user)):
    _reorder_contacts(get_supabase(), "suppliers", book_id, payload, user_id)
