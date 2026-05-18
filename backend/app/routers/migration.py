from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from app.auth.jwt import get_current_user
from app.db.supabase import get_supabase

router = APIRouter()


class LocalEntry(BaseModel):
    id: str
    book_id: str
    type: str
    amount: float
    remark: Optional[str] = None
    category: Optional[str] = None
    payment_mode: str = 'cash'
    contact_name: Optional[str] = None
    entry_date: str
    entry_time: str = '00:00'
    created_at: str


class LocalBook(BaseModel):
    id: str
    name: str
    currency: str = 'PKR'
    created_at: str


class LocalCategory(BaseModel):
    id: str
    book_id: str
    name: str
    created_at: str


class LocalContact(BaseModel):
    id: str
    book_id: str
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    created_at: str


class MigrateOfflinePayload(BaseModel):
    books: List[LocalBook] = []
    entries: List[LocalEntry] = []
    categories: List[LocalCategory] = []
    customers: List[LocalContact] = []
    suppliers: List[LocalContact] = []


class MigrateOfflineResponse(BaseModel):
    books_created: int
    entries_created: int
    categories_created: int
    customers_created: int
    suppliers_created: int


@router.post("", response_model=MigrateOfflineResponse)
async def migrate_offline(
    payload: MigrateOfflinePayload,
    user_id: str = Depends(get_current_user),
):
    """
    Upload all local SQLite data to Supabase when a free user upgrades.
    Called once after subscription purchase. IDs are preserved so the
    frontend can switch to cloud mode without re-fetching.
    """
    sb = get_supabase()

    def bulk_insert(table: str, rows: list) -> int:
        if not rows:
            return 0
        try:
            result = sb.table(table).upsert(rows, on_conflict="id").execute()
            return len(result.data or [])
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to insert into {table}: {str(e)}")

    books_data = [
        {"id": b.id, "user_id": user_id, "name": b.name,
         "currency": b.currency, "created_at": b.created_at}
        for b in payload.books
    ]

    entries_data = [
        {"id": e.id, "book_id": e.book_id, "user_id": user_id,
         "type": e.type, "amount": e.amount, "remark": e.remark,
         "category": e.category, "payment_mode": e.payment_mode,
         "contact_name": e.contact_name, "entry_date": e.entry_date,
         "entry_time": e.entry_time, "created_at": e.created_at}
        for e in payload.entries
    ]

    categories_data = [
        {"id": c.id, "book_id": c.book_id, "user_id": user_id,
         "name": c.name, "created_at": c.created_at}
        for c in payload.categories
    ]

    customers_data = [
        {"id": c.id, "book_id": c.book_id, "user_id": user_id,
         "name": c.name, "phone": c.phone, "email": c.email,
         "address": c.address, "created_at": c.created_at}
        for c in payload.customers
    ]

    suppliers_data = [
        {"id": s.id, "book_id": s.book_id, "user_id": user_id,
         "name": s.name, "phone": s.phone, "email": s.email,
         "address": s.address, "created_at": s.created_at}
        for s in payload.suppliers
    ]

    return MigrateOfflineResponse(
        books_created=bulk_insert("books", books_data),
        entries_created=bulk_insert("entries", entries_data),
        categories_created=bulk_insert("categories", categories_data),
        customers_created=bulk_insert("customers", customers_data),
        suppliers_created=bulk_insert("suppliers", suppliers_data),
    )
