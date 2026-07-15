import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import {
  parseClickCollectText,
  scoreClickCollectScan
} from "@/lib/orders/parse-click-collect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  let worker: import("tesseract.js").Worker | null = null;

  try {
    await requireRole(["EMPLOYEE", "MANAGER", "ADMIN"]);
    const form = await request.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Velg et bilde av Klikk & Hent-ordren." }, { status: 400 });
    }
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "Skanneren støtter bildefiler." }, { status: 415 });
    }

    const [{ default: sharp }, { createWorker, PSM }] = await Promise.all([
      import("sharp"),
      import("tesseract.js")
    ]);

    const source = Buffer.from(await file.arrayBuffer());
    const metadata = await sharp(source).metadata();
    const longSide = Math.max(metadata.width ?? 0, metadata.height ?? 0);
    const scale = longSide > 2200 ? 2200 / longSide : 1;

    const prepared = await sharp(source)
      .rotate()
      .resize({
        width: metadata.width ? Math.round(metadata.width * scale) : undefined,
        height: metadata.height ? Math.round(metadata.height * scale) : undefined,
        fit: "inside",
        withoutEnlargement: true
      })
      .grayscale()
      .normalize()
      .sharpen({ sigma: 1 })
      .png()
      .toBuffer();

    worker = await createWorker("eng");
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.AUTO,
    });

    const result = await worker.recognize(prepared);
    let scan = parseClickCollectText(result.data.text);
    let orientation = 0;

    // Mobilbilder kan mangle/ha feil EXIF-retning. Prøv én 90°-variant dersom
    // første resultat ikke inneholder en varelinje eller ordrenummer.
    if (scoreClickCollectScan(scan) < 35) {
      const rotated = await sharp(prepared).rotate(90).png().toBuffer();
      const rotatedResult = await worker.recognize(rotated);
      const rotatedScan = parseClickCollectText(rotatedResult.data.text);
      if (scoreClickCollectScan(rotatedScan) > scoreClickCollectScan(scan)) {
        scan = rotatedScan;
        orientation = 90;
      }
    }

    return NextResponse.json({
      ok: true,
      scan,
      confidence: result.data.confidence,
      orientation,
      diagnostics: {
        textLength: scan.rawText.length,
        itemCount: scan.items.length,
        score: scoreClickCollectScan(scan)
      }
    });
  } catch (error) {
    console.error("Click & Collect OCR failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Bildet kunne ikke skannes." },
      { status: 500 }
    );
  } finally {
    await worker?.terminate().catch(() => undefined);
  }
}
