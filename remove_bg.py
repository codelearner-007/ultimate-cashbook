from PIL import Image
import numpy as np
from collections import deque

src = r"d:\Coding\Coding Projects\ultimate-cashbook\frontend\assets\splash-logo.png"
dst = r"d:\Coding\Coding Projects\ultimate-cashbook\frontend\assets\splash-logo.png"

img  = Image.open(src).convert("RGBA")
data = np.array(img, dtype=np.uint8)
h, w = data.shape[:2]

# ── 1. Flood-fill from ALL edges with generous tolerance ──────────────────────
def flood_fill_bg(data, h, w, tol):
    visited = np.zeros((h, w), dtype=bool)
    queue   = deque()

    def is_bg(y, x):
        r, g, b = int(data[y, x, 0]), int(data[y, x, 1]), int(data[y, x, 2])
        # white-ish: all channels high AND low saturation
        hi  = max(r, g, b)
        lo  = min(r, g, b)
        sat = hi - lo
        return hi > (255 - tol) and sat < 40

    for x in range(w):
        for y in [0, h - 1]:
            if not visited[y, x] and is_bg(y, x):
                visited[y, x] = True
                queue.append((y, x))
    for y in range(h):
        for x in [0, w - 1]:
            if not visited[y, x] and is_bg(y, x):
                visited[y, x] = True
                queue.append((y, x))

    while queue:
        y, x = queue.popleft()
        for dy, dx in ((-1,0),(1,0),(0,-1),(0,1),(-1,-1),(-1,1),(1,-1),(1,1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and not visited[ny, nx] and is_bg(ny, nx):
                visited[ny, nx] = True
                queue.append((ny, nx))

    return visited

bg_mask = flood_fill_bg(data, h, w, tol=55)

# ── 2. Erase background pixels ────────────────────────────────────────────────
data[bg_mask, 3] = 0

# ── 3. Feather: any non-bg pixel touching a bg pixel that is still light ──────
# Build dilation of bg_mask
from scipy.ndimage import binary_dilation
dilated  = binary_dilation(bg_mask, iterations=3)
fringe   = dilated & ~bg_mask

r = data[:,:,0].astype(float)
g = data[:,:,1].astype(float)
b = data[:,:,2].astype(float)
brightness = (r + g + b) / 3.0

# For fringe pixels: alpha = how non-white they are (0=fully white → transparent)
alpha_new = np.clip((255.0 - brightness) / 60.0, 0.0, 1.0) * 255.0
data[fringe, 3] = np.minimum(data[fringe, 3], alpha_new[fringe].astype(np.uint8))

result = Image.fromarray(data, "RGBA")
result.save(dst, "PNG")
print(f"Saved {dst}")
