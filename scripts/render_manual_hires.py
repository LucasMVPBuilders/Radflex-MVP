"""Re-render the brand manual at 300 DPI for crisp logo extraction.

Outputs to scripts/manual_hires/ — one PNG per page.
"""
from pathlib import Path
import fitz

pdf_path = Path(
    r"C:\Users\lukas\Desktop\MVP Builders\Radiflex\Radiflex\24339-Apresentacao-v1.pdf"
)
out_dir = Path(
    r"C:\Users\lukas\Desktop\MVP Builders\Radiflex\Radiflex\scripts\manual_hires"
)
out_dir.mkdir(parents=True, exist_ok=True)

doc = fitz.open(pdf_path)
for i, page in enumerate(doc, start=1):
    pix = page.get_pixmap(dpi=300)
    pix.save(out_dir / f"page_{i:02d}.png")
    print(f"page {i}: {pix.width}x{pix.height}")
