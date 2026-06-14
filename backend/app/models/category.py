from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List


class CategoryCreate(BaseModel):
    id: Optional[str] = None  # client-supplied shared UUID; Postgres generates one when absent
    name: str


class CategoryUpdate(BaseModel):
    name: Optional[str] = None


class CategoryReorder(BaseModel):
    ordered_ids: List[str]


class CategoryResponse(BaseModel):
    id: str
    book_id: str
    user_id: str
    name: str
    display_order: int = 0
    total_in: float
    total_out: float
    net_balance: float
    created_at: datetime
