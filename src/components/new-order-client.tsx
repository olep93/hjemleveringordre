"use client";

import Link from "next/link";
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  ClipboardPaste,
  FileText,
  FileUp,
  LoaderCircle,
  Plus,
  ScanLine,
  Search,
  Trash2
} from "lucide-react";
import { useRouter } from "next/navigation";
import { parseClickCollectText } from "@/lib/orders/parse-click-collect";
import {
  ChangeEvent,
  ClipboardEvent,
  DragEvent,
  FormEvent,
  useRef,
  useState
} from "react";

type Line = {
  articleNumber: string;
  description: string;
  quantity: string;
  unit: string;
  model?: string;
  lookupStatus?: string;
};

type Fields = {
  orderNumber: string;
  customerName: string;
  phone: string;
  deliveryAddress: string;
  deliveryDate: string;
  createdBy: string;
  comment: string;
};

const emptyFields: Fields = {
  orderNumber: "",
  customerName: "",
  phone: "",
  deliveryAddress: "",
  deliveryDate: "",
  createdBy: "",
  comment: ""
};

function isImageFile(file: File): boolean {
  return file.type.startsWith("image/") || /\.(?:jpe?g|png|webp|heic|heif)$/i.test(file.name);
}

async function compressForUpload(file: File): Promise<File> {
  if (file.size <= 2_500_000) return file;

  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();

    const maxSide = 2200;
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    let compressed: Blob | null = null;
    for (const quality of [0.86, 0.76, 0.66]) {
      compressed = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", quality)
      );
      if (compressed && compressed.size <= 2_500_000) break;
    }

    if (!compressed) return file;
    const basename = file.name.replace(/\.[^.]+$/, "") || "klikk-hent";
    return new File([compressed], `${basename}.jpg`, {
      type: "image/jpeg",
      lastModified: file.lastModified
    });
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function detectDocumentBoundsInBrowser(image: HTMLImageElement) {
  const detection = document.createElement("canvas");
  detection.width = 240;
  detection.height = Math.max(
    1,
    Math.round((image.naturalHeight * detection.width) / image.naturalWidth)
  );
  const context = detection.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return { left: 0, top: 0, width: image.naturalWidth, height: image.naturalHeight };
  }
  context.drawImage(image, 0, 0, detection.width, detection.height);
  const pixels = context.getImageData(0, 0, detection.width, detection.height).data;
  const visited = new Uint8Array(detection.width * detection.height);
  let best: {
    count: number;
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  } | null = null;

  for (let start = 0; start < visited.length; start++) {
    const pixel = start * 4;
    const gray = pixels[pixel] * 0.299 + pixels[pixel + 1] * 0.587 + pixels[pixel + 2] * 0.114;
    if (visited[start] || gray < 125) continue;
    const queue = [start];
    visited[start] = 1;
    let cursor = 0;
    let count = 0;
    let minX = detection.width;
    let minY = detection.height;
    let maxX = 0;
    let maxY = 0;

    while (cursor < queue.length) {
      const index = queue[cursor++];
      const x = index % detection.width;
      const y = Math.floor(index / detection.width);
      count++;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);

      for (const neighbor of [index - 1, index + 1, index - detection.width, index + detection.width]) {
        if (neighbor < 0 || neighbor >= visited.length || visited[neighbor]) continue;
        const neighborX = neighbor % detection.width;
        const neighborPixel = neighbor * 4;
        const neighborGray =
          pixels[neighborPixel] * 0.299 +
          pixels[neighborPixel + 1] * 0.587 +
          pixels[neighborPixel + 2] * 0.114;
        if (Math.abs(neighborX - x) > 1 || neighborGray < 125) continue;
        visited[neighbor] = 1;
        queue.push(neighbor);
      }
    }
    if (!best || count > best.count) best = { count, minX, minY, maxX, maxY };
  }

  if (
    !best ||
    best.count < detection.width * detection.height * 0.12 ||
    best.maxX - best.minX < detection.width * 0.45 ||
    best.maxY - best.minY < detection.height * 0.45
  ) {
    return { left: 0, top: 0, width: image.naturalWidth, height: image.naturalHeight };
  }

  const padding = 4;
  const scaleX = image.naturalWidth / detection.width;
  const scaleY = image.naturalHeight / detection.height;
  const left = Math.max(0, Math.floor((best.minX - padding) * scaleX));
  const top = Math.max(0, Math.floor((best.minY - padding) * scaleY));
  const right = Math.min(image.naturalWidth, Math.ceil((best.maxX + padding + 1) * scaleX));
  const bottom = Math.min(image.naturalHeight, Math.ceil((best.maxY + padding + 1) * scaleY));
  return { left, top, width: right - left, height: bottom - top };
}

