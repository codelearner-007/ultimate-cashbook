import time
import uuid
from typing import Optional
from fastapi import APIRouter, Depends, UploadFile, File, Form, Query, HTTPException
from app.auth.jwt import get_current_user
from app.db.supabase import get_supabase

router = APIRouter()

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic"}
ALLOWED_TYPES = ALLOWED_IMAGE_TYPES | {"application/pdf"}
MAX_SIZE_BYTES = 6 * 1024 * 1024  # 6 MB
@router.post("/attachment")
async def upload_attachment(
    file: UploadFile = File(...),
    entry_id: Optional[str] = Form(None),
    user_id: str = Depends(get_current_user),
):
    content_type = (file.content_type or "").lower().strip()
    if content_type == "image/jpg":
        content_type = "image/jpeg"

    if content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="Only JPEG, PNG, WebP, HEIC images and PDFs are allowed")

    content = await file.read()
    if len(content) > MAX_SIZE_BYTES:
        raise HTTPException(status_code=400, detail="File exceeds 6 MB limit")

    sb = get_supabase()

    try:
        sb.storage.create_bucket("attachments", options={"public": True})
    except Exception:
        pass  # Already exists

    storage_id = entry_id or str(uuid.uuid4())

    if content_type == "application/pdf":
        ext = "pdf"
    else:
        ext = file.filename.rsplit(".", 1)[-1] if file.filename and "." in file.filename else "jpg"
        if ext.lower() in ("jpg", "jpeg"):
            ext = "jpg"

    path = f"{user_id}/{storage_id}/attachment.{ext}"

    sb.storage.from_("attachments").upload(
        path,
        content,
        {"content-type": content_type, "upsert": "true"},
    )

    public_url = sb.storage.from_("attachments").get_public_url(path)
    if isinstance(public_url, dict):
        public_url = public_url.get("publicURL") or public_url.get("publicUrl", "")

    return {
        "attachment_url": public_url,
        "path": path,
        "provider": "supabase",
    }


@router.delete("/attachment")
async def delete_attachment(
    path: str = Query(...),
    user_id: str = Depends(get_current_user),
):
    # Verify the path belongs to the requesting user
    if not path.startswith(f"{user_id}/"):
        raise HTTPException(status_code=403, detail="Not authorized to delete this file")
    sb = get_supabase()
    sb.storage.from_("attachments").remove([path])
    return {"deleted": True}


@router.post("/avatar")
async def upload_avatar(
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user),
):
    # Normalise content type — Android gallery/camera often sends None or image/jpg
    content_type = (file.content_type or "image/jpeg").lower().strip()
    if content_type == "image/jpg":
        content_type = "image/jpeg"

    if content_type not in ALLOWED_IMAGE_TYPES:
        # Fall back: infer from filename extension
        fname = (file.filename or "").lower()
        if fname.endswith((".jpg", ".jpeg")):
            content_type = "image/jpeg"
        elif fname.endswith(".png"):
            content_type = "image/png"
        elif fname.endswith(".webp"):
            content_type = "image/webp"
        else:
            content_type = "image/jpeg"  # safe default

    content = await file.read()
    if len(content) > MAX_SIZE_BYTES:
        raise HTTPException(status_code=400, detail="File exceeds 6 MB limit")

    sb = get_supabase()

    try:
        sb.storage.create_bucket("avatars", options={"public": True})
    except Exception:
        pass  # Already exists

    ext = content_type.split("/")[-1]
    if ext in ("jpeg", "jpg"):
        ext = "jpg"
    path = f"{user_id}/profile.{ext}"

    try:
        sb.storage.from_("avatars").upload(
            path,
            content,
            {"content-type": content_type, "upsert": "true"},
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Storage upload failed: {str(e)}")

    public_url = sb.storage.from_("avatars").get_public_url(path)
    if isinstance(public_url, dict):
        public_url = public_url.get("publicURL") or public_url.get("publicUrl", "")

    # storage3 always appends a trailing '?' even with no query params — strip it
    # before adding our cache-bust param, otherwise the URL becomes "...jpg??v=..."
    # which browsers normalise but native mobile loaders reject outright.
    public_url = public_url.rstrip("?")
    versioned_url = f"{public_url}?v={int(time.time())}"

    sb.table("profiles").update({"avatar_url": versioned_url}).eq("id", user_id).execute()

    return {"avatar_url": versioned_url}
