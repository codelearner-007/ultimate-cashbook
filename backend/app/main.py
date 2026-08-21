from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, HTMLResponse
from app.routers import books, entries, reports, upload, profile, admin, contacts, categories, payment_modes, notifications, sharing, invitations, migration, auth
from app.config import settings

app = FastAPI(title="Ultimate CashBook API", version="1.0.0")

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
app.include_router(auth.router,            prefix="/api/v1/auth",            tags=["auth"])


@app.get("/health")
def health():
    return {"status": "ok"}


# ── Public static pages (unauthenticated — Play Console App Content links) ─────
#
# Both pages share one visual shell so they read as one product; only the
# <main> content differs per page.

_PAGE_STYLE = """
  :root { color-scheme: light; }
  body {
    margin: 0; padding: 40px 20px 64px; background: #F4FAFA; color: #0F172A;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    line-height: 1.6;
  }
  main { max-width: 640px; margin: 0 auto; }
  h1 { font-size: 26px; margin: 0 0 6px; color: #0E5A5F; }
  p.lead { color: #64748B; margin: 0 0 32px; font-size: 15px; }
  .card {
    background: #fff; border: 1.5px solid #DCEBEB; border-radius: 16px;
    padding: 24px; margin-bottom: 20px;
  }
  .card h2 { font-size: 17px; margin: 0 0 4px; color: #0F172A; }
  .card .tag {
    display: inline-block; font-size: 11px; font-weight: 700; letter-spacing: 0.06em;
    text-transform: uppercase; color: #157F86; background: #E1F4F4; border-radius: 6px;
    padding: 3px 8px; margin-bottom: 10px;
  }
  .card p { font-size: 14px; color: #334155; margin: 8px 0; }
  .card ol, .card ul { font-size: 14px; color: #334155; padding-left: 20px; margin: 10px 0; }
  .card li { margin-bottom: 4px; }
  .card a { color: #157F86; }
  a.btn {
    display: inline-block; margin-top: 12px; background: #157F86; color: #fff;
    text-decoration: none; font-size: 14px; font-weight: 600; padding: 11px 18px;
    border-radius: 10px;
  }
  .data-list { font-size: 13.5px; color: #475569; }
  footer { text-align: center; color: #94A3B8; font-size: 12.5px; margin-top: 32px; }
"""


def _page_shell(title: str, body_html: str) -> str:
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title} — Ultimate CashBook</title>
<style>{_PAGE_STYLE}</style>
</head>
<body>
<main>
{body_html}
</main>
</body>
</html>"""


@app.get("/account-deletion", response_class=HTMLResponse)
def account_deletion_page():
    """
    Public, unauthenticated page fulfilling Google Play's User Data policy —
    apps that support account creation must provide a web resource where a
    deletion request can be made without needing the app installed. The
    in-app path (Settings -> Delete Account) is the primary flow; this page
    is the fallback for anyone who no longer has the app.
    """
    support_email = settings.GMAIL_FROM_ADDRESS
    return _page_shell("Delete Your Account", f"""
  <h1>Delete Your Account</h1>
  <p class="lead">Ultimate CashBook lets you delete your account and all associated data at any time, whether or not you still have the app installed.</p>

  <div class="card">
    <span class="tag">If you have the app</span>
    <h2>Delete in-app (instant)</h2>
    <ol>
      <li>Open Ultimate CashBook and sign in</li>
      <li>Go to <strong>Settings</strong></li>
      <li>Scroll to <strong>Danger Zone</strong> and tap <strong>Delete Account</strong></li>
      <li>Confirm on both screens</li>
    </ol>
    <p>Your account and every piece of associated data are deleted immediately and permanently — there is no recovery period.</p>
  </div>

  <div class="card">
    <span class="tag">If you no longer have the app</span>
    <h2>Request deletion by email</h2>
    <p>Email us from the address registered on your account and we'll delete it for you within 30 days, with a confirmation reply once it's done.</p>
    <a class="btn" href="mailto:{support_email}?subject=Delete%20my%20Ultimate%20CashBook%20account">Email {support_email}</a>
  </div>

  <div class="card">
    <span class="tag">What gets deleted</span>
    <ul class="data-list">
      <li>Your profile (name, email, avatar)</li>
      <li>All books and entries you own, and their categories, contacts, and payment modes</li>
      <li>Receipt attachments and profile photo stored in cloud storage</li>
      <li>Book-sharing invitations and collaborator access, in both directions</li>
      <li>Notification history and push-notification tokens</li>
    </ul>
  </div>

  <footer>Ultimate CashBook &middot; {support_email}</footer>
