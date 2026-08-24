from fastapi import HTTPException
from app.db.supabase import get_supabase

# Rights hierarchy (weakest → strongest)
_RIGHTS_ORDER = ["view", "view_create_edit", "view_create_edit_delete"]


def _rights_gte(actual: str, required: str) -> bool:
    """Return True if `actual` rights level is >= `required`."""
    try:
        return _RIGHTS_ORDER.index(actual) >= _RIGHTS_ORDER.index(required)
    except ValueError:
        return False


def get_book_owner_id(sb, book_id: str, user_id: str) -> str:
    """
    Verify access to a book and return the owner's user_id.

    - Owner:        returns user_id unchanged.
    - Collaborator: looks up book_shares and returns the owner's user_id so
                    every subsequent DB query uses the correct user_id filter.
    - No access:    raises 404.

    Use the returned value (call it owner_id) for *all* data queries on entries,
    categories, contacts, and payment_modes so that collaborators transparently
    read and write the owner's data.
    """
    # Fast path — user is the owner
    owner_check = (
        sb.table("books")
        .select("user_id")
        .eq("id", book_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    if owner_check.data:
        return user_id

    # Collaborator path — only accepted shares grant access
    share_check = (
        sb.table("book_shares")
        .select("owner_id")
        .eq("book_id", book_id)
        .eq("shared_with_id", user_id)
        .eq("status", "accepted")
        .limit(1)
        .execute()
    )
    if share_check.data:
        return share_check.data[0]["owner_id"]

    raise HTTPException(status_code=404, detail="Book not found")


def get_book_access(sb, book_id: str, user_id: str) -> tuple[str, str]:
    """
    Like get_book_owner_id but also returns the effective rights level.

    Returns (owner_id, rights) where rights is one of:
      'owner'                    — user is the book owner (full access)
      'view'                     — read-only collaborator
      'view_create_edit'         — can create and edit but not delete
      'view_create_edit_delete'  — full collaborator access

    Raises 404 if the user has no access.
    """
    # Fast path — user is the owner
    owner_check = (
        sb.table("books")
        .select("user_id")
        .eq("id", book_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    if owner_check.data:
        return user_id, "owner"

    # Collaborator path — only accepted shares grant access
    share_check = (
        sb.table("book_shares")
        .select("owner_id, rights")
        .eq("book_id", book_id)
        .eq("shared_with_id", user_id)
        .eq("status", "accepted")
        .limit(1)
        .execute()
    )
    if share_check.data:
        row = share_check.data[0]
        return row["owner_id"], row.get("rights", "view")

    raise HTTPException(status_code=404, detail="Book not found")


def require_rights(rights: str, required: str) -> None:
    """Raise 403 if `rights` does not satisfy `required`. Owner ('owner') always passes."""
    if rights == "owner":
        return
    if not _rights_gte(rights, required):
        raise HTTPException(
            status_code=403,
            detail=f"This action requires '{required}' access or higher.",
        )
