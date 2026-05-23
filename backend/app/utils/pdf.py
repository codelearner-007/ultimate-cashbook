from datetime import datetime
from io import BytesIO
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Table, TableStyle,
    Paragraph, Spacer, HRFlowable,
)
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch, mm

PAGE_W, PAGE_H = A4
MARGIN   = 14 * mm
USABLE_W = PAGE_W - 2 * MARGIN

# ── Palette ────────────────────────────────────────────────────────────────
TEAL        = colors.HexColor("#39AAAA")
TEAL_DARK   = colors.HexColor("#2B8080")
TEAL_LIGHT  = colors.HexColor("#EAF6F6")
TEAL_MID    = colors.HexColor("#C4E4E4")
GREEN_DARK  = colors.HexColor("#166534")
GREEN_LIGHT = colors.HexColor("#86EFAC")
RED_DARK    = colors.HexColor("#991B1B")
RED_LIGHT   = colors.HexColor("#FCA5A5")
SLATE_50    = colors.HexColor("#F8FAFC")
SLATE_100   = colors.HexColor("#F1F5F9")
SLATE_200   = colors.HexColor("#E2E8F0")
SLATE_400   = colors.HexColor("#94A3B8")
SLATE_500   = colors.HexColor("#64748B")
SLATE_600   = colors.HexColor("#475569")
SLATE_700   = colors.HexColor("#334155")
SLATE_900   = colors.HexColor("#0F172A")
WHITE       = colors.white


# ── Page header / footer ────────────────────────────────────────────────────
def _page_deco(canv, doc):
    canv.saveState()

    # Top bar
    bar_h = 11 * mm
    canv.setFillColor(TEAL)
    canv.rect(0, PAGE_H - bar_h, PAGE_W, bar_h, fill=1, stroke=0)

    # Subtle left accent stripe
    canv.setFillColor(TEAL_DARK)
    canv.rect(0, PAGE_H - bar_h, 2.5 * mm, bar_h, fill=1, stroke=0)

    canv.setFont("Helvetica-Bold", 12)
    canv.setFillColor(WHITE)
    canv.drawString(MARGIN, PAGE_H - 7.5 * mm, "Ultimate CashBook")

    canv.setFont("Helvetica", 8.5)
    canv.setFillColor(colors.HexColor("#D1EDED"))
    canv.drawRightString(PAGE_W - MARGIN, PAGE_H - 7.5 * mm, "Financial Report")

    # Bottom bar
    canv.setFillColor(SLATE_100)
    canv.rect(0, 0, PAGE_W, 9 * mm, fill=1, stroke=0)
    canv.setFillColor(TEAL_MID)
    canv.rect(0, 9 * mm, PAGE_W, 0.4 * mm, fill=1, stroke=0)

    canv.setFont("Helvetica", 7)
    canv.setFillColor(SLATE_500)
    now = datetime.now().strftime("%B %d, %Y  %I:%M %p")
    canv.drawString(MARGIN, 3.2 * mm, f"Generated: {now}")
    canv.drawRightString(PAGE_W - MARGIN, 3.2 * mm, f"Page {doc.page}")

    canv.restoreState()


# ── Helper: paragraph ───────────────────────────────────────────────────────
def _p(text, size=9, bold=False, color=SLATE_900, align="LEFT", space_after=0, leading=None):
    return Paragraph(
        text,
        ParagraphStyle(
            "x",
            fontSize=size,
            fontName="Helvetica-Bold" if bold else "Helvetica",
            textColor=color,
            alignment={"LEFT": 0, "CENTER": 1, "RIGHT": 2}[align],
            spaceAfter=space_after,
            leading=leading or (size * 1.35),
        ),
    )


_PAYMENT_LABELS = {"cash": "Cash", "online": "Online", "cheque": "Cheque", "other": "Other"}
_TYPE_LABELS    = {"in": "Cash In", "out": "Cash Out"}


def _build_filter_items(filters: dict, date_from=None, date_to=None, contact_type=None) -> list:
    items = []
    if date_from or date_to:
        items.append(("Date Range", f"{date_from or 'Beginning'} → {date_to or 'Today'}"))
    if filters:
        if filters.get("entry_type"):
            items.append(("Entry Type", _TYPE_LABELS.get(filters["entry_type"], filters["entry_type"].title())))
        if filters.get("contact_name"):
            _lbl = "Customer" if contact_type == "customer" else "Supplier" if contact_type == "supplier" else "Contact"
            items.append((_lbl, filters["contact_name"]))
        if filters.get("category"):
            items.append(("Category", filters["category"]))
        if filters.get("payment_mode"):
            items.append(("Payment Mode", _PAYMENT_LABELS.get(filters["payment_mode"], filters["payment_mode"].title())))
    return items


