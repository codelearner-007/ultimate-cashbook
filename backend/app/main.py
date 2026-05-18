from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.routers import books, entries, reports, upload, profile, admin, contacts, categories, payment_modes, notifications, sharing, invitations, migration
from app.config import settings

app = FastAPI(title="CashBook API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Attach CORS headers manually — CORSMiddleware does not wrap the exception handler layer,
# so a bare 500 would be returned without them, causing browser CORS errors.
_origin_header = settings.ALLOWED_ORIGINS if settings.ALLOWED_ORIGINS == "*" else settings.cors_origins[0]
CORS_HEADERS = {
    "Access-Control-Allow-Origin": _origin_header,
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Allow-Methods": "*",
}

@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    return JSONResponse(status_code=500, content={"detail": str(exc)}, headers=CORS_HEADERS)

app.include_router(profile.router, prefix="/api/v1/profile",  tags=["profile"])
app.include_router(books.router,   prefix="/api/v1/books",    tags=["books"])
app.include_router(entries.router, prefix="/api/v1/books",    tags=["entries"])
app.include_router(reports.router, prefix="/api/v1/books",    tags=["reports"])
app.include_router(upload.router,  prefix="/api/v1/upload",   tags=["upload"])
app.include_router(admin.router,    prefix="/api/v1/admin",    tags=["admin"])
app.include_router(contacts.router,    prefix="/api/v1/books",    tags=["contacts"])
app.include_router(categories.router,      prefix="/api/v1/books",    tags=["categories"])
app.include_router(payment_modes.router,   prefix="/api/v1/books",         tags=["payment-modes"])
app.include_router(notifications.router,   prefix="/api/v1/notifications", tags=["notifications"])
app.include_router(sharing.router,         prefix="/api/v1/books",         tags=["sharing"])
app.include_router(invitations.router,     prefix="/api/v1/invitations",   tags=["invitations"])
app.include_router(migration.router,       prefix="/api/v1/migrate/offline", tags=["migration"])


@app.get("/health")
def health():
    return {"status": "ok"}
