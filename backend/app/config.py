from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    SUPABASE_URL: str
    SUPABASE_SERVICE_KEY: str
    SUPABASE_JWT_SECRET: str
    # Comma-separated list of allowed CORS origins, e.g. "https://app.example.com,https://admin.example.com"
    # Leave unset to allow all origins (development default).
    ALLOWED_ORIGINS: str = "*"

    # Gmail SMTP — used by the custom OTP email sender (production only).
    # In development, leave these empty; the frontend calls supabase.auth.signInWithOtp()
    # which routes through Inbucket (local email testing server on port 54324).
    GMAIL_SMTP_USER:     str = ""
    GMAIL_SMTP_PASSWORD: str = ""
    GMAIL_FROM_NAME:     str = "Ultimate CashBook"
    GMAIL_FROM_ADDRESS:  str = "info@ultimatecashbook.com"

    @property
    def cors_origins(self) -> List[str]:
        if self.ALLOWED_ORIGINS == "*":
            return ["*"]
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",") if o.strip()]

    class Config:
        env_file = ".env"


settings = Settings()
