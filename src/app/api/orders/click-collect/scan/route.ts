import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import {
  parseClickCollectText,
  scoreClickCollectScan
} from "@/lib/orders/parse-click-collect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function detectDocumentBounds(
  source: Buffer,
  sharp: typeof import("sharp"),
  width: number,
  height: number
): Promise<{ left: number; top: number; width: number; height: number }> {
  const detectionWidth = 240;
  const { data, info } = await sharp(source, { failOn: "none" })
    .rotate()
    .resize({ width: detectionWidth })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const visited = new Uint8Array(info.width * info.height);
  let best: { count: number; minX: number; minY: number; maxX: number; maxY: number } | null = null;

  for (let start = 0; start < data.length; start++) {
    if (visited[start] || data[start] < 125) continue;
    const queue = [start];
    visited[start] = 1;
    let cursor = 0;
    let count = 0;
    let minX = info.width;
    let minY = info.height;
    let maxX = 0;
    let maxY = 0;

    while (cursor < queue.length) {
      const index = queue[cursor++];
      const x = index % info.width;
      const y = Math.floor(index / info.width);
      count++;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);

      const neighbors = [index - 1, index + 1, index - info.width, index + info.width];
      for (const neighbor of neighbors) {
        if (neighbor < 0 || neighbor >= data.length || visited[neighbor]) continue;
        const neighborX = neighbor % info.width;
        if (Math.abs(neighborX - x) > 1 || data[neighbor] < 125) continue;
        visited[neighbor] = 1;
        queue.push(neighbor);
      }
    }

    if (!best || count > best.count) best = { count, minX, minY, maxX, maxY };
  }

  if (
    !best ||
    best.count < info.width * info.height * 0.12 ||
    best.maxX - best.minX < info.width * 0.45 ||
    best.maxY - best.minY < info.height * 0.45
  ) {
    return { left: 0, top: 0, width, height };
  }

  const padding = 4;
  const scaleX = width / info.width;
  const scaleY = height / info.height;
  const left = Math.max(0, Math.floor((best.minX - padding) * scaleX));
  const top = Math.max(0, Math.floor((best.minY - padding) * scaleY));
  const right = Math.min(width, Math.ceil((best.maxX + padding + 1) * scaleX));
  const bottom = Math.min(height, Math.ceil((best.maxY + padding + 1) * scaleY));
  return { left, top, width: right - left, height: bottom - top };
}

function looksLikeSupportedImage(file: File): boolean {
  if (file.type.startsWith("image/")) return true;
  return /\.(?:jpe?g|png|webp|heic|heif)$/i.test(file.name);
}

