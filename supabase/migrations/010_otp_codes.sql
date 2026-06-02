-- OTP codes table for custom email OTP auth (production Gmail SMTP flow).
-- Not touched in local dev — backend returns 503 when GMAIL_SMTP_USER is unset.

CREATE TABLE IF NOT EXISTS public.otp_codes (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  email      TEXT        NOT NULL,
  code       TEXT        NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used       BOOLEAN     DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_otp_codes_email ON public.otp_codes(email);
