"""Extract text + render pages from a PDF for analysis."""
import sys
from pathlib import Path
import fitz  # PyMuPDF

pdf_path = Path(sys.argv[1])
out_dir = Path(sys.argv[2])
out_dir.mkdir(parents=True, exist_ok=True)

doc = fitz.open(pdf_path)
print(f"Pages: {len(doc)}")

text_path = out_dir / "text.txt"
with text_path.open("w", encoding="utf-8") as f:
    for i, page in enumerate(doc, start=1):
        f.write(f"\n===== PAGE {i} =====\n")
        f.write(page.get_text())

for i, page in enumerate(doc, start=1):
    pix = page.get_pixmap(dpi=150)
    pix.save(out_dir / f"page_{i:02d}.png")

print(f"Wrote text to {text_path}")
print(f"Wrote {len(doc)} page images to {out_dir}")
