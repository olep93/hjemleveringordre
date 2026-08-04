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

async function prepareForBrowserOcr(file: File): Promise<HTMLCanvasElement> {
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
    return canvas;
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
        const result = await worker.recognize(prepared);
        scan = parseClickCollectText(result.data.text);
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
        setLines(
          scan.items.map((item) => ({
            articleNumber: item.articleNumber ?? "",
            description: item.description ?? item.model ?? "",
            model: item.model ?? "",
            quantity: String(item.quantity ?? 1),
            unit: item.unit ?? "Stk"
          }))
        );
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
