def apply_display_order(sb, table: str, book_id: str, owner_id: str, ordered_ids: list[str]) -> None:
    """Persist drag-sorted order: row at index N in ``ordered_ids`` gets ``display_order = N``.

    Scoped by book_id + owner_id (defence in depth, since the service key bypasses RLS).
    """
    for order, row_id in enumerate(ordered_ids):
        sb.table(table).update({"display_order": order}) \
          .eq("id", row_id) \
          .eq("book_id", book_id) \
          .eq("user_id", owner_id) \
          .execute()