# ── Main generator ──────────────────────────────────────────────────────────
def generate_pdf(book_name: str, currency: str, entries: list, summary: dict,
                 date_from=None, date_to=None, filters: dict = None, contact_type=None) -> bytes:
    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=MARGIN, rightMargin=MARGIN,
        topMargin=13 * mm, bottomMargin=13 * mm,
    )

    sym = (currency or "").strip()
    net = summary["net_balance"]
    nc  = GREEN_DARK if net >= 0 else RED_DARK

    elems = []

    # ── 1. Title block ────────────────────────────────────────────────────
    elems.append(Spacer(1, 3 * mm))
    elems.append(_p(book_name, size=20, bold=True, color=TEAL_DARK, space_after=1))

    end_date = date_to or datetime.now().strftime("%Y-%m-%d")
    period   = f"{date_from or 'All time'}  →  {end_date}"
    elems.append(_p(period, size=8.5, color=SLATE_500, space_after=1))
    elems.append(_p(
        f"{len(entries)} transaction{'s' if len(entries) != 1 else ''}",
        size=7.5, color=SLATE_400, space_after=4,
    ))
    elems.append(HRFlowable(width="100%", thickness=1, color=TEAL_MID, spaceAfter=3 * mm))

    # ── 1b. Active-filters block ──────────────────────────────────────────
    filter_items = _build_filter_items(filters, date_from, date_to, contact_type)
    n_active = len(filter_items)
    LABEL_W  = 1.05 * inch

    if filter_items:
        f_rows = [[
            _p("APPLIED FILTERS", size=7, bold=True, color=WHITE, align="LEFT"),
            _p(f"{n_active} filter{'s' if n_active != 1 else ''} active",
               size=7, color=colors.HexColor("#B8DEDE"), align="RIGHT"),
        ]]
        for label, value in filter_items:
            f_rows.append([
                _p(label, size=7, bold=True, color=TEAL_DARK, align="LEFT"),
                _p(value, size=8.5, color=SLATE_700, align="LEFT"),
            ])
        f_tbl = Table(f_rows, colWidths=[LABEL_W, USABLE_W - LABEL_W])
        f_tbl.setStyle(TableStyle([
            ("BACKGROUND",    (0, 0), (-1, 0), TEAL),
            ("LINEBELOW",     (0, 0), (-1, 0), 1.0, TEAL_DARK),
            ("BACKGROUND",    (0, 1), (0, -1), TEAL_MID),
            ("BACKGROUND",    (1, 1), (1, -1), TEAL_LIGHT),
            ("BOX",           (0, 0), (-1, -1), 0.7, TEAL_MID),
            ("LINEAFTER",     (0, 1), (0, -1), 0.4, TEAL_MID),
            ("LINEBELOW",     (0, 1), (-1, -2), 0.3, TEAL_MID),
            ("TOPPADDING",    (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("LEFTPADDING",   (0, 0), (-1, -1), 8),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 8),
            ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ]))
    else:
        f_tbl = Table([[
            _p("FILTERS", size=6.5, bold=True, color=TEAL_DARK, align="LEFT"),
            _p("All entries — no additional filters applied", size=8, color=SLATE_400, align="LEFT"),
        ]], colWidths=[0.75 * inch, USABLE_W - 0.75 * inch])
        f_tbl.setStyle(TableStyle([
            ("BACKGROUND",    (0, 0), (-1, -1), TEAL_LIGHT),
            ("BOX",           (0, 0), (-1, -1), 0.6, TEAL_MID),
            ("LINEAFTER",     (0, 0), (0, -1),  0.5, TEAL_MID),
            ("TOPPADDING",    (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("LEFTPADDING",   (0, 0), (-1, -1), 8),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 8),
            ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ]))

    elems.append(f_tbl)
    elems.append(Spacer(1, 4 * mm))

    # ── 2. Summary cards ──────────────────────────────────────────────────
    col = USABLE_W / 3

    def _card_label(txt):
        return _p(txt, size=6.5, bold=True, color=WHITE, align="CENTER")

    def _card_amt(val, c):
        return _p(f"{sym} {val:,.2f}", size=12, bold=True, color=c, align="CENTER")

    net_label = "SURPLUS" if net >= 0 else "DEFICIT"
    s_data = [
        [_card_label("TOTAL INCOME"),                _card_label("TOTAL EXPENSES"),               _card_label(f"NET {net_label}")],
        [_card_amt(summary["total_in"], GREEN_DARK), _card_amt(summary["total_out"], RED_DARK),   _card_amt(abs(net), nc)],
    ]
    s_tbl = Table(s_data, colWidths=[col, col, col])
    s_tbl.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, 0), TEAL),
        ("BACKGROUND",    (0, 1), (-1, 1), SLATE_50),
        ("ALIGN",         (0, 0), (-1, -1), "CENTER"),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING",    (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("BOX",           (0, 0), (-1, -1), 1,   TEAL_MID),
        ("INNERGRID",     (0, 0), (-1, -1), 0.5, SLATE_200),
        ("LEFTPADDING",   (0, 0), (-1, -1), 3),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 3),
    ]))
    elems.append(s_tbl)
    elems.append(Spacer(1, 5 * mm))

    # ── 3. Entries table ──────────────────────────────────────────────────
    HDR = ["Date / Time", "Remark", "Category", "Contact", "Mode", "Cash In", "Cash Out", "Balance"]
    rows = [HDR]

    running = 0.0
    per_row_styles = []

    for i, e in enumerate(entries, 1):
        amt   = float(e["amount"])
        is_in = e["type"] == "in"
        if is_in:
            running += amt
            in_str, out_str = f"{sym} {amt:,.2f}", ""
        else:
            running -= amt
            in_str, out_str = "", f"{sym} {amt:,.2f}"

        date_str = str(e.get("entry_date", ""))[:10]
        time_str = str(e.get("entry_time") or "")[:5]
        dt_str   = f"{date_str}\n{time_str}" if time_str else date_str

        rows.append([
            dt_str,
            (e.get("remark") or "")[:32],
            (e.get("category") or "")[:14],
            (e.get("contact_name") or "")[:14],
            (e.get("payment_mode") or "").capitalize()[:9],
            in_str,
            out_str,
            f"{sym} {running:,.2f}",
        ])

        row_bg = WHITE if i % 2 == 1 else SLATE_50
        per_row_styles.append(("BACKGROUND", (0, i), (-1, i), row_bg))
        if is_in:
            per_row_styles.append(("TEXTCOLOR", (5, i), (5, i), GREEN_DARK))
            per_row_styles.append(("FONTNAME",  (5, i), (5, i), "Helvetica-Bold"))
        else:
            per_row_styles.append(("TEXTCOLOR", (6, i), (6, i), RED_DARK))
            per_row_styles.append(("FONTNAME",  (6, i), (6, i), "Helvetica-Bold"))
        bal_color = GREEN_DARK if running >= 0 else RED_DARK
        per_row_styles.append(("TEXTCOLOR", (7, i), (7, i), bal_color))

    # Totals row
    n  = len(rows)
    ti = sum(float(e["amount"]) for e in entries if e["type"] == "in")
    to = sum(float(e["amount"]) for e in entries if e["type"] == "out")
    rows.append([
        _p("TOTAL", size=7.5, bold=True, color=WHITE),
        "", "", "", "",
        _p(f"{sym} {ti:,.2f}", size=7.5, bold=True, color=GREEN_LIGHT, align="RIGHT"),
        _p(f"{sym} {to:,.2f}", size=7.5, bold=True, color=RED_LIGHT,   align="RIGHT"),
        _p(f"{sym} {running:,.2f}", size=7.5, bold=True,
           color=GREEN_LIGHT if running >= 0 else colors.HexColor("#FCA5A5"), align="RIGHT"),
    ])

    col_w = [0.90*inch, 1.55*inch, 0.82*inch, 0.82*inch, 0.65*inch, 0.90*inch, 0.90*inch, 0.95*inch]
    tbl = Table(rows, colWidths=col_w, repeatRows=1)

    base_styles = [
        # Header row
        ("BACKGROUND",    (0, 0), (-1, 0), TEAL),
        ("TEXTCOLOR",     (0, 0), (-1, 0), WHITE),
        ("FONTNAME",      (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE",      (0, 0), (-1, 0), 7.5),
        ("LINEBELOW",     (0, 0), (-1, 0), 1.2, TEAL_DARK),
        # Data rows
        ("FONTNAME",      (0, 1), (-1, -2), "Helvetica"),
        ("FONTSIZE",      (0, 1), (-1, -2), 7.5),
        ("TEXTCOLOR",     (0, 1), (-1, -2), SLATE_700),
        # Totals row
        ("BACKGROUND",    (0, n), (-1, n), TEAL_DARK),
        ("FONTNAME",      (0, n), (-1, n), "Helvetica-Bold"),
        ("LINEABOVE",     (0, n), (-1, n), 1.5, TEAL),
        # Alignment
        ("ALIGN",         (5, 0), (-1, -1), "RIGHT"),
        ("ALIGN",         (0, 0), (4, -1),  "LEFT"),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        # Grid
        ("GRID",          (0, 0), (-1, -1), 0.3, SLATE_200),
        ("LINEBELOW",     (0, -2), (-1, -2), 0.5, SLATE_200),
        # Padding
        ("TOPPADDING",    (0, 0), (-1, 0),  5),
        ("BOTTOMPADDING", (0, 0), (-1, 0),  5),
        ("TOPPADDING",    (0, 1), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 1), (-1, -1), 4),
        ("LEFTPADDING",   (0, 0), (-1, -1), 5),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 5),
    ]

    tbl.setStyle(TableStyle(base_styles + per_row_styles))
    elems.append(tbl)

    doc.build(elems, onFirstPage=_page_deco, onLaterPages=_page_deco)
    return buf.getvalue()
