from typing import List, Optional
from pydantic import BaseModel


class ReportEntry(BaseModel):
    type: str
    amount: float
    remark: Optional[str] = None
    category: Optional[str] = None
    payment_mode: Optional[str] = None
    contact_name: Optional[str] = None
    entry_date: Optional[str] = None
    entry_time: Optional[str] = None


class ReportFilters(BaseModel):
    entry_type: Optional[str] = None
    contact_name: Optional[str] = None
    contact_type: Optional[str] = None
    category: Optional[str] = None
    payment_mode: Optional[str] = None


class ReportRequest(BaseModel):
    book_name: str
    currency: str = "PKR"
    date_from: Optional[str] = None
    date_to: Optional[str] = None
    filters: Optional[ReportFilters] = None
    entries: List[ReportEntry] = []
