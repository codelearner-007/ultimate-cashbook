#!/usr/bin/env python3
"""
seed.py — Ultimate CashBook test data seeder

Usage:
  python seed.py            # Insert seed data for ALL users
  python seed.py --cleanup  # Delete all seed data (safe — only removes [SEED] books)

Seed books are prefixed with "[SEED]" so they are easy to identify and remove.
Entries cascade-delete automatically when their book is deleted.

This script writes directly to Supabase using the service key — no FastAPI server needed.
"""

import os
import sys
import random
from datetime import date, timedelta
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

from supabase import create_client, Client  # noqa: E402  (import after dotenv)

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in backend/.env")
    sys.exit(1)

sb: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

# ── Configuration ────────────────────────────────────────────────────────────

BOOKS_PER_USER  = 20
ENTRIES_PER_BOOK = 500
INSERT_BATCH    = 100   # rows per Supabase insert call
SEED_PREFIX     = "[SEED]"

# ── Seed data pools ──────────────────────────────────────────────────────────

BOOK_NAMES = [
    "Personal Expenses",   "Business Account",     "Grocery Budget",
    "Office Petty Cash",   "Travel Fund",           "Monthly Salary",
    "Rent & Utilities",    "Food & Dining",         "Healthcare",
    "Education Fund",      "Investment Tracker",    "Vehicle Expenses",
    "Home Maintenance",    "Entertainment",         "Freelance Income",
    "Savings Account",     "Emergency Fund",        "Shopping",
    "Loan Repayment",      "Side Business",         "Wedding Fund",
    "Ramadan Budget",      "Eid Expenses",          "Utilities Tracker",
]

CATEGORIES = [
    "Food & Drinks", "Transport", "Fuel", "Salary", "Rent",
    "Utilities", "Shopping", "Healthcare", "Education",
    "Entertainment", "Investment", "Loan", "Other",
]

PAYMENT_MODES = ["cash", "online", "cheque", "other"]

REMARKS_IN = [
    "Monthly salary received", "Freelance payment", "Client payment",
    "Rental income", "Business sale", "Commission received", "Dividend",
    "Bonus received", "Cash from ATM", "Transfer received", "Refund",
    "Gift money", "Extra income", "Profit from business", "Interest earned",
    None, None, None,
]

REMARKS_OUT = [
    "Grocery shopping", "Petrol / fuel", "Electricity bill", "Gas bill",
    "Internet bill", "Mobile top-up", "Doctor visit", "Medicine",
    "School fee", "Rent payment", "Household items", "Clothing purchase",
    "Restaurant dinner", "Snacks", "Transport fare", "Uber / Careem",
    "Office supplies", "Equipment purchase", "Loan instalment", "Repair work",
    None, None,
]

CONTACT_NAMES = [
    "Ahmed Khan", "Fatima Ali", "Muhammad Hassan", "Sara Malik",
    "Usman Sheikh", "Ayesha Raza", "Bilal Hussain", "Zainab Qureshi",
    "Omar Farooq", "Hira Baig", "Tariq Mehmood", "Nadia Siddiqui",
    None, None, None, None,
]

# ── Helpers ───────────────────────────────────────────────────────────────────

def _random_date() -> str:
    """Random date within the last 2 years."""
    offset = random.randint(0, 730)
    return (date.today() - timedelta(days=offset)).isoformat()


def _random_time() -> str:
    return f"{random.randint(0, 23):02d}:{random.randint(0, 59):02d}"


def _random_amount() -> float:
    """
    Weighted PKR amounts:
      55 % small  :   50 – 5,000
      30 % medium :  5,000 – 40,000
      15 % large  : 40,000 – 200,000
    """
    r = random.random()
    if r < 0.55:
        return round(random.uniform(50, 5_000), 2)
    elif r < 0.85:
        return round(random.uniform(5_000, 40_000), 2)
    else:
        return round(random.uniform(40_000, 200_000), 2)


# ── Core operations ───────────────────────────────────────────────────────────

def _get_all_users() -> list[dict]:
    res = sb.table("profiles").select("id, email, role").execute()
    return res.data or []


def _create_books_for_user(user_id: str) -> list[dict]:
    pool = list(BOOK_NAMES)
    random.shuffle(pool)
    names = pool[:BOOKS_PER_USER]
    # Pad if BOOKS_PER_USER > unique names available
    while len(names) < BOOKS_PER_USER:
        names.append(f"{random.choice(BOOK_NAMES)} {len(names) + 1}")

    records = [
        {"user_id": user_id, "name": f"{SEED_PREFIX} {n}", "currency": "PKR"}
        for n in names
    ]
    res = sb.table("books").insert(records).execute()
    return res.data or []


def _create_entries_for_book(book_id: str, user_id: str) -> None:
    rows = []
    for _ in range(ENTRIES_PER_BOOK):
        etype = random.choice(["in", "out"])
        rows.append({
            "book_id":      book_id,
            "user_id":      user_id,
            "type":         etype,
            "amount":       _random_amount(),
            "remark":       random.choice(REMARKS_IN if etype == "in" else REMARKS_OUT),
            "category":     random.choice(CATEGORIES + [None]),
            "payment_mode": random.choice(PAYMENT_MODES),
            "contact_name": random.choice(CONTACT_NAMES),
            "entry_date":   _random_date(),
            "entry_time":   _random_time(),
        })

    for start in range(0, len(rows), INSERT_BATCH):
        sb.table("entries").insert(rows[start : start + INSERT_BATCH]).execute()


# ── Commands ──────────────────────────────────────────────────────────────────

def seed() -> None:
    users = _get_all_users()
    if not users:
        print("No users found in profiles table.")
        return

    print(f"Found {len(users)} user(s).")
    print(f"Plan: {BOOKS_PER_USER} books × {ENTRIES_PER_BOOK} entries per user\n")

    for user in users:
        uid   = user["id"]
        email = user.get("email", uid)
        role  = user.get("role", "user")
        print(f"  ► {email}  [{role}]")

        books = _create_books_for_user(uid)
        print(f"    {len(books)} books created")

        for idx, book in enumerate(books, 1):
            _create_entries_for_book(book["id"], uid)
            print(f"    [{idx:2d}/{len(books)}] {book['name']}  —  {ENTRIES_PER_BOOK} entries ✓")

        print()

    total_books   = len(users) * BOOKS_PER_USER
    total_entries = total_books * ENTRIES_PER_BOOK
    print(f"Done. {total_books} books · {total_entries:,} entries inserted.")
    print(f"\nTo remove seed data later:  python seed.py --cleanup")


def cleanup() -> None:
    print(f"Searching for seed books (name starts with '{SEED_PREFIX}')...")

    res   = sb.table("books").select("id, name").like("name", f"{SEED_PREFIX}%").execute()
    books = res.data or []

    if not books:
        print("No seed data found — nothing to delete.")
        return

    print(f"Found {len(books)} seed books. Deleting (entries cascade automatically)...")

    ids = [b["id"] for b in books]
    for start in range(0, len(ids), 50):
        batch = ids[start : start + 50]
        sb.table("books").delete().in_("id", batch).execute()

    print(f"Done. {len(ids)} seed books (and all their entries) removed.")


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    if "--cleanup" in sys.argv:
        cleanup()
    else:
        seed()
