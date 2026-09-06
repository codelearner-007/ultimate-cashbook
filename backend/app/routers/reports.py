from fastapi import APIRouter, Depends
from fastapi.responses import Response
from app.auth.jwt import get_current_user
from app.models.report import ReportRequest
from app.utils.pdf import generate_pdf
from app.utils.excel import generate_excel
from app.utils.rate_limit import InMemoryRateLimiter

router = APIRouter()

# Report rendering (PDF/Excel) is CPU/memory-heavy; cap how often one user can trigger it.
_report_rate_limiter = InMemoryRateLimiter(max_calls=10, window_seconds=60)


def _summary(entries):
    total_in = sum(e.amount for e in entries if e.type == "in")
    total_out = sum(e.amount for e in entries if e.type == "out")
    return {"total_in": total_in, "total_out": total_out, "net_balance": total_in - total_out}


@router.post("/{book_id}/report/pdf")
async def pdf_report(
    book_id: str,
    body: ReportRequest,
    user_id: str = Depends(get_current_user),
):
    _report_rate_limiter.check(user_id)
    entries = [e.model_dump() for e in body.entries]
    summary = _summary(body.entries)
    active_filters = body.filters.model_dump() if body.filters else {}

    pdf_bytes = generate_pdf(body.book_name, body.currency, entries, summary,
                             body.date_from, body.date_to, filters=active_filters,
                             contact_type=active_filters.get("contact_type"))
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=cashbook-report.pdf"},
    )


@router.post("/{book_id}/report/excel")
async def excel_report(
    book_id: str,
    body: ReportRequest,
    user_id: str = Depends(get_current_user),
):
    _report_rate_limiter.check(user_id)
    entries = [e.model_dump() for e in body.entries]
    summary = _summary(body.entries)
    active_filters = body.filters.model_dump() if body.filters else {}

    excel_bytes = generate_excel(body.book_name, body.currency, entries, summary,
                                 body.date_from, body.date_to, filters=active_filters,
                                 contact_type=active_filters.get("contact_type"))
    return Response(
        content=excel_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=cashbook-report.xlsx"},
    )
