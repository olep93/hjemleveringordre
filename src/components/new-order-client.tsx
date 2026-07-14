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
    if (!next.type.startsWith("image/")) return;

    setScanning(true);
    setScanMessage("Leser kundenavn, ordre og varelinjer fra bildet …");
    setError(null);

    try {
      const form = new FormData();
      form.set("file", next);

      const response = await fetch("/api/orders/click-collect/scan", {
        method: "POST",
        body: form
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error ?? "Bildet kunne ikke skannes.");
      }

      const scan = result.scan as {
        orderNumber?: string | null;
        customerName?: string | null;
        phone?: string | null;
        deliveryAddress?: string | null;
        items?: Array<{
          articleNumber?: string;
          description?: string;
          model?: string | null;
          quantity?: number;
          unit?: string;
        }>;
      };

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

      setScanMessage(
        `Skanningen fant ${scan.items?.length ?? 0} varelinje(r). Kontroller feltene før ordren opprettes.`
      );
    } catch (scanError) {
      setScanMessage(null);
      setError(
        scanError instanceof Error
          ? scanError.message
          : "Bildet kunne ikke skannes."
      );
    } finally {
      setScanning(false);
    }
  }

  async function selectFile(next: File | null) {
    if (!next) return;

    setFile(next);
    setPreview(
      next.type.startsWith("image/") ? URL.createObjectURL(next) : null
    );

    if (click) {
      await scanClickCollect(next);
    }
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
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error ?? "Kunne ikke opprette ordre.");
      }

      router.push(`/orders/${result.id}`);
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
          className="clipboard-upload-zone"
          tabIndex={0}
          onPaste={paste}
          onDrop={drop}
          onDragOver={(event) => event.preventDefault()}
          onClick={() => inputRef.current?.click()}
        >
          {preview ? (
            <img src={preview} alt="Ordrelapp" />
          ) : (
            <div className="clipboard-upload-copy">
              {click ? <ScanLine size={36} /> : <FileUp size={34} />}
              <strong>
                {click
                  ? "Lim inn eller fotografer Klikk & Hent-ordren"
                  : "Velg PDF eller bilde"}
              </strong>
              <p>
                {click
                  ? "Skanneren leser ordrenummer, kunde, GTIN, varenavn og antall automatisk."
                  : "PDF tolkes automatisk."}
              </p>
            </div>
          )}

          <input
            ref={inputRef}
            type="file"
            accept={click ? "image/*" : "application/pdf,image/*"}
            capture={click ? "environment" : undefined}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              void selectFile(event.target.files?.[0] ?? null)
            }
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
