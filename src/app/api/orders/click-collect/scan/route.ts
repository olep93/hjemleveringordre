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
  anchorTsv: string | null | undefined,
  valueTsv: string | null | undefined,
  imageWidth: number,
  quantityColumnOnly = false
): Map<string, { quantity?: number; unit?: string }> {
  const anchors = positionedWords(anchorTsv);
  const words = positionedWords(valueTsv);
  const details = new Map<string, { quantity?: number; unit?: string }>();
  const gtins = anchors
    .map((word) => ({ word, gtin: word.text.replace(/\D/g, "") }))
    .filter(({ gtin }) => /^\d{12,14}$/.test(gtin));
  const quantityHeader = words.find(
    (word) => word.text.toLowerCase().replace(/[^a-z]/g, "") === "antall"
  );

  for (const { word: gtinWord, gtin } of gtins) {
    const gtinCenterY = gtinWord.top + gtinWord.height / 2;
    const rightSide = words.filter(
      (word) =>
        word.left > gtinWord.left + imageWidth * 0.42 &&
        Math.abs(word.top + word.height / 2 - gtinCenterY) <= imageWidth * 0.045
    );
    const quantityWord = rightSide
      .filter((word) =>
        !quantityColumnOnly ||
        (quantityHeader
          ? word.left >= quantityHeader.left - imageWidth * 0.06
          : word.left >= imageWidth * 0.58)
      )
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

    const parsedQuantity = quantityWord?.match?.[1]
      ? Number(quantityWord.match[1].replace(",", "."))
      : undefined;
    const quantity =
      parsedQuantity && parsedQuantity > 0 && parsedQuantity <= 10000
        ? parsedQuantity
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
    const targetWidth = Math.min(2600, Math.max(1800, documentBounds.width));
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

    const firstResult = await worker.recognize(prepared, {}, { tsv: true });
    let selectedText = firstResult.data.text;
    let selectedConfidence = firstResult.data.confidence;
    let scan = parseClickCollectText(selectedText);
    let selectedScore = scoreClickCollectScan(scan);
    let strategy = "document-relative-regions";

    // Når arket er funnet kan ordrehodet leses relativt til selve arket, ikke
    // mobilbildet. Dette tåler både bakgrunn, ulik kameraavstand og forskyvning.
    const headerTop = Math.min(
      height - 1,
      detectedBounds.top + Math.round(detectedBounds.height * 0.06)
    );
    const headerHeight = Math.max(
      1,
      Math.min(
        height - headerTop,
        Math.round(detectedBounds.height * 0.4)
      )
    );
    const headerImage = await sharp(source, { failOn: "none" })
      .rotate()
      .extract({
        left: detectedBounds.left,
        top: headerTop,
        width: detectedBounds.width,
        height: headerHeight
      })
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
      customerName:
        [scan.customerName, headerScan.customerName]
          .filter((value): value is string => Boolean(value))
          .sort((a, b) => b.length - a.length)[0] ?? null,
      phone:
        [headerScan.phone, scan.phone].find((value) => value?.length === 8) ??
        headerScan.phone ??
        scan.phone,
      email: headerScan.email ?? scan.email,
      deliveryAddress: headerScan.deliveryAddress ?? scan.deliveryAddress,
      deliveryMethod: headerScan.deliveryMethod ?? scan.deliveryMethod
    };

    // Tabellen finnes også relativt til arket. En spredt tekstpass beholder
    // kolonneposisjoner, slik at Antall/Enhet kan kobles til nærmeste GTIN.
    const tableTop = Math.min(
      height - 1,
      detectedBounds.top + Math.round(detectedBounds.height * 0.375)
    );
    const tableHeight = Math.max(
      1,
      Math.min(
        height - tableTop,
        Math.round(detectedBounds.height * 0.42)
      )
    );
    const tableWidth = 3000;
    const tableImage = await sharp(source, { failOn: "none" })
      .rotate()
      .extract({
        left: detectedBounds.left,
        top: tableTop,
        width: detectedBounds.width,
        height: tableHeight
      })
      .resize({ width: tableWidth, withoutEnlargement: false })
      .grayscale()
      .normalize()
      .sharpen({ sigma: 1.1 })
      .png({ compressionLevel: 6 })
      .toBuffer();
    const tableResult = await worker.recognize(tableImage, {}, { tsv: true });
    const tableScan = parseClickCollectText(tableResult.data.text);
    for (const tableItem of tableScan.items) {
      if (!scan.items.some((item) => item.articleNumber === tableItem.articleNumber)) {
        scan.items.push(tableItem);
      }
    }
    const primaryDetails = spatialItemDetails(
      firstResult.data.tsv,
      firstResult.data.tsv,
      targetWidth,
      true
    );
    const tableDetails = spatialItemDetails(
      tableResult.data.tsv,
      tableResult.data.tsv,
      tableWidth,
      true
    );
    scan.items = scan.items.map((item) => {
      const primaryDetail = primaryDetails.get(item.articleNumber);
      const tableDetail = tableDetails.get(item.articleNumber);
      const tableQuantity =
        tableDetail?.quantity &&
        (tableDetail.quantity <= 50 || tableDetail.unit)
          ? tableDetail.quantity
          : undefined;
      const primaryQuantity =
        primaryDetail?.quantity &&
        (primaryDetail.quantity <= 50 || primaryDetail.unit)
          ? primaryDetail.quantity
          : undefined;
      const detectedQuantity = tableQuantity ?? primaryQuantity;
      const itemText = `${item.description} ${item.model ?? ""}`;
      const looksLikeModelNumber = detectedQuantity
        ? new RegExp(
            `(?:\\bA\\s*${detectedQuantity}\\b|\\bM(?:M)?[- ]?${detectedQuantity}\\s*PK\\b)`,
            "i"
          ).test(itemText)
        : false;
      return {
        ...item,
        quantity:
          !looksLikeModelNumber && detectedQuantity
            ? detectedQuantity
            : item.quantity,
        unit:
          tableDetail?.unit ??
          primaryDetail?.unit ??
          item.unit
      };
    });
    selectedText = `${selectedText}\n${headerResult.data.text}\n${tableResult.data.text}`;
    selectedConfidence = Math.max(
      selectedConfidence,
      headerResult.data.confidence,
      tableResult.data.confidence
    );
    selectedScore = scoreClickCollectScan(scan);

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
        documentBounds,
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
