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

    # RevenueCat webhook shared secret (Authorization header value the webhook must send).
    # Subscription entitlements are written ONLY by this verified webhook.
    REVENUECAT_WEBHOOK_AUTH: str = ""

    # Error monitoring (optional). When set, Sentry captures unhandled exceptions.
    SENTRY_DSN: str = ""

    # Dev-only escape hatch: when true, PATCH /profile/subscription lets the client set
    # its own tier (for local testing of tier-gated UI without a store sandbox).
    # MUST stay false in production — leaving it false closes the self-upgrade hole.
    DEV_ALLOW_CLIENT_SUBSCRIPTION: bool = False

    @property
    def cors_origins(self) -> List[str]:
        if self.ALLOWED_ORIGINS == "*":
            return ["*"]
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",") if o.strip()]

    class Config:
        env_file = ".env"


settings = Settings()
