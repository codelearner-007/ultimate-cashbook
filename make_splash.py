from PIL import Image

W, H = 1284, 2778
logo_path = r"d:\Coding\Coding Projects\ultimate-cashbook\frontend\assets\splash-logo.png"
out_path  = r"d:\Coding\Coding Projects\ultimate-cashbook\frontend\assets\splash.png"

logo   = Image.open(logo_path).convert("RGBA")
canvas = Image.new("RGBA", (W, H), "#39AAAA")

logo_w = 480
aspect = logo.height / logo.width
logo_h = int(logo_w * aspect)
logo   = logo.resize((logo_w, logo_h), Image.LANCZOS)

logo_x = (W - logo_w) // 2
logo_y = (H - logo_h) // 2
canvas.paste(logo, (logo_x, logo_y), logo)

canvas.convert("RGB").save(out_path, "PNG")
print("Done")