export async function POST(request: NextRequest) {
  let worker: import("tesseract.js").Worker | null = null;
  const scanStartedAt = Date.now();

  try {
    await requireRole(["EMPLOYEE", "MANAGER", "ADMIN"]);
    const form = await request.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Velg eller fotografer en Klikk & Hent-ordrelapp." },
        { status: 400 }
      );
    }
    if (!looksLikeSupportedImage(file)) {
      return NextResponse.json(
        { error: "Skanneren støtter JPG, PNG, WEBP og bilder fra mobilkamera." },
        { status: 415 }
      );
    }

    const [{ default: sharp }, { createWorker, PSM }] = await Promise.all([
      import("sharp"),
      import("tesseract.js")
    ]);

    const source = Buffer.from(await file.arrayBuffer());
    if (!source.length) {
      return NextResponse.json({ error: "Bildefilen er tom." }, { status: 400 });
    }

    // Sharp validerer samtidig at det faktisk er et lesbart bilde. rotate() bruker
    // EXIF-retning fra mobilkamera, slik at OCR alltid får arket riktig vei.
    const base = sharp(source, { failOn: "none" }).rotate();
    const metadata = await base.metadata();
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;

    if (!width || !height) {
      return NextResponse.json(
        { error: "Bildet kunne ikke åpnes. Prøv å ta bildet på nytt som JPG." },
        { status: 415 }
      );
    }

    // Finn den største sammenhengende lyse flaten først. Dermed normaliseres
    // arket uavhengig av kameraavstand og hvor mye bakgrunn bildet inneholder.
    const detectedBounds = await detectDocumentBounds(source, sharp, width, height);
    // Ordreinnholdet ligger øverst på det påviste arket. Den nederste delen er
    // normalt blank og fjernes først etter at selve arket er funnet.
    const documentBounds = {
      ...detectedBounds,
      height: Math.max(
        1,
        Math.min(
          detectedBounds.height,
          Math.round((detectedBounds.height * 0.8) / 16) * 16
        )
      )
    };
    const targetWidth = Math.min(2200, Math.max(1800, documentBounds.width));
    const prepared = await sharp(source, { failOn: "none" })
      .rotate()
      .extract(documentBounds)
      .resize({ width: targetWidth, withoutEnlargement: false })
      .grayscale()
      .normalize()
      .linear(1.18, -18)
      .sharpen({ sigma: 1.15 })
      .png({ compressionLevel: 6 })
      .toBuffer();

    worker = await createWorker("eng");
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.AUTO,
      preserve_interword_spaces: "1",
      user_defined_dpi: "300"
    });

    const firstOcrStartedAt = Date.now();
    const firstResult = await worker.recognize(prepared);
    const firstOcrMs = Date.now() - firstOcrStartedAt;
    let selectedText = firstResult.data.text;
    let selectedConfidence = firstResult.data.confidence;
    let scan = parseClickCollectText(selectedText);
    let selectedScore = scoreClickCollectScan(scan);
    let strategy = "fast-auto-document";

    // Produksjonsfunksjonen har en stram tidsgrense. Når første pass finner
    // varelinjer returneres resultatet med én gang. Et ekstra pass kjøres bare
    // når første pass fant null varer.
    if (scan.items.length === 0 && Date.now() - scanStartedAt < 25_000) {
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SPARSE_TEXT,
        preserve_interword_spaces: "1",
        user_defined_dpi: "300"
      });
      const sparseResult = await worker.recognize(prepared);
      const sparseScan = parseClickCollectText(sparseResult.data.text);
      const sparseScore = scoreClickCollectScan(sparseScan);
      if (sparseScore > selectedScore) {
        scan = sparseScan;
        selectedText = sparseResult.data.text;
        selectedConfidence = sparseResult.data.confidence;
        selectedScore = sparseScore;
        strategy = "fallback-sparse-document";
      }
    }

    if (!scan.orderNumber && !scan.customerName && scan.items.length === 0) {
      return NextResponse.json(
        {
          error:
            "Bildet ble behandlet, men teksten på ordrelappen kunne ikke leses. Hold kameraet nærmere, fyll arket i bildet og unngå skygger eller gjenskinn.",
          diagnostics: {
            textLength: selectedText.trim().length,
            confidence: selectedConfidence,
            strategy,
            firstOcrMs,
            totalMs: Date.now() - scanStartedAt
          }
        },
        { status: 422 }
      );
    }

    return NextResponse.json({
      ok: true,
      scan,
      confidence: selectedConfidence,
      orientation: 0,
      diagnostics: {
        sourceType: file.type || "unknown",
        sourceName: file.name,
        sourceWidth: width,
        sourceHeight: height,
        documentBounds,
        textLength: scan.rawText.length,
        itemCount: scan.items.length,
        score: selectedScore,
        strategy,
        firstOcrMs,
        totalMs: Date.now() - scanStartedAt
      }
    });
  } catch (error) {
    console.error("Click & Collect OCR failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `Bildet kunne ikke skannes: ${error.message}`
            : "Bildet kunne ikke skannes."
      },
      { status: 500 }
    );
  } finally {
    await worker?.terminate().catch(() => undefined);
  }
}
