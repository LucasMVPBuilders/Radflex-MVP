"""Sample hero background of the commercial deck (page 1) to ground gradient endpoints."""
import colorsys
from pathlib import Path
from PIL import Image

img_path = Path(
    r"C:\Users\lukas\Desktop\MVP Builders\Radiflex\Radiflex\scripts\pdf_out_radflex\page_01.png"
)
img = Image.open(img_path).convert("RGB")
w, h = img.size

def sample(name, x_frac, y_frac, radius=12):
    cx, cy = int(w * x_frac), int(h * y_frac)
    samples = []
    for dx in range(-radius, radius + 1):
        for dy in range(-radius, radius + 1):
            samples.append(img.getpixel((cx + dx, cy + dy)))
    r = sum(s[0] for s in samples) // len(samples)
    g = sum(s[1] for s in samples) // len(samples)
    b = sum(s[2] for s in samples) // len(samples)
    h_, l_, s_ = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
    print(f"{name:14} #{r:02X}{g:02X}{b:02X}  hsl=({round(h_*360)} {round(s_*100)}% {round(l_*100)}%)")

sample("hero top",     0.05, 0.04)   # deep top of gradient
sample("hero middle",  0.05, 0.50)
sample("hero bottom",  0.95, 0.96)   # end of gradient
sample("section-mid",  0.05, 0.65)