function cropCanvas(
  source: HTMLCanvasElement,
  topRatio: number,
  heightRatio: number,
  targetWidth: number
): HTMLCanvasElement {
  const top = Math.round(source.height * topRatio);
  const height = Math.max(1, Math.min(source.height - top, Math.round(source.height * heightRatio)));
  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = Math.max(1, Math.round((height * targetWidth) / source.width));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Nettleseren kunne ikke lage bildeutsnitt.");
  context.drawImage(source, 0, top, source.width, height, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function cropGtinColumn(table: HTMLCanvasElement): HTMLCanvasElement {
  const sourceWidth = Math.round(table.width * 0.34);
  const canvas = document.createElement("canvas");
  canvas.width = 1800;
  canvas.height = Math.max(1, Math.round((table.height * canvas.width) / sourceWidth));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Nettleseren kunne ikke lese GTIN-kolonnen.");
  context.drawImage(
    table,
    0,
    0,
    sourceWidth,
    table.height,
    0,
    0,
    canvas.width,
    canvas.height
  );
  return canvas;
}

type PositionedWord = {
  left: number;
  top: number;
  width: number;
  height: number;
  text: string;
};

// Mobilbildet er tatt litt nedenfra og fra venstre. En fysisk tabellrad stiger
// derfor mot høyre i det normaliserte bildet, i stedet for å være vannrett.
const TABLE_ROW_SLOPE = -0.035;

function projectedRowY(anchor: PositionedWord, targetX: number): number {
  const anchorX = anchor.left + anchor.width / 2;
  return anchor.top + anchor.height / 2 + (targetX - anchorX) * TABLE_ROW_SLOPE;
}

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
  const quantityHeader = words.find(
    (word) => word.text.toLowerCase().replace(/[^a-z]/g, "") === "antall"
  );
  const unitHeader = words.find(
    (word) => word.text.toLowerCase().replace(/[^a-z]/g, "") === "enhet"
  );

  for (const gtinWord of words) {
    const gtin = gtinWord.text.replace(/\D/g, "");
    if (!/^\d{12,14}$/.test(gtin)) continue;
    const rowWords = words.filter(
      (word) =>
        word.left > gtinWord.left + imageWidth * 0.42 &&
        Math.abs(
          word.top + word.height / 2 -
            projectedRowY(gtinWord, word.left + word.width / 2)
        ) <= imageWidth * 0.025
    );
    const quantityWord = rowWords
      .filter((word) =>
        word.left >=
        Math.max(
          imageWidth * 0.8,
          quantityHeader ? quantityHeader.left - imageWidth * 0.06 : 0
        )
      )
      .map((word) => ({
        word,
        match: word.text.replace(/["']/g, "").match(/^\s*(\d{1,5}(?:[.,]\d+)?)\s*$/)
      }))
      .filter(({ match }) => match)
      .sort(
        (a, b) =>
          Math.abs(
            a.word.top + a.word.height / 2 -
              projectedRowY(gtinWord, a.word.left + a.word.width / 2)
          ) -
          Math.abs(
            b.word.top + b.word.height / 2 -
              projectedRowY(gtinWord, b.word.left + b.word.width / 2)
          )
      )[0];
    const unitWord = rowWords
      .filter((word) =>
        unitHeader ? word.left >= unitHeader.left - imageWidth * 0.02 : true
      )
      .map((word) => ({
        word,
        normalized: word.text.toLowerCase().replace(/[^a-zæøå]/g, "")
      }))
      .filter(({ normalized }) =>
        /^(?:stk|stykk|pk|pakke|sett|meter|meler|moter|motor|aotor|ter|m)$/.test(normalized)
      )
      .sort(
        (a, b) =>
          Math.abs(
            a.word.top + a.word.height / 2 -
              projectedRowY(gtinWord, a.word.left + a.word.width / 2)
          ) -
          Math.abs(
            b.word.top + b.word.height / 2 -
              projectedRowY(gtinWord, b.word.left + b.word.width / 2)
          )
      )[0];
    const parsedQuantity = quantityWord?.match?.[1]
      ? Number(quantityWord.match[1].replace(",", "."))
      : undefined;
    const quantity =
      parsedQuantity && parsedQuantity > 0 && parsedQuantity <= 10000
        ? parsedQuantity
        : undefined;
    const normalizedUnit = unitWord?.normalized;
    const unit = /^(?:meter|meler|moter|motor|aotor|ter|m)$/.test(normalizedUnit ?? "")
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

async function prepareForBrowserOcr(file: File): Promise<{
  document: HTMLCanvasElement;
  header: HTMLCanvasElement;
  table: HTMLCanvasElement;
  gtins: HTMLCanvasElement;
}> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();

    const bounds = detectDocumentBoundsInBrowser(image);
    // Finn arket før utsnittet tas, slik at kameraavstand og mørk bakgrunn ikke
    // flytter områdene parseren skal lese.
    const sourceHeight = Math.max(1, Math.round(bounds.height * 0.8));
    const targetWidth = Math.min(2200, Math.max(1800, bounds.width));
    const scale = targetWidth / bounds.width;
    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = Math.max(1, Math.round(sourceHeight * scale));
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Nettleseren kunne ikke klargjøre bildet.");
    context.drawImage(
      image,
      bounds.left,
      bounds.top,
      bounds.width,
      sourceHeight,
      0,
      0,
      canvas.width,
      canvas.height
    );

    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    for (let index = 0; index < pixels.data.length; index += 4) {
      const gray =
        pixels.data[index] * 0.299 +
        pixels.data[index + 1] * 0.587 +
        pixels.data[index + 2] * 0.114;
      const enhanced = Math.max(0, Math.min(255, gray * 1.18 - 18));
      pixels.data[index] = enhanced;
      pixels.data[index + 1] = enhanced;
      pixels.data[index + 2] = enhanced;
    }
    context.putImageData(pixels, 0, 0);
    const table = cropCanvas(canvas, 0.45, 0.54, 3000);
    return {
      document: canvas,
      header: cropCanvas(canvas, 0.04, 0.43, 2200),
      table,
      gtins: cropGtinColumn(table)
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function responseJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    if (response.status === 413) {
      return { error: "Bildet er for stort til å lastes opp. Velg lavere oppløsning eller ta bildet litt nærmere arket." };
    }
    return { error: `Tjenesten svarte med feilkode ${response.status}. Prøv på nytt.` };
  }
}

async function lookupProductByEan(ean: string): Promise<{
  name: string;
  productUrl: string;
} | null> {
  const response = await fetch(`/api/products/lookup?ean=${encodeURIComponent(ean)}`, {
    cache: "no-store"
  });
  const result = await responseJson(response);
  if (!response.ok) throw new Error(String(result.error ?? "Vareoppslaget feilet."));
  const product = result.product as
    | { name?: string; productUrl?: string }
    | null
    | undefined;
  if (!product?.name) return null;
  return { name: product.name, productUrl: product.productUrl ?? "" };
}

export default function NewOrderPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"STANDARD" | "CLICK_AND_COLLECT">("STANDARD");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [fields, setFields] = useState<Fields>(emptyFields);
  const [lines, setLines] = useState<Line[]>([
    { articleNumber: "", description: "", quantity: "", unit: "Stk" }
  ]);
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lookingUpLines, setLookingUpLines] = useState<Set<number>>(new Set());

  const click = mode === "CLICK_AND_COLLECT";

  function updateField(name: keyof Fields, value: string) {
    setFields((current) => ({ ...current, [name]: value }));
  }

  async function scanClickCollect(next: File) {
    if (!isImageFile(next)) return;

    setScanning(true);
    setScanMessage("Behandler kamerabildet og leser kundenavn, ordre og varelinjer …");
    setError(null);

    try {
      const prepared = await prepareForBrowserOcr(next);
      setScanMessage("Starter tekstlesing direkte på telefonen …");
      const { createWorker, PSM } = await import("tesseract.js");
      const worker = await createWorker("eng", undefined, {
        logger: (message) => {
          if (message.status === "recognizing text") {
            setScanMessage(
              `Leser ordren på telefonen … ${Math.round(message.progress * 100)} %`
            );
          }
        }
      });
      let scan: ReturnType<typeof parseClickCollectText>;
      try {
        await worker.setParameters({
          tessedit_pageseg_mode: PSM.AUTO,
          preserve_interword_spaces: "1",
          user_defined_dpi: "300"
        });
        const documentResult = await worker.recognize(prepared.document);
        setScanMessage("Leser kundeopplysningene …");
        await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
        const headerResult = await worker.recognize(prepared.header);
        setScanMessage("Leser varetabellen og antall …");
        const tableResult = await worker.recognize(prepared.table, {}, { tsv: true });
        setScanMessage("Kontrollerer GTIN-kolonnen …");
        await worker.setParameters({
          tessedit_pageseg_mode: PSM.SPARSE_TEXT,
          tessedit_char_whitelist: "0123456789"
        });
        const gtinResult = await worker.recognize(prepared.gtins);
        await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_COLUMN });
        const gtinColumnResult = await worker.recognize(prepared.gtins);
        // Headeren settes først slik at en ren, målrettet kundelinje vinner over
        // eventuell støy fra den store dokumentlesningen.
        scan = parseClickCollectText(
          `${headerResult.data.text}\n${documentResult.data.text}\n${tableResult.data.text}`
        );
        const gtinScan = parseClickCollectText(
          `${gtinResult.data.text}\n${gtinColumnResult.data.text}`
        );
        for (const gtinItem of gtinScan.items) {
          if (!scan.items.some((item) => item.articleNumber === gtinItem.articleNumber)) {
            scan.items.push(gtinItem);
          }
        }
        const tableDetails = spatialItemDetails(tableResult.data.tsv, prepared.table.width);
        scan.items = scan.items.map((item) => {
          const detail = tableDetails.get(item.articleNumber);
          const productText = `${item.description} ${item.model ?? ""}`;
          const inferredUnit = /(?:skrue|festemiddel)/i.test(productText)
            ? "Stk"
            : /(?:virke|terrasseb|\bbord\b|trelast|\d+x\d+)/i.test(productText)
              ? "Meter"
              : undefined;
          return {
            ...item,
            quantity: detail?.quantity ?? item.quantity,
            unit: detail?.unit ?? inferredUnit ?? item.unit
          };
        });
      } finally {
        await worker.terminate().catch(() => undefined);
      }

      setFields((current) => ({
        ...current,
        orderNumber: scan.orderNumber ?? current.orderNumber,
        customerName: scan.customerName ?? current.customerName,
        phone: scan.phone ?? current.phone,
        deliveryAddress: scan.deliveryAddress ?? current.deliveryAddress
      }));

      if (scan.items && scan.items.length > 0) {
        const scannedLines: Line[] = scan.items.map((item) => ({
          articleNumber: item.articleNumber ?? "",
          description: item.description ?? item.model ?? "",
          model: item.model ?? "",
          quantity: String(item.quantity ?? 1),
          unit: item.unit ?? "Stk",
          lookupStatus: "Henter varenavn fra nettet …"
        }));
        setLines(scannedLines);
        void Promise.all(
          scannedLines.map(async (line) => {
            try {
              const product = await lookupProductByEan(line.articleNumber);
              return product
                ? { ...line, description: product.name, lookupStatus: "Vare funnet på nett" }
                : { ...line, lookupStatus: "Fant ikke varen på nett" };
            } catch {
              return { ...line, lookupStatus: "Nettoppslag feilet" };
            }
          })
        ).then((enrichedLines) => {
          const byEan = new Map(
            enrichedLines.map((line) => [line.articleNumber, line])
          );
          setLines((current) =>
            current.map((line) => byEan.get(line.articleNumber) ?? line)
          );
        });
      }

      const foundItems = scan.items?.length ?? 0;
      setScanMessage(
        foundItems > 0
          ? `Skanningen fant ${foundItems} varelinje(r). Kontroller feltene før ordren opprettes.`
          : "Bildet ble lest, men ingen sikre varelinjer ble funnet. Prøv et rettere og nærmere bilde, eller fyll inn manuelt."
      );
    } catch (scanError) {
      setScanMessage(null);
      setError(
        scanError instanceof DOMException && scanError.name === "AbortError"
          ? "Skanningen tok for lang tid. Prøv et nærmere bilde med arket rett vei."
          : scanError instanceof Error
            ? scanError.message
            : "Bildet kunne ikke skannes."
      );
    } finally {
      setScanning(false);
    }
  }

  async function selectFile(next: File | null) {
    if (!next) return;

    setPreview(
      isImageFile(next) ? URL.createObjectURL(next) : null
    );

    if (click) {
      const uploadFile = await compressForUpload(next);
      if (uploadFile.size > 3_500_000) {
        setError("Bildet er for stort til å lastes opp. Velg lavere oppløsning eller ta bildet litt nærmere arket.");
        return;
      }
      setFile(uploadFile);
      await scanClickCollect(uploadFile);
    } else {
      setFile(next);
    }
  }

  function clearSelectedImage() {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null);
    setPreview(null);
    setScanMessage(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function paste(event: ClipboardEvent<HTMLDivElement>) {
    const pasted = Array.from(event.clipboardData.items)
      .find((item) => item.type.startsWith("image/"))
      ?.getAsFile();

    if (!pasted) return;

    event.preventDefault();
    void selectFile(
      new File([pasted], `klikk-hent-${Date.now()}.png`, {
        type: pasted.type
      })
    );
  }

  function drop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    void selectFile(event.dataTransfer.files?.[0] ?? null);
  }

  function updateLine(index: number, patch: Partial<Line>) {
    setLines((current) =>
      current.map((line, lineIndex) =>
        lineIndex === index ? { ...line, ...patch } : line
      )
    );
  }

  async function lookupLine(index: number) {
    const ean = lines[index]?.articleNumber.replace(/\D/g, "") ?? "";
    if (!/^\d{12,14}$/.test(ean)) {
      updateLine(index, { lookupStatus: "Skriv inn 12–14 EAN-sifre først" });
      return;
    }

    setLookingUpLines((current) => new Set(current).add(index));
    updateLine(index, { lookupStatus: "Søker på nettet …" });
    try {
      const product = await lookupProductByEan(ean);
      updateLine(
        index,
        product
          ? { description: product.name, lookupStatus: "Vare funnet på nett" }
          : { lookupStatus: "Fant ikke varen på nett" }
      );
    } catch (lookupError) {
      updateLine(index, {
        lookupStatus:
          lookupError instanceof Error ? lookupError.message : "Vareoppslaget feilet"
      });
    } finally {
      setLookingUpLines((current) => {
        const next = new Set(current);
        next.delete(index);
        return next;
      });
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.set("sourceType", click ? "CLICK_AND_COLLECT" : "MANUAL");

      for (const [key, value] of Object.entries(fields)) {
        formData.set(key, value);
      }

      if (file) formData.set("file", file);

      formData.set(
        "itemsJson",
        JSON.stringify(lines.filter((line) => line.description.trim()))
      );

      const response = await fetch("/api/orders/manual", {
        method: "POST",
        body: formData
      });
      const result = await responseJson(response);

      if (!response.ok) {
        throw new Error(String(result.error ?? "Kunne ikke opprette ordre."));
      }

      router.push(`/orders/${String(result.id)}`);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Kunne ikke opprette ordre."
      );
      setSaving(false);
    }
  }

  return (
    <main className="page-shell">
      <div className="page-header">
        <Link className="back-link" href="/">
          <ArrowLeft size={19} /> Tilbake
        </Link>
        <div>
          <p className="eyebrow">NY ORDRE</p>
          <h1>Legg til hjemlevering</h1>
        </div>
      </div>

      <div className="order-source-tabs">
        <button
          type="button"
          className={!click ? "active" : ""}
          onClick={() => setMode("STANDARD")}
        >
          <FileText size={19} /> Kundeordre / PDF
        </button>
        <button
          type="button"
          className={click ? "active" : ""}
          onClick={() => setMode("CLICK_AND_COLLECT")}
        >
          <ClipboardPaste size={19} /> Klikk & Hent
        </button>
      </div>

      <form className="form-card" onSubmit={submit}>
        <div
          className={`clipboard-upload-zone${click ? " scanner-upload-zone" : ""}`}
          tabIndex={0}
          onPaste={paste}
          onDrop={drop}
          onDragOver={(event) => event.preventDefault()}
          onClick={() => {
            if (!click) inputRef.current?.click();
          }}
        >
          {preview ? (
            <img src={preview} alt="Ordrelapp" />
          ) : (
            <div className="clipboard-upload-copy">
              {click ? <ScanLine size={36} /> : <FileUp size={34} />}
              <strong>
                {click
                  ? "Skann Klikk & Hent-ordren"
                  : "Velg PDF eller bilde"}
              </strong>
              <p>
                {click
                  ? "Ta et nytt bilde eller last opp et eksisterende bilde. Ordrenummer, kunde og varelinjer leses automatisk."
                  : "PDF tolkes automatisk."}
              </p>
            </div>
          )}

          {click && (
            <div className={`scan-source-actions${preview ? "" : " single"}`}>
              <button
                type="button"
                className="scan-upload-action"
                disabled={scanning}
                onClick={(event) => {
                  event.stopPropagation();
                  inputRef.current?.click();
                }}
              >
                <FileUp size={21} /> Velg / ta bilde
              </button>
              {preview && (
                <button
                  type="button"
                  className="scan-clear-action"
                  disabled={scanning}
                  onClick={(event) => {
                    event.stopPropagation();
                    clearSelectedImage();
                  }}
                >
                  <Trash2 size={20} /> Fjern bilde
                </button>
              )}
            </div>
          )}

          <input
            ref={inputRef}
            type="file"
            accept={click ? "image/*" : "application/pdf,image/*"}
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              const next = event.target.files?.[0] ?? null;
              event.target.value = "";
              void selectFile(next);
            }}
          />
        </div>

        {scanning && (
          <div className="scan-status working">
            <LoaderCircle size={19} className="spin" />
            <span>{scanMessage}</span>
          </div>
        )}

        {!scanning && scanMessage && (
          <div className="scan-status success">
            <CheckCircle2 size={19} />
            <span>{scanMessage}</span>
          </div>
        )}

        <div className="form-grid">
          <label>
            Ordrenummer
            <input
              value={fields.orderNumber}
              onChange={(event) =>
                updateField("orderNumber", event.target.value)
              }
            />
          </label>
          <label>
            Kundenavn
            <input
              value={fields.customerName}
              onChange={(event) =>
                updateField("customerName", event.target.value)
              }
            />
          </label>
          <label>
            Telefon
            <input
              value={fields.phone}
              inputMode="tel"
              onChange={(event) => updateField("phone", event.target.value)}
            />
          </label>
          <label>
            Leveringsadresse
            <input
              value={fields.deliveryAddress}
              onChange={(event) =>
                updateField("deliveryAddress", event.target.value)
              }
            />
          </label>
          <label>
            Leveringsdato
            <input
              value={fields.deliveryDate}
              type="date"
              onChange={(event) =>
                updateField("deliveryDate", event.target.value)
              }
            />
          </label>
          <label>
            Opprettet av
            <input
              value={fields.createdBy}
              required
              onChange={(event) =>
                updateField("createdBy", event.target.value)
              }
            />
          </label>
          <label className="full">
            Kommentar
            <textarea
              value={fields.comment}
              rows={3}
              onChange={(event) =>
                updateField("comment", event.target.value)
              }
            />
          </label>
        </div>

        {click && (
          <section className="manual-items-editor">
            <div className="manual-items-heading">
              <div>
                <h2>Skannede varelinjer</h2>
                <p>
                  Varenavnet hentes fra overskriften over GTIN-raden. Modell
                  beholdes som hjelpetekst. Kategorier som «Terrasse» ignoreres.
                </p>
              </div>
              <button
                type="button"
                className="outline-action compact"
                onClick={() =>
                  setLines((current) => [
                    ...current,
                    {
                      articleNumber: "",
                      description: "",
                      quantity: "",
                      unit: "Stk"
                    }
                  ])
                }
              >
                <Plus size={16} /> Legg til vare
              </button>
            </div>

            <div className="manual-item-list">
              {lines.map((line, index) => (
                <div className="manual-item-row scanner-row" key={index}>
                  <input
                    placeholder="GTIN / EAN"
                    value={line.articleNumber}
                    onChange={(event) =>
                      updateLine(index, {
                        articleNumber: event.target.value
                      })
                    }
                  />
                  <div className="scanner-description-fields">
                    <input
                      placeholder="Varenavn fra header"
                      value={line.description}
                      onChange={(event) =>
                        updateLine(index, {
                          description: event.target.value
                        })
                      }
                    />
                    {line.model && (
                      <small>Modell: {line.model}</small>
                    )}
                    <div className="product-lookup-row">
                      <button
                        type="button"
                        className="product-lookup-button"
                        disabled={lookingUpLines.has(index) || !line.articleNumber.trim()}
                        onClick={() => void lookupLine(index)}
                      >
                        {lookingUpLines.has(index) ? (
                          <LoaderCircle size={14} className="spin" />
                        ) : (
                          <Search size={14} />
                        )}
                        Hent vare fra nett
                      </button>
                      {line.lookupStatus && <small>{line.lookupStatus}</small>}
                    </div>
                  </div>
                  <input
                    placeholder="Antall"
                    value={line.quantity}
                    onChange={(event) =>
                      updateLine(index, { quantity: event.target.value })
                    }
                  />
                  <select
                    value={line.unit}
                    onChange={(event) =>
                      updateLine(index, { unit: event.target.value })
                    }
                  >
                    <option>Stk</option>
                    <option>Meter</option>
                    <option>M</option>
                    <option>Pk</option>
                    <option>Sett</option>
                  </select>
                  <button
                    type="button"
                    onClick={() =>
                      setLines((current) =>
                        current.length === 1
                          ? current
                          : current.filter(
                              (_, lineIndex) => lineIndex !== index
                            )
                      )
                    }
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {click && (
          <div className="click-collect-note">
            Skanningen er et forslag. Kontroller GTIN, varenavn og antall mot
            ordrelappen før ordren opprettes.
          </div>
        )}

        {error && <div className="error-box">{error}</div>}

        <button
          className="primary-button large"
          disabled={saving || scanning}
        >
          <Camera size={19} />
          {saving ? "Oppretter …" : "Opprett ordre"}
        </button>
      </form>
    </main>
  );
}
