import os

# The app's pydantic Settings require these at import time. Set harmless dummy
# values so the FastAPI app can be imported in tests without a real Supabase
# project (every test replaces the Supabase client with a fake anyway).
os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "test-service-key")
os.environ.setdefault("SUPABASE_JWT_SECRET", "test-jwt-secret")
