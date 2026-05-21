from pydantic import BaseModel
from datetime import datetime
from typing import Optional, Literal


class ProfileResponse(BaseModel):
    id: str
    email: str
    full_name: Optional[str] = None
    phone: Optional[str] = None
    avatar_url: Optional[str] = None
    role: Literal["superadmin", "user"] = "user"
    currency: str = "PKR"
    is_dark_mode: bool = False
    subscription_tier: Literal["free", "pro", "business"] = "free"
    subscription_started_at: Optional[datetime] = None
    subscription_billing_cycle: Literal["monthly", "yearly"] = "monthly"
    created_at: datetime
    updated_at: Optional[datetime] = None
    storage_mb: float = 0.0


class ProfileUpdate(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    avatar_url: Optional[str] = None
    currency: Optional[str] = None
    is_dark_mode: Optional[bool] = None


class UserWithStats(ProfileResponse):
    book_count: int = 0
    entry_count: int = 0
    storage_mb: float = 0.0
    shared_books_count: int = 0  # accepted book_shares where this user is the owner


class SubscriptionUpdate(BaseModel):
    subscription_tier: Literal["free", "pro", "business"]
    billing_cycle: Literal["monthly", "yearly"] = "monthly"


