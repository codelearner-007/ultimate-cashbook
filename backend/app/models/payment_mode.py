from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class PaymentModeCreate(BaseModel):
    id: Optional[str] = None  # client-supplied shared UUID; Postgres generates one when absent
    name: str


class PaymentModeUpdate(BaseModel):
    name: Optional[str] = None


class PaymentModeReorder(BaseModel):
    ordered_ids: list[str]


class PaymentModeResponse(BaseModel):
    id: str
    book_id: str
    user_id: str
    name: str
    display_order: int = 0
    total_in:    float = 0.0
    total_out:   float = 0.0
    net_balance: float = 0.0
    created_at: datetime
