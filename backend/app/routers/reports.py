from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from typing import Optional
from decimal import Decimal, ROUND_HALF_UP
from app.auth.jwt import get_current_user
from app.db.supabase import get_supabase
from app.utils.pdf import generate_pdf
from app.utils.excel import generate_excel
from app.utils.book_access import get_book_owner_id
from app.utils.plans import require_feature

router = APIRouter()


def _fetch_entries(sb, book_id: str, owner_id: str, date_from: str, date_to: str,
                   entry_type=None, contact_name=None, category=None, payment_mode=None):
    q = (
        sb.table("entries")
        .select("*")
        .eq("book_id", book_id)
        .eq("user_id", owner_id)
        .is_("deleted_at", "null")
    )
    if date_from:     q = q.gte("entry_date", date_from)
    if date_to:       q = q.lte("entry_date", date_to)
    if entry_type:    q = q.eq("type", entry_type)
    if contact_name:  q = q.eq("contact_name", contact_name)
    if category:      q = q.eq("category", category)
    if payment_mode:  q = q.eq("payment_mode", payment_mode)
    return q.order("entry_date").order("entry_time").execute().data or []


_CENT = Decimal("0.01")


def _compute_summary(entries: list) -> dict:
    """Accumulate totals with Decimal precision (no float rounding drift),
    quantize to 2 dp, and return floats only at the response boundary."""
    total_in  = Decimal("0")
    total_out = Decimal("0")
    for e in entries:
        amt = Decimal(str(e["amount"]))
        if e["type"] == "in":
            total_in += amt
        else:
            total_out += amt
    total_in  = total_in.quantize(_CENT, rounding=ROUND_HALF_UP)
    total_out = total_out.quantize(_CENT, rounding=ROUND_HALF_UP)
    net       = (total_in - total_out).quantize(_CENT, rounding=ROUND_HALF_UP)
    return {
        "total_in":    float(total_in),
        "total_out":   float(total_out),
        "net_balance": float(net),
    }


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
    # PDF/Excel export is a paid feature (export_reports).
    require_feature(sb, user_id, "export_reports")
    owner_id = get_book_owner_id(sb, book_id, user_id)

    book_res = sb.table("books").select("name, currency").eq("id", book_id).eq("user_id", owner_id).single().execute()
    if not book_res.data:
        raise HTTPException(status_code=404, detail="Book not found")

    entries = _fetch_entries(sb, book_id, owner_id, date_from, date_to,
                             entry_type, contact_name, category, payment_mode)
    summary = _compute_summary(entries)
    active_filters = {
        "entry_type": entry_type, "contact_name": contact_name,
        "category": category, "payment_mode": payment_mode,
    }

    pdf_bytes = generate_pdf(book_res.data["name"], book_res.data["currency"], entries, summary,
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
    # PDF/Excel export is a paid feature (export_reports).
    require_feature(sb, user_id, "export_reports")
    owner_id = get_book_owner_id(sb, book_id, user_id)

    book_res = sb.table("books").select("name, currency").eq("id", book_id).eq("user_id", owner_id).single().execute()
    if not book_res.data:
        raise HTTPException(status_code=404, detail="Book not found")

    entries = _fetch_entries(sb, book_id, owner_id, date_from, date_to,
                             entry_type, contact_name, category, payment_mode)
    summary = _compute_summary(entries)
    active_filters = {
        "entry_type": entry_type, "contact_name": contact_name,
        "category": category, "payment_mode": payment_mode,
    }

    excel_bytes = generate_excel(book_res.data["name"], book_res.data["currency"], entries, summary,
                                 date_from, date_to, filters=active_filters, contact_type=contact_type)
    return Response(
        content=excel_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=cashbook-report.xlsx"},
    )
