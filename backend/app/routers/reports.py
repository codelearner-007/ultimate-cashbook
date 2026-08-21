from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from typing import Optional
from app.auth.jwt import get_current_user
from app.db.supabase import get_supabase
from app.utils.pdf import generate_pdf
from app.utils.excel import generate_excel
from app.utils.book_access import get_book_owner_id_with_row

router = APIRouter()


def _fetch_entries(sb, book_id: str, owner_id: str, date_from: str, date_to: str, filters: dict):
    q = (
        sb.table("entries")
        .select("*")
        .eq("book_id", book_id)
        .eq("user_id", owner_id)
    )
    if date_from:               q = q.gte("entry_date", date_from)
    if date_to:                 q = q.lte("entry_date", date_to)
    if filters.get("entry_type"):   q = q.eq("type", filters["entry_type"])
    if filters.get("contact_name"):
        q = q.eq("contact_name", filters["contact_name"])
        if filters.get("contact_type") == "customer":
            q = q.not_.is_("customer_id", "null")
        elif filters.get("contact_type") == "supplier":
            q = q.not_.is_("supplier_id", "null")
    if filters.get("category"):     q = q.eq("category", filters["category"])
    if filters.get("payment_mode"): q = q.eq("payment_mode", filters["payment_mode"])
    return q.order("entry_date").order("entry_time").execute().data or []


@router.get("/{book_id}/report/pdf")
async def pdf_report(
    book_id: str,
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    entry_type: Optional[str] = Query(None),
    contact_name: Optional[str] = Query(None),
    contact_type: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    payment_mode: Optional[str] = Query(None),
    user_id: str = Depends(get_current_user),
):
    sb = get_supabase()
    owner_id, book = get_book_owner_id_with_row(sb, book_id, user_id, select="name, currency")

    active_filters = {
        "entry_type": entry_type, "contact_name": contact_name, "contact_type": contact_type,
        "category": category, "payment_mode": payment_mode,
    }
    entries = _fetch_entries(sb, book_id, owner_id, date_from, date_to, active_filters)
    total_in  = sum(float(e["amount"]) for e in entries if e["type"] == "in")
    total_out = sum(float(e["amount"]) for e in entries if e["type"] == "out")
    summary = {"total_in": total_in, "total_out": total_out, "net_balance": total_in - total_out}

    pdf_bytes = generate_pdf(book["name"], book["currency"], entries, summary,
                             date_from, date_to, filters=active_filters, contact_type=contact_type)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=cashbook-report.pdf"},
    )


@router.get("/{book_id}/report/excel")
async def excel_report(
    book_id: str,
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    entry_type: Optional[str] = Query(None),
    contact_name: Optional[str] = Query(None),
    contact_type: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    payment_mode: Optional[str] = Query(None),
    user_id: str = Depends(get_current_user),
):
    sb = get_supabase()
    owner_id, book = get_book_owner_id_with_row(sb, book_id, user_id, select="name, currency")

    active_filters = {
        "entry_type": entry_type, "contact_name": contact_name, "contact_type": contact_type,
        "category": category, "payment_mode": payment_mode,
    }
    entries = _fetch_entries(sb, book_id, owner_id, date_from, date_to, active_filters)
    total_in  = sum(float(e["amount"]) for e in entries if e["type"] == "in")
    total_out = sum(float(e["amount"]) for e in entries if e["type"] == "out")
    summary = {"total_in": total_in, "total_out": total_out, "net_balance": total_in - total_out}

    excel_bytes = generate_excel(book["name"], book["currency"], entries, summary,
                                 date_from, date_to, filters=active_filters, contact_type=contact_type)
    return Response(
        content=excel_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=cashbook-report.xlsx"},
    )
