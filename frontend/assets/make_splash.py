from PIL import Image, ImageDraw, ImageFont
import math, os

W, H = 1284, 2778
out = os.path.join(os.path.dirname(__file__), "splash.png")
logo_src = os.path.join(os.path.dirname(__file__), "logo1.jpg")

# ── Canvas ─────────────────────────────────────────────────────────────────────
img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)

# ── Background radial gradient (teal) ─────────────────────────────────────────
bg = Image.new("RGBA", (W, H))
bg_draw = ImageDraw.Draw(bg)

cx, cy = W // 2, int(H * 0.42)
max_r = math.hypot(W, H)

# Draw gradient rings from outside in
steps = 400
for i in range(steps, -1, -1):
    t = i / steps               # 0 = center, 1 = edge
    r_val = int(26  + (58  - 26)  * (1 - t))  # R: 26 → 58
    g_val = int(138 + (191 - 138) * (1 - t))  # G: 138 → 191
    b_val = int(138 + (191 - 138) * (1 - t))  # B: 138 → 191
    radius = int(max_r * t)
    bg_draw.ellipse(
        [cx - radius, cy - radius, cx + radius, cy + radius],
        fill=(r_val, g_val, b_val, 255)
    )

img.paste(bg, (0, 0))
draw = ImageDraw.Draw(img)

# ── Decorative blobs (semi-transparent white circles) ─────────────────────────
blob_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
blob_draw = ImageDraw.Draw(blob_layer)

blobs = [
    (int(W * 0.85), int(H * 0.1),  500, 15),
    (int(W * 0.1),  int(H * 0.28), 380, 12),
    (int(W * 0.5),  int(H * 0.88), 600, 10),
    (int(W * 0.9),  int(H * 0.55), 280, 13),
    (int(W * 0.08), int(H * 0.68), 260, 11),
]
for bx, by, br, alpha in blobs:
    blob_draw.ellipse([bx - br, by - br, bx + br, by + br], fill=(255, 255, 255, alpha))

# Ring outlines
rings = [
    (W // 2, int(H * 0.3), 700, 5),
    (W // 2, int(H * 0.72), 600, 4),
]
for rx, ry, rr, alpha in rings:
    blob_draw.ellipse([rx - rr, ry - rr, rx + rr, ry + rr],
                      outline=(255, 255, 255, alpha), width=3)

img = Image.alpha_composite(img, blob_layer)
draw = ImageDraw.Draw(img)

# ── Logo circle ───────────────────────────────────────────────────────────────
LOGO_SIZE = 260
LOGO_Y = int(H * 0.38)   # vertical center of logo

logo_raw = Image.open(logo_src).convert("RGBA")
logo_raw = logo_raw.resize((LOGO_SIZE, LOGO_SIZE), Image.LANCZOS)

# Circular mask
mask = Image.new("L", (LOGO_SIZE, LOGO_SIZE), 0)
ImageDraw.Draw(mask).ellipse([0, 0, LOGO_SIZE, LOGO_SIZE], fill=255)

# White backing circle (slightly larger for border)
BORDER = 8
TOTAL = LOGO_SIZE + BORDER * 2

# Soft shadow layer
shadow_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
shadow_draw = ImageDraw.Draw(shadow_layer)
slx = W // 2 - TOTAL // 2
sly = LOGO_Y - TOTAL // 2

# Draw blurred shadow approximation (multiple offset circles)
for offset, alpha in [(14, 20), (10, 30), (6, 40), (2, 25)]:
    shadow_draw.ellipse(
        [slx - offset, sly + offset, slx + TOTAL + offset, sly + TOTAL + offset],
        fill=(0, 0, 0, alpha)
    )
img = Image.alpha_composite(img, shadow_layer)
draw = ImageDraw.Draw(img)

# White border circle
border_circle = Image.new("RGBA", (W, H), (0, 0, 0, 0))
bc_draw = ImageDraw.Draw(border_circle)
lx = W // 2 - TOTAL // 2
ly = LOGO_Y - TOTAL // 2
bc_draw.ellipse([lx, ly, lx + TOTAL, ly + TOTAL], fill=(255, 255, 255, 230))
img = Image.alpha_composite(img, border_circle)
draw = ImageDraw.Draw(img)

# Paste logo with mask
logo_x = W // 2 - LOGO_SIZE // 2
logo_y = LOGO_Y - LOGO_SIZE // 2
img.paste(logo_raw, (logo_x, logo_y), mask)
draw = ImageDraw.Draw(img)

# ── Typography ────────────────────────────────────────────────────────────────
def try_font(size, bold=False):
    """Try to load a nice font, fall back gracefully."""
    candidates = []
    if bold:
        candidates = [
            "C:/Windows/Fonts/arialbd.ttf",
            "C:/Windows/Fonts/calibrib.ttf",
            "C:/Windows/Fonts/segoeuib.ttf",
            "C:/Windows/Fonts/verdanab.ttf",
        ]
    else:
        candidates = [
            "C:/Windows/Fonts/arial.ttf",
            "C:/Windows/Fonts/calibri.ttf",
            "C:/Windows/Fonts/segoeui.ttf",
            "C:/Windows/Fonts/verdana.ttf",
        ]
    for path in candidates:
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()

TEXT_CY = LOGO_Y + LOGO_SIZE // 2 + BORDER  # baseline start after logo

# App name
font_title = try_font(90, bold=True)
title = "Ultimate CashBook"
bbox = draw.textbbox((0, 0), title, font=font_title)
tw = bbox[2] - bbox[0]
title_y = TEXT_CY + 52
draw.text(((W - tw) // 2, title_y), title, font=font_title, fill=(255, 255, 255, 255))

# Tagline
font_tag = try_font(38, bold=False)
tagline = "Smart money tracking for your business"
bbox2 = draw.textbbox((0, 0), tagline, font=font_tag)
tgw = bbox2[2] - bbox2[0]
tag_y = title_y + 110
draw.text(((W - tgw) // 2, tag_y), tagline, font=font_tag, fill=(255, 255, 255, 178))

# Divider dots
DOT_Y = tag_y + 90
for dx in [-110, 0, 110]:
    draw.ellipse([W//2 + dx - 8, DOT_Y - 8, W//2 + dx + 8, DOT_Y + 8],
                 fill=(255, 255, 255, 90))

# Bottom text
font_bottom = try_font(28, bold=False)
bottom = "SECURE  ·  FAST  ·  SIMPLE"
bbox3 = draw.textbbox((0, 0), bottom, font=font_bottom)
bw = bbox3[2] - bbox3[0]
draw.text(((W - bw) // 2, H - 120), bottom, font=font_bottom, fill=(255, 255, 255, 100))

# ── Save ──────────────────────────────────────────────────────────────────────
final = img.convert("RGB")
final.save(out, "PNG", optimize=False)
print(f"Saved: {out}  ({W}x{H})")
