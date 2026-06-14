from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class BookCreate(BaseModel):
    id: Optional[str] = None  # client-supplied shared UUID; Postgres generates one when absent
    name: str
    currency: str = "PKR"


class BookUpdate(BaseModel):
    name: Optional[str] = None
    currency: Optional[str] = None


class FieldSettingsBody(BaseModel):
    showCustomer: bool = True
    showSupplier: bool = True
    showCategory: bool = True
    showAttachment: bool = True


class BookResponse(BaseModel):
    id: str
    user_id: str
    name: str
    currency: str
    net_balance: float = 0.0
    show_customer: bool = True
    show_supplier: bool = True
    show_category: bool = True
    show_attachment: bool = True
    created_at: datetime
    updated_at: Optional[datetime] = None
    last_entry_at: Optional[str] = None
