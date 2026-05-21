from fastapi import APIRouter, Depends, HTTPException
from typing import List
from app.auth.jwt import get_current_user
from app.db.supabase import get_supabase
from app.models.contact import ContactCreate, ContactUpdate, ContactResponse, ContactWithBalance, ContactReorder
from app.models.entry import EntryResponse
from app.utils.book_access import get_book_owner_id

router = APIRouter()


def _with_balance(row: dict) -> dict:
    return {**row, "balance": float(row.get("net_balance", 0))}


# ── Customers ─────────────────────────────────────────────────────────────────

@router.get("/{book_id}/customers", response_model=List[ContactWithBalance])
async def get_customers(book_id: str, user_id: str = Depends(get_current_user)):
    sb = get_supabase()
    owner_id = get_book_owner_id(sb, book_id, user_id)
    rows = sb.table("customers").select("*").eq("book_id", book_id).eq("user_id", owner_id).order("display_order").order("name").execute().data or []
    return [_with_balance(r) for r in rows]


@router.post("/{book_id}/customers", response_model=ContactResponse, status_code=201)
async def create_customer(book_id: str, payload: ContactCreate, user_id: str = Depends(get_current_user)):
    sb = get_supabase()
    owner_id = get_book_owner_id(sb, book_id, user_id)
    result = sb.table("customers").insert({
        "book_id": book_id, "user_id": owner_id,
        "name": payload.name, "phone": payload.phone,
        "email": payload.email, "address": payload.address,
    }).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create customer")
    return result.data[0]


@router.get("/{book_id}/customers/{contact_id}", response_model=ContactWithBalance)
async def get_customer(book_id: str, contact_id: str, user_id: str = Depends(get_current_user)):
    sb = get_supabase()
    owner_id = get_book_owner_id(sb, book_id, user_id)
    result = sb.table("customers").select("*").eq("id", contact_id).eq("book_id", book_id).eq("user_id", owner_id).limit(1).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Customer not found")
    return _with_balance(result.data[0])


@router.put("/{book_id}/customers/{contact_id}", response_model=ContactResponse)
async def update_customer(book_id: str, contact_id: str, payload: ContactUpdate, user_id: str = Depends(get_current_user)):
    sb = get_supabase()
    owner_id = get_book_owner_id(sb, book_id, user_id)
    if not sb.table("customers").select("id").eq("id", contact_id).eq("book_id", book_id).eq("user_id", owner_id).limit(1).execute().data:
        raise HTTPException(status_code=404, detail="Customer not found")
    update_data = {k: v for k, v in payload.model_dump(exclude_unset=True).items()}
    if update_data:
        sb.table("customers").update(update_data).eq("id", contact_id).eq("user_id", owner_id).execute()
    return sb.table("customers").select("*").eq("id", contact_id).eq("book_id", book_id).eq("user_id", owner_id).limit(1).execute().data[0]


@router.delete("/{book_id}/customers/{contact_id}", status_code=204)
async def delete_customer(book_id: str, contact_id: str, user_id: str = Depends(get_current_user)):
    sb = get_supabase()
    owner_id = get_book_owner_id(sb, book_id, user_id)
    if not sb.table("customers").select("id").eq("id", contact_id).eq("book_id", book_id).eq("user_id", owner_id).limit(1).execute().data:
        raise HTTPException(status_code=404, detail="Customer not found")
    sb.table("customers").delete().eq("id", contact_id).eq("book_id", book_id).eq("user_id", owner_id).execute()


@router.get("/{book_id}/customers/{contact_id}/entries", response_model=List[EntryResponse])
async def get_customer_entries(book_id: str, contact_id: str, user_id: str = Depends(get_current_user)):
    sb = get_supabase()
    owner_id = get_book_owner_id(sb, book_id, user_id)
    if not sb.table("customers").select("id").eq("id", contact_id).eq("book_id", book_id).eq("user_id", owner_id).limit(1).execute().data:
        raise HTTPException(status_code=404, detail="Customer not found")
    return sb.table("entries").select("*").eq("customer_id", contact_id).eq("book_id", book_id).eq("user_id", owner_id).order("entry_date", desc=True).order("entry_time", desc=True).execute().data or []


@router.patch("/{book_id}/customers/reorder", status_code=204)
async def reorder_customers(book_id: str, payload: ContactReorder, user_id: str = Depends(get_current_user)):
    sb = get_supabase()
    owner_id = get_book_owner_id(sb, book_id, user_id)
    for order, contact_id in enumerate(payload.ordered_ids):
        sb.table("customers").update({"display_order": order}) \
          .eq("id", contact_id) \
          .eq("book_id", book_id) \
          .eq("user_id", owner_id) \
          .execute()


