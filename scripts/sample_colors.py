"""Sample brand swatch colors from the brand-manual PDF page 8.

Reads the rendered PNG, picks pixels from inside each color block, and
prints HEX + HSL so we can plug values into Tailwind tokens.
"""
import colorsys
from pathlib import Path
from PIL import Image

img_path = Path(
    r"C:\Users\lukas\Desktop\MVP Builders\Radiflex\Radiflex\scripts\pdf_out_v1\page_08.png"
)
img = Image.open(img_path).convert("RGB")
w, h = img.size
print(f"Image size: {w}x{h}")


def sample(name, x_frac, y_frac, radius=8):
    cx, cy = int(w * x_frac), int(h * y_frac)
    samples = []
    for dx in range(-radius, radius + 1):
        for dy in range(-radius, radius + 1):
            samples.append(img.getpixel((cx + dx, cy + dy)))
    r = sum(s[0] for s in samples) // len(samples)
    g = sum(s[1] for s in samples) // len(samples)
    b = sum(s[2] for s in samples) // len(samples)
    h_, l_, s_ = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
    print(
        f"{name:18} hex=#{r:02X}{g:02X}{b:02X}  rgb=({r},{g},{b})  "
        f"hsl=({round(h_*360)} {round(s_*100)}% {round(l_*100)}%)"
    )


# Persian Indigo block sits lower-left, Tropical Indigo lower-right.
sample("Persian Indigo",  0.40, 0.78)
sample("Tropical Indigo", 0.78, 0.78)
