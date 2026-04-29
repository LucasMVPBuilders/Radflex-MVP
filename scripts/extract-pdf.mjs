import { createCanvas } from "@napi-rs/canvas";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { basename, join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

const pdfs = [
  "C:/Users/lukas/Desktop/MVP Builders/Radiflex/Radiflex/Apresentação Radflex.pdf",
  "C:/Users/lukas/Desktop/MVP Builders/Radiflex/Radiflex/24339-Apresentacao-v1.pdf",
];

const outDir = resolve(process.env.TEMP || "/tmp", "radflex-pdf-extract");
mkdirSync(outDir, { recursive: true });

const SCALE = 1.6;

async function renderPdf(pdfPath) {
  const slug = basename(pdfPath, ".pdf").replace(/\s+/g, "_").replace(/[^\w-]/g, "");
  console.log(`\nProcessing: ${pdfPath}\n  → slug: ${slug}`);

  const data = new Uint8Array(readFileSync(pdfPath));
  const doc = await pdfjs.getDocument({
    data,
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
  }).promise;
  console.log(`  ${doc.numPages} pages`);

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale: SCALE });
    const canvas = createCanvas(viewport.width, viewport.height);
    const ctx = canvas.getContext("2d");

    await page.render({ canvasContext: ctx, viewport }).promise;

    const filename = join(outDir, `${slug}__p${String(i).padStart(2, "0")}.png`);
    writeFileSync(filename, canvas.toBuffer("image/png"));
    console.log(`    p${i}: ${filename}`);
  }
}

for (const p of pdfs) {
  try {
    await renderPdf(p);
  } catch (e) {
    console.error(`FAIL on ${p}:`, e.message);
  }
}

console.log(`\nAll output in: ${outDir}`);
