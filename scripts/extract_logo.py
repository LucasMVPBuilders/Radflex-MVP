"""Extract the RadFlex horizontal lockup from page 3 of the brand manual.

Outputs:
  public/brand/radflex-logo-color.png  — Persian + Tropical Indigo, transparent bg
  public/brand/radflex-logo-white.png  — solid white version, transparent bg
"""
from pathlib import Path

import numpy as np
from PIL import Image

src = Path(
    r"C:\Users\lukas\Desktop\MVP Builders\Radiflex\Radiflex\scripts\manual_hires\page_03.png"
)
out_dir = Path(
    r"C:\Users\lukas\Desktop\MVP Builders\Radiflex\Radiflex\public\brand"
)
out_dir.mkdir(parents=True, exist_ok=True)

img = Image.open(src).convert("RGB")
arr = np.array(img)
H, W, _ = arr.shape
print(f"Source: {W}x{H}")

# 1) Restrict search region: skip dark rail (left 20%) and skip header text (top 35%).
#    The logo sits inside a card in the lower-center of the page.
rail_end = int(W * 0.20)
top_skip = int(H * 0.35)
region = arr[top_skip:, rail_end:, :]

# 2) Find Persian Indigo pixels specifically — tighter than "any purple"
#    so we don't catch the dark-navy "MARCA" header (which has r<40, b<80).
r = region[..., 0].astype(int)
g = region[..., 1].astype(int)
b = region[..., 2].astype(int)
is_logo = (r > 40) & (b - g > 55) & (b > 90) & (b < 230)

# 3) Bounding box of those pixels — that's the logo lockup.
ys, xs = np.where(is_logo)
if len(ys) == 0:
    raise SystemExit("No logo pixels found — check thresholds.")

y0, y1 = ys.min() + top_skip, ys.max() + top_skip
x0, x1 = xs.min() + rail_end, xs.max() + rail_end
print(f"Detected logo bbox: x=[{x0},{x1}] y=[{y0},{y1}]")

# 4) Pad and crop.
pad = 80
x0p = max(0, x0 - pad)
y0p = max(0, y0 - pad)
x1p = min(W, x1 + pad)
y1p = min(H, y1 + pad)
logo = img.crop((x0p, y0p, x1p, y1p))

# 5) Convert white to transparent — use alpha proportional to distance from white
#    so anti-aliased edges stay smooth instead of jagged.
logo_rgba = logo.convert("RGBA")
data = np.array(logo_rgba)
rgb = data[..., :3].astype(int)

# Distance from pure white in 0..1 (1 = pure logo color, 0 = pure white).
white_dist = (255 - rgb).max(axis=-1) / 255.0
alpha = np.clip(white_dist * 1.4, 0, 1)  # gentle gamma so faint edges stay visible
data[..., 3] = (alpha * 255).astype(np.uint8)

# Premultiply: anywhere mostly transparent, snap RGB to actual logo color
# so blending against any bg stays accurate.
Image.fromarray(data, "RGBA").save(out_dir / "radflex-logo-color.png")
print(f"Wrote {out_dir / 'radflex-logo-color.png'}  ({data.shape[1]}x{data.shape[0]})")

# 6) White variant — keep alpha, force RGB=255.
white_data = data.copy()
white_data[..., :3] = 255
Image.fromarray(white_data, "RGBA").save(out_dir / "radflex-logo-white.png")
print(f"Wrote {out_dir / 'radflex-logo-white.png'}")
