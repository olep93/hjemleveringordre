import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import {
  parseClickCollectText,
  scoreClickCollectScan
} from "@/lib/orders/parse-click-collect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type PositionedWord = {
  left: number;
  top: number;
  width: number;
  height: number;
  text: string;
};

function positionedWords(tsv?: string | null): PositionedWord[] {
  if (!tsv) return [];
  return tsv
    .split("\n")
    .slice(1)
    .map((line) => {
      const columns = line.split("\t");
      return {
        left: Number(columns[6]),
        top: Number(columns[7]),
        width: Number(columns[8]),
        height: Number(columns[9]),
        text: columns.slice(11).join(" ").trim()
      };
    })
    .filter((word) => word.text && Number.isFinite(word.left));
}

function spatialItemDetails(
  tsv: string | null | undefined,
  imageWidth: number
): Map<string, { quantity?: number; unit?: string }> {
  const words = positionedWords(tsv);
  const details = new Map<string, { quantity?: number; unit?: string }>();
  const gtins = words
    .map((word) => ({ word, gtin: word.text.replace(/\D/g, "") }))
    .filter(({ gtin }) => /^\d{12,14}$/.test(gtin));

  for (const { word: gtinWord, gtin } of gtins) {
    const gtinCenterY = gtinWord.top + gtinWord.height / 2;
    const rightSide = words.filter(
      (word) =>
        word.left > gtinWord.left + imageWidth * 0.42 &&
        Math.abs(word.top + word.height / 2 - gtinCenterY) <= imageWidth * 0.045
    );
    const quantityWord = rightSide
      .map((word) => ({
        word,
        match: word.text.replace(/["']/g, "").match(/^\s*(\d{1,5}(?:[.,]\d+)?)\s*$/)
      }))
      .filter(({ match }) => match)
      .sort(
        (a, b) =>
          Math.abs(a.word.top + a.word.height / 2 - gtinCenterY) -
          Math.abs(b.word.top + b.word.height / 2 - gtinCenterY)
      )[0];

    const unitWord = rightSide
      .map((word) => ({
        word,
        normalized: word.text.toLowerCase().replace(/[^a-zæøå]/g, "")
      }))
      .filter(({ normalized }) =>
        /^(?:stk|stykk|pk|pakke|sett|meter|moter|motor|aotor|ter|m)$/.test(normalized)
      )
      .sort(
        (a, b) =>
          Math.abs(a.word.top + a.word.height / 2 - gtinCenterY) -
          Math.abs(b.word.top + b.word.height / 2 - gtinCenterY)
      )[0];

    const quantity = quantityWord?.match?.[1]
      ? Number(quantityWord.match[1].replace(",", "."))
      : undefined;
    const normalizedUnit = unitWord?.normalized;
    const unit = /^(?:meter|moter|motor|aotor|ter|m)$/.test(normalizedUnit ?? "")
      ? "Meter"
      : /^(?:pk|pakke)$/.test(normalizedUnit ?? "")
        ? "Pk"
        : /^(?:sett)$/.test(normalizedUnit ?? "")
          ? "Sett"
          : /^(?:stk|stykk)$/.test(normalizedUnit ?? "")
            ? "Stk"
            : undefined;

    if (quantity || unit) details.set(gtin, { quantity, unit });
  }

  return details;
}

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

    const prepare = (topOnly: boolean) => {
      let pipeline = sharp(source, { failOn: "none" }).rotate();
      if (topOnly) {
        pipeline = pipeline.extract({ left: 0, top: 0, width, height: cropHeight });
      }
      return pipeline
        .resize({ width: targetWidth, withoutEnlargement: false })
        .grayscale()
        .normalize()
        .linear(1.18, -18)
        .sharpen({ sigma: 1.15 })
        .png({ compressionLevel: 6 })
        .toBuffer();
    };

    const prepared = await prepare(true);

    worker = await createWorker("eng");
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.AUTO,
      preserve_interword_spaces: "1",
      user_defined_dpi: "300"
    });

    const firstResult = await worker.recognize(prepared, {}, { tsv: true });
    let selectedText = firstResult.data.text;
    let selectedConfidence = firstResult.data.confidence;
    let scan = parseClickCollectText(selectedText);
    let selectedScore = scoreClickCollectScan(scan);
    let strategy = "auto-top-crop";

    // Les ordrehodet separat. På mobilbilder er tabellen og ordrehodet så ulikt
    // skalert at ett OCR-oppsett sjelden leser begge godt.
    const headerTop = Math.round(height * 0.06);
    const headerHeight = Math.min(height - headerTop, Math.round(height * 0.36));
    const headerImage = await sharp(source, { failOn: "none" })
      .rotate()
      .extract({ left: 0, top: headerTop, width, height: headerHeight })
      .resize({ width: 2400, withoutEnlargement: false })
      .grayscale()
      .normalize()
      .sharpen({ sigma: 1.1 })
      .png({ compressionLevel: 6 })
      .toBuffer();
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SPARSE_TEXT,
      preserve_interword_spaces: "1",
      user_defined_dpi: "300"
    });
    const headerResult = await worker.recognize(headerImage);
    const headerScan = parseClickCollectText(headerResult.data.text);
    scan = {
      ...scan,
      orderNumber: scan.orderNumber ?? headerScan.orderNumber,
      customerName: headerScan.customerName ?? scan.customerName,
      phone: headerScan.phone ?? scan.phone,
      email: headerScan.email ?? scan.email,
      deliveryAddress: headerScan.deliveryAddress ?? scan.deliveryAddress,
      deliveryMethod: headerScan.deliveryMethod ?? scan.deliveryMethod
    };

    // En egen tabellpass beholder ordposisjonene. Dermed kan verdiene i høyre
    // kolonner kobles til riktig GTIN selv om Tesseract returnerer kolonnevis tekst.
    const tableTop = Math.round(height * 0.34);
    const tableHeight = Math.min(height - tableTop, Math.round(height * 0.38));
    const tableWidth = 3000;
    const tableImage = await sharp(source, { failOn: "none" })
      .rotate()
      .extract({ left: 0, top: tableTop, width, height: tableHeight })
      .resize({ width: tableWidth, withoutEnlargement: false })
      .grayscale()
      .normalize()
      .sharpen({ sigma: 1.1 })
      .png({ compressionLevel: 6 })
      .toBuffer();
    const tableResult = await worker.recognize(tableImage, {}, { tsv: true });
    const primaryDetails = spatialItemDetails(firstResult.data.tsv, targetWidth);
    const tableDetails = spatialItemDetails(tableResult.data.tsv, tableWidth);
    scan.items = scan.items.map((item) => {
      const detail = {
        ...primaryDetails.get(item.articleNumber),
        ...tableDetails.get(item.articleNumber)
      };
      return {
        ...item,
        quantity: detail.quantity ?? item.quantity,
        unit: detail.unit ?? item.unit
      };
    });
    selectedText = `${selectedText}\n${headerResult.data.text}\n${tableResult.data.text}`;
    selectedConfidence = Math.max(
      selectedConfidence,
      headerResult.data.confidence,
      tableResult.data.confidence
    );
    selectedScore = scoreClickCollectScan(scan);
    strategy = "auto-header-spatial-table";

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
