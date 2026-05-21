from pydantic import BaseModel, field_validator
from typing import Optional, List
from datetime import datetime

VALID_TARGET_TYPES = ("all", "new_users", "plan_free", "plan_pro_m", "plan_pro_y", "plan_biz_m", "plan_biz_y", "specific")


class NotificationCreate(BaseModel):
    title: str
    body: str
    target_type: str = "all"
    # Used when target_type = 'new_users' (default 30 days)
    days_threshold: Optional[int] = 30
    # Required when target_type = 'specific'
    user_ids: Optional[List[str]] = None

    @field_validator("target_type")
    @classmethod
    def validate_target(cls, v: str) -> str:
        if v not in VALID_TARGET_TYPES:
            raise ValueError(f"target_type must be one of {VALID_TARGET_TYPES}")
        return v


class NotificationResponse(BaseModel):
    id: str
    title: str
    body: str
    target_type: str
    days_threshold: Optional[int] = None
    created_by: Optional[str] = None
    created_at: datetime
    recipient_count: int = 0


class UserNotificationResponse(BaseModel):
    id: str
    notification_id: str
    title: str
    body: str
    is_read: bool
    read_at: Optional[datetime] = None
    created_at: datetime
