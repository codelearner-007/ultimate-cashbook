from pydantic import BaseModel, Field, field_validator
from datetime import datetime
from typing import Optional, Literal
from decimal import Decimal


def _validate_entry_date(v: str) -> str:
    """Reject anything that is not a strict, zero-padded YYYY-MM-DD date.
    strptime alone tolerates '2026-1-1'; the round-trip check enforces padding."""
    try:
        parsed = datetime.strptime(v, "%Y-%m-%d")
        if parsed.strftime("%Y-%m-%d") != v:
            raise ValueError
    except (ValueError, TypeError):
        raise ValueError("entry_date must be a valid date in YYYY-MM-DD format")
    return v


def _validate_entry_time(v: str) -> str:
    """Reject anything that is not a strict, zero-padded HH:MM 24-hour time."""
    try:
        parsed = datetime.strptime(v, "%H:%M")
        if parsed.strftime("%H:%M") != v:
            raise ValueError
    except (ValueError, TypeError):
        raise ValueError("entry_time must be a valid time in HH:MM format")
    return v


class EntryCreate(BaseModel):
    id: Optional[str] = None  # client-supplied shared UUID; Postgres generates one when absent
    type: Literal["in", "out"]
    amount: Decimal = Field(gt=0)
    remark: Optional[str] = None
    category: Optional[str] = None
    category_id: Optional[str] = None
    payment_mode: str = "Cash"
    payment_mode_id: Optional[str] = None
    contact_name: Optional[str] = None
    customer_id: Optional[str] = None
    supplier_id: Optional[str] = None
    attachment_url: Optional[str] = None
    attachment_path: Optional[str] = None
    attachment_provider: Optional[str] = None
    entry_date: str   # YYYY-MM-DD
    entry_time: str   # HH:MM

    @field_validator("entry_date")
    @classmethod
    def _check_date(cls, v: str) -> str:
        return _validate_entry_date(v)

    @field_validator("entry_time")
    @classmethod
    def _check_time(cls, v: str) -> str:
        return _validate_entry_time(v)


class EntryUpdate(BaseModel):
    type: Optional[Literal["in", "out"]] = None
    amount: Optional[Decimal] = Field(default=None, gt=0)
    remark: Optional[str] = None
    category: Optional[str] = None
    category_id: Optional[str] = None
    payment_mode: Optional[str] = None
    payment_mode_id: Optional[str] = None
    contact_name: Optional[str] = None
    customer_id: Optional[str] = None
    supplier_id: Optional[str] = None
    attachment_url: Optional[str] = None
    attachment_path: Optional[str] = None
    attachment_provider: Optional[str] = None
    entry_date: Optional[str] = None
    entry_time: Optional[str] = None

    @field_validator("entry_date")
    @classmethod
    def _check_date(cls, v: Optional[str]) -> Optional[str]:
        return _validate_entry_date(v) if v is not None else v

    @field_validator("entry_time")
    @classmethod
    def _check_time(cls, v: Optional[str]) -> Optional[str]:
        return _validate_entry_time(v) if v is not None else v


class EntryResponse(BaseModel):
    id: str
    book_id: str
    user_id: str
    type: str
    amount: float
    remark: Optional[str] = None
    category: Optional[str] = None
    category_id: Optional[str] = None
    payment_mode: str
    payment_mode_id: Optional[str] = None
    contact_name: Optional[str] = None
    customer_id: Optional[str] = None
    supplier_id: Optional[str] = None
    attachment_url: Optional[str] = None
    attachment_path: Optional[str] = None
    attachment_provider: Optional[str] = None
    entry_date: str
    entry_time: str
    created_at: datetime

    @field_validator("entry_time", mode="before")
    @classmethod
    def strip_seconds(cls, v: str) -> str:
        """Normalize HH:MM:SS -> HH:MM (Postgres time columns include seconds)."""
        if v and len(v) == 8:
            return v[:5]
        return v

    @field_validator("entry_date", mode="before")
    @classmethod
    def normalize_date(cls, v) -> str:
        """Accept both date objects and ISO strings."""
        return str(v)[:10]


class BookSummary(BaseModel):
    total_in: float
    total_out: float
    net_balance: float