# ── Suppliers ─────────────────────────────────────────────────────────────────

@router.get("/{book_id}/suppliers", response_model=List[ContactWithBalance])
async def get_suppliers(book_id: str, user_id: str = Depends(get_current_user)):
    sb = get_supabase()
    owner_id = get_book_owner_id(sb, book_id, user_id)
    rows = sb.table("suppliers").select("*").eq("book_id", book_id).eq("user_id", owner_id).order("display_order").order("name").execute().data or []
    return [_with_balance(r) for r in rows]


@router.post("/{book_id}/suppliers", response_model=ContactResponse, status_code=201)
async def create_supplier(book_id: str, payload: ContactCreate, user_id: str = Depends(get_current_user)):
    sb = get_supabase()
    owner_id = get_book_owner_id(sb, book_id, user_id)
    result = sb.table("suppliers").insert({
        "book_id": book_id, "user_id": owner_id,
        "name": payload.name, "phone": payload.phone,
        "email": payload.email, "address": payload.address,
    }).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create supplier")
    return result.data[0]


@router.get("/{book_id}/suppliers/{contact_id}", response_model=ContactWithBalance)
async def get_supplier(book_id: str, contact_id: str, user_id: str = Depends(get_current_user)):
    sb = get_supabase()
    owner_id = get_book_owner_id(sb, book_id, user_id)
    result = sb.table("suppliers").select("*").eq("id", contact_id).eq("book_id", book_id).eq("user_id", owner_id).limit(1).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Supplier not found")
    return _with_balance(result.data[0])


@router.put("/{book_id}/suppliers/{contact_id}", response_model=ContactResponse)
async def update_supplier(book_id: str, contact_id: str, payload: ContactUpdate, user_id: str = Depends(get_current_user)):
    sb = get_supabase()
    owner_id = get_book_owner_id(sb, book_id, user_id)
    if not sb.table("suppliers").select("id").eq("id", contact_id).eq("book_id", book_id).eq("user_id", owner_id).limit(1).execute().data:
        raise HTTPException(status_code=404, detail="Supplier not found")
    update_data = {k: v for k, v in payload.model_dump(exclude_unset=True).items()}
    if update_data:
        sb.table("suppliers").update(update_data).eq("id", contact_id).eq("user_id", owner_id).execute()
    return sb.table("suppliers").select("*").eq("id", contact_id).eq("book_id", book_id).eq("user_id", owner_id).limit(1).execute().data[0]


@router.delete("/{book_id}/suppliers/{contact_id}", status_code=204)
async def delete_supplier(book_id: str, contact_id: str, user_id: str = Depends(get_current_user)):
    sb = get_supabase()
    owner_id = get_book_owner_id(sb, book_id, user_id)
    if not sb.table("suppliers").select("id").eq("id", contact_id).eq("book_id", book_id).eq("user_id", owner_id).limit(1).execute().data:
        raise HTTPException(status_code=404, detail="Supplier not found")
    sb.table("suppliers").delete().eq("id", contact_id).eq("book_id", book_id).eq("user_id", owner_id).execute()


@router.get("/{book_id}/suppliers/{contact_id}/entries", response_model=List[EntryResponse])
async def get_supplier_entries(book_id: str, contact_id: str, user_id: str = Depends(get_current_user)):
    sb = get_supabase()
    owner_id = get_book_owner_id(sb, book_id, user_id)
    if not sb.table("suppliers").select("id").eq("id", contact_id).eq("book_id", book_id).eq("user_id", owner_id).limit(1).execute().data:
        raise HTTPException(status_code=404, detail="Supplier not found")
    return sb.table("entries").select("*").eq("supplier_id", contact_id).eq("book_id", book_id).eq("user_id", owner_id).order("entry_date", desc=True).order("entry_time", desc=True).execute().data or []


@router.patch("/{book_id}/suppliers/reorder", status_code=204)
async def reorder_suppliers(book_id: str, payload: ContactReorder, user_id: str = Depends(get_current_user)):
    sb = get_supabase()
    owner_id = get_book_owner_id(sb, book_id, user_id)
    for order, contact_id in enumerate(payload.ordered_ids):
        sb.table("suppliers").update({"display_order": order}) \
          .eq("id", contact_id) \
          .eq("book_id", book_id) \
          .eq("user_id", owner_id) \
          .execute()
