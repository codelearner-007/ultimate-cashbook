from PIL import Image
import numpy as np

src = r"d:\Coding\Coding Projects\ultimate-cashbook\frontend\assets\splash-logo.png"

img  = Image.open(src).convert("RGBA")
data = np.array(img)

# Check how many fully-transparent pixels exist vs total
total       = data.shape[0] * data.shape[1]
transparent = np.sum(data[:,:,3] == 0)
semi        = np.sum((data[:,:,3] > 0) & (data[:,:,3] < 255))
opaque      = np.sum(data[:,:,3] == 255)
print(f"Total: {total}, Transparent: {transparent}, Semi: {semi}, Opaque: {opaque}")

# Check corner pixels
print("TL corner alpha:", data[0,0,3], "RGB:", data[0,0,:3])
print("TR corner alpha:", data[0,-1,3], "RGB:", data[0,-1,:3])
print("BL corner alpha:", data[-1,0,3], "RGB:", data[-1,0,:3])
print("BR corner alpha:", data[-1,-1,3], "RGB:", data[-1,-1,:3])

# Composite onto teal to see result
teal = Image.new("RGBA", img.size, "#39AAAA")
teal.paste(img, (0,0), img)
teal.convert("RGB").save(r"d:\Coding\Coding Projects\ultimate-cashbook\check_result.png")
print("Saved check_result.png")
