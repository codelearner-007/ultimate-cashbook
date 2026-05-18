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
    is_active: bool = True
    currency: str = "PKR"
    is_dark_mode: bool = False
    subscription_tier: Literal["free", "pro", "enterprise"] = "free"
    created_at: datetime
    updated_at: Optional[datetime] = None


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


class StatusUpdate(BaseModel):
    is_active: bool
