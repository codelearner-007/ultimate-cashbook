from pydantic import BaseModel
from typing import Optional, List


class ContactCreate(BaseModel):
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None


class ContactUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None


class ContactResponse(BaseModel):
    id: str
    book_id: str
    user_id: str
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    display_order: int = 0
    total_in: float = 0.0
    total_out: float = 0.0
    net_balance: float = 0.0
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class ContactReorder(BaseModel):
    ordered_ids: List[str]


# Kept for backwards compatibility — balance field mirrors net_balance
class ContactWithBalance(ContactResponse):
    balance: float = 0.0
    display_order: int = 0
