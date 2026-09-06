from typing import List, Optional
from pydantic import BaseModel, Field

# Hard caps so one request can't be used to force an oversized PDF/Excel render
# (see backend/CLAUDE.md — Reports section for why these endpoints are stateless).
MAX_REPORT_ENTRIES = 5000


class ReportEntry(BaseModel):
    type: str = Field(max_length=20)
    amount: float
    remark: Optional[str] = Field(default=None, max_length=500)
    category: Optional[str] = Field(default=None, max_length=100)
    payment_mode: Optional[str] = Field(default=None, max_length=50)
    contact_name: Optional[str] = Field(default=None, max_length=100)
    entry_date: Optional[str] = Field(default=None, max_length=20)
    entry_time: Optional[str] = Field(default=None, max_length=20)


class ReportFilters(BaseModel):
    entry_type: Optional[str] = Field(default=None, max_length=120)
    contact_name: Optional[str] = Field(default=None, max_length=120)
    contact_type: Optional[str] = Field(default=None, max_length=120)
    category: Optional[str] = Field(default=None, max_length=120)
    payment_mode: Optional[str] = Field(default=None, max_length=120)


class ReportRequest(BaseModel):
    book_name: str = Field(max_length=200)
    currency: str = Field(default="PKR", max_length=10)
    date_from: Optional[str] = Field(default=None, max_length=20)
    date_to: Optional[str] = Field(default=None, max_length=20)
    filters: Optional[ReportFilters] = None
    entries: List[ReportEntry] = Field(default=[], max_length=MAX_REPORT_ENTRIES)
