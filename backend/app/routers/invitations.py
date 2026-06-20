from fastapi import APIRouter, Depends
from typing import List
from app.auth.jwt import get_current_user
from app.db.supabase import get_supabase
from app.models.sharing import ReceivedInvitation, GivenInvitation, CollaboratorProfile

router = APIRouter()


@router.get("/received", response_model=List[ReceivedInvitation])
async def get_received_invitations(user_id: str = Depends(get_current_user)):
    """All book-share invitations sent TO the current user (all statuses)."""
    sb = get_supabase()

    shares = (
        sb.table("book_shares")
        .select("*")
        .eq("shared_with_id", user_id)
        .order("created_at", desc=True)
        .execute()
    ).data or []

    if not shares:
        return []

    book_ids  = list({s["book_id"]  for s in shares})
    owner_ids = list({s["owner_id"] for s in shares})

    books_map = {
        b["id"]: b
        for b in (
            sb.table("books")
            .select("id, name")
            .in_("id", book_ids)
            .execute()
        ).data or []
    }
    owners_map = {
        p["id"]: p
        for p in (
            sb.table("profiles")
            .select("id, full_name, email, avatar_url")
            .in_("id", owner_ids)
            .execute()
        ).data or []
    }

    result = []
    for share in shares:
        book  = books_map.get(share["book_id"])
        owner = owners_map.get(share["owner_id"])
        if not book or not owner:
            continue
        result.append(ReceivedInvitation(
            share_id=share["id"],
            book_id=share["book_id"],
            book_name=book["name"],
            owner=CollaboratorProfile(
                id=owner["id"],
                full_name=owner.get("full_name"),
                email=owner.get("email", ""),
                avatar_url=owner.get("avatar_url"),
            ),
            screens=share.get("screens", {}),
            rights=share["rights"],
            status=share.get("status", "accepted"),
            created_at=share["created_at"],
        ))
    return result


@router.get("/given", response_model=List[GivenInvitation])
async def get_given_invitations(user_id: str = Depends(get_current_user)):
    """All book-share invitations sent BY the current user (all books, all statuses)."""
    sb = get_supabase()

    shares = (
        sb.table("book_shares")
        .select("*")
        .eq("owner_id", user_id)
        .order("created_at", desc=True)
        .execute()
    ).data or []

    if not shares:
        return []

    book_ids       = list({s["book_id"]       for s in shares})
    collaborator_ids = list({s["shared_with_id"] for s in shares})

    books_map = {
        b["id"]: b
        for b in (
            sb.table("books")
            .select("id, name")
            .in_("id", book_ids)
            .execute()
        ).data or []
    }
    collabs_map = {
        p["id"]: p
        for p in (
            sb.table("profiles")
            .select("id, full_name, email, avatar_url, subscription_tier")
            .in_("id", collaborator_ids)
            .execute()
        ).data or []
    }

    result = []
    for share in shares:
        book   = books_map.get(share["book_id"])
        collab = collabs_map.get(share["shared_with_id"])
        if not book or not collab:
            continue
        result.append(GivenInvitation(
            share_id=share["id"],
            book_id=share["book_id"],
            book_name=book["name"],
            collaborator=CollaboratorProfile(
                id=collab["id"],
                full_name=collab.get("full_name"),
                email=collab.get("email", ""),
                avatar_url=collab.get("avatar_url"),
                subscription_tier=collab.get("subscription_tier") or "free",
            ),
            screens=share.get("screens", {}),
            rights=share["rights"],
            status=share.get("status", "accepted"),
            created_at=share["created_at"],
        ))
    return result