""")


# Mirrors frontend/src/screens/PrivacyPolicyScreen.jsx's SECTIONS array verbatim.
# Keep both in sync when either changes — Play Console's Data safety form must
# match what's actually shown to users, in-app and on the web, word for word.
_PRIVACY_LAST_UPDATED = "May 23, 2025"
_PRIVACY_SECTIONS = [
    (
        "Information We Collect",
        "We collect information you provide directly to us, such as when you create an account, "
        "add financial entries, or contact us for support. This includes:\n\n"
        "• Account information (name, email address)\n"
        "• Financial records you enter (income, expense transactions)\n"
        "• Device information and usage data\n"
        "• Business details you optionally provide",
    ),
    (
        "How We Use Your Information",
        "We use the information we collect to:\n\n"
        "• Provide, maintain, and improve our services\n"
        "• Sync your data across devices (Pro and Business plans)\n"
        "• Send you important account and service notifications\n"
        "• Respond to your comments and questions\n"
        "• Monitor and analyze trends and usage\n"
        "• Detect and prevent fraudulent transactions",
    ),
    (
        "Data Storage & Security",
        "Your data is stored securely using industry-standard encryption. Financial records are stored "
        "in our secure cloud database (Supabase) protected by row-level security policies.\n\n"
        "Free plan users' data is stored locally on their device. Pro and Business plan users benefit "
        "from encrypted cloud backup and sync.\n\n"
        "We implement appropriate technical and organizational measures to protect your personal "
        "information against unauthorized access, alteration, disclosure, or destruction.",
    ),
    (
        "Data Sharing",
        "We do not sell, trade, or rent your personal information to third parties. We may share your "
        "information only in the following limited circumstances:\n\n"
        "• With your explicit consent\n"
        "• To comply with legal obligations\n"
        "• To protect the rights and safety of our users\n"
        "• With service providers who assist us in operating our platform (under strict confidentiality agreements)",
    ),
    (
        "Book Sharing & Collaboration",
        "When you invite collaborators to your cashbook (Pro and Business plans), those collaborators can "
        "view and edit entries within the shared book according to the permissions you grant.\n\n"
        "You control who has access to your books and can revoke access at any time from the Manage Access settings.",
    ),
    (
        "Data Retention",
        "We retain your account and financial data for as long as your account is active or as needed to "
        "provide services.\n\n"
        "If you cancel your subscription, your data remains accessible until your billing period ends. "
        "Your data is never deleted automatically — you remain in full control.\n\n"
        "You may delete your account and all associated data at any time from Settings -> Delete Account "
        'in the app, or by visiting <a href="/account-deletion">ultimate-cashbook.onrender.com/account-deletion</a>.',
    ),
    (
        "Your Rights",
        "You have the right to:\n\n"
        "• Access the personal data we hold about you\n"
        "• Correct inaccurate or incomplete data\n"
        "• Request deletion of your personal data\n"
        "• Export your data in a portable format\n"
        "• Withdraw consent at any time\n\n"
        "To exercise any of these rights, please contact us using the information below.",
    ),
    (
        "Cookies & Tracking",
        "The Ultimate CashBook mobile app does not use cookies. We may collect anonymized usage analytics "
        "to improve app performance and user experience. These analytics do not identify you personally.",
    ),
    (
        "Children's Privacy",
        "Our services are not directed to children under the age of 13. We do not knowingly collect "
        "personal information from children under 13. If you become aware that a child has provided us "
        "with personal information, please contact us immediately.",
    ),
    (
        "Changes to This Policy",
        'We may update this Privacy Policy from time to time. We will notify you of any changes by '
        'posting the new Privacy Policy on this page and updating the "Last Updated" date.\n\n'
        "Your continued use of the app after any changes constitutes your acceptance of the new Privacy Policy.",
    ),
]


def _render_policy_body(text: str) -> str:
    """Turn a '\\n\\n'-separated, '• '-bulleted section body into <p>/<ul> HTML."""
    blocks = text.split("\n\n")
    html_parts = []
    for block in blocks:
        lines = block.split("\n")
        if all(line.startswith("• ") for line in lines):
            items = "".join(f"<li>{line[2:]}</li>" for line in lines)
            html_parts.append(f"<ul>{items}</ul>")
        else:
            html_parts.append(f"<p>{block}</p>")
    return "".join(html_parts)


@app.get("/privacy-policy", response_class=HTMLResponse)
def privacy_policy_page():
    """
    Public, unauthenticated privacy policy — required by Google Play Console's
    App Content and Data safety sections as a live URL (the in-app
    PrivacyPolicyScreen alone does not satisfy this; Play needs something it
    can open in a browser without the app installed).
    """
    # Matches the "Contact Us" address in frontend/src/screens/PrivacyPolicyScreen.jsx
    # verbatim — deliberately NOT settings.GMAIL_FROM_ADDRESS (a different mailbox),
    # so this page says exactly what the in-app policy already promises users.
    policy_contact_email = "support@ultimatecashbook.com"
    sections_html = "".join(
        f'<div class="card"><h2>{title}</h2>{_render_policy_body(body)}</div>'
        for title, body in _PRIVACY_SECTIONS
    )
    contact_html = (
        f'<div class="card"><h2>Contact Us</h2>'
        f"<p>If you have any questions about this Privacy Policy or our data practices, "
        f"please contact us at:</p><p><strong>Email:</strong> {policy_contact_email}</p>"
        f"<p>We will respond to your inquiry within 5 business days.</p></div>"
    )
    return _page_shell("Privacy Policy", f"""
  <h1>Privacy Policy</h1>
  <p class="lead">Ultimate CashBook is committed to protecting your personal and financial data. This policy explains what we collect, how we use it, and the choices you have.<br><br>Last updated: {_PRIVACY_LAST_UPDATED}</p>
  {sections_html}
  {contact_html}
  <footer>Ultimate CashBook</footer>
""")
