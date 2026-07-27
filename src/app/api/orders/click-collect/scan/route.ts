import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import {
  parseClickCollectText,
  scoreClickCollectScan
} from "@/lib/orders/parse-click-collect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function looksLikeSupportedImage(file: File): boolean {
  if (file.type.startsWith("image/")) return true;
  return /\.(?:jpe?g|png|webp|heic|heif)$/i.test(file.name);
}

export async function POST(request: NextRequest) {
  let worker: import("tesseract.js").Worker | null = null;

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

    // Klikk & Hent-lappen har normalt all relevant tekst i øvre 60–70 % av arket.
    // Å beskjære den store tomme nederdelen gjør OCR både raskere og mer presis.
    const cropHeight = Math.max(1, Math.min(height, Math.round(height * 0.72)));
    const targetWidth = Math.min(2800, Math.max(1800, width));

    const prepared = await base
      .extract({ left: 0, top: 0, width, height: cropHeight })
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

    const firstResult = await worker.recognize(prepared);
    let selectedText = firstResult.data.text;
    let selectedConfidence = firstResult.data.confidence;
    let scan = parseClickCollectText(selectedText);
    let selectedScore = scoreClickCollectScan(scan);
    let strategy = "auto-top-crop";

    // Tabeller fra mobilbilder kan bli lest bedre som spredt tekst. Kjør bare et
    // ekstra forsøk når første resultat faktisk er svakt, slik at normal skanning
    // fortsatt holder seg innenfor Vercels kjøretidsgrense.
    if (selectedScore < 40) {
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SPARSE_TEXT,
        preserve_interword_spaces: "1",
        user_defined_dpi: "300"
      });
      const sparseResult = await worker.recognize(prepared);
      const sparseScan = parseClickCollectText(sparseResult.data.text);
      const sparseScore = scoreClickCollectScan(sparseScan);

      if (sparseScore > selectedScore) {
        selectedText = sparseResult.data.text;
        selectedConfidence = sparseResult.data.confidence;
        scan = sparseScan;
        selectedScore = sparseScore;
        strategy = "sparse-top-crop";
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
            strategy
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
        cropHeight,
        textLength: scan.rawText.length,
        itemCount: scan.items.length,
        score: selectedScore,
        strategy
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
