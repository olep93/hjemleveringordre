"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { AdminOrderEditor } from "@/components/admin-order-editor";
import {
  ArrowLeft,
  Box,
  CalendarDays,
  Camera,
  Check,
  CheckCircle2,
  ExternalLink,
  FileSearch,
  FileText,
  Info,
  Lock,
  Mail,
  Send,
  MapPin,
  PackageCheck,
  Play,
  Save,
  Trash2,
  Truck,
  UserRound,
  X
} from "lucide-react";
import { ChangeEvent, useCallback, useEffect, useMemo, useState } from "react";

type BlobReference = {
  pathname?: string;
  filename?: string;
};

type Item = {
  id: string;
  articleNumber?: string | null;
  bestNumber?: string | null;
  description: string;
  rawDescription?: string | null;
  lineComment?: string | null;
  identifierType?: "EAN" | "PLU" | null;
  productName?: string | null;
  productUrl?: string | null;
  productImageUrl?: string | null;
  quantity: number;
  unit?: string | null;
  price?: number | null;
  checked: boolean;
  checkedBy?: string | null;
  isFreight?: boolean;
};

type Order = {
  id: string;
  title: string;
  orderNumber?: string | null;
  customerName?: string | null;
  phone?: string | null;
  deliveryAddress?: string | null;
  deliveryDate?: string | null;
  createdAt?: string | null;
  status: string;
  placement?: string | null;
  locationCode?: string | null;
  fulfillmentMethod?: "THIS_THURSDAY" | "NEXT_THURSDAY" | "OWN_VEHICLE" | null;
  transportType?: "STANDARD_CRANE_GROUND" | "LARGE_CRANE" | "VAN" | null;
  pickupDate?: string | null;
  pickupRecipientEmail?: string | null;
  pickupShareToken?: string | null;
  source?: string | null;
  pickedBy?: string | null;
  comment?: string | null;
  originalDocumentUrl?: string | null;
  originalDocumentPath?: string | null;
  originalDocumentBlob?: BlobReference | null;
  items?: Item[];
  photos?: Array<{
    filename?: string;
    uploadedBy?: string;
    createdAt?: string;
    url?: string | null;
  }>;
  events?: Array<{
    id: string;
    description?: string;
    actorName?: string;
    createdAt?: string | null;
  }>;
};

function formatDateTime(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("nb-NO", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function formatPrice(value?: number | null): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "";
  return new Intl.NumberFormat("nb-NO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

function statusText(status: string): string {
  const labels: Record<string, string> = {
    TO_PICK: "Må plukkes",
    PICKING: "Under plukking",
    READY_FOR_LOADING: "Ferdig plukket",
    LOADED: "Lastet på bil",
    DELIVERED: "Levert",
    DEVIATION: "Må kontrolleres"
  };
  return labels[status] ?? status;
}

export default function OrderPage({
  initialUser
}: {
  initialUser: { displayName: string; role: string };
}) {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [order, setOrder] = useState<Order | null>(null);
  const [actorName] = useState(
    initialUser.role === "GUEST" ? "" : initialUser.displayName
  );
  const [pickingMode, setPickingMode] = useState(false);
  const [draftChecks, setDraftChecks] = useState<Record<string, boolean>>({});
  const [placement, setPlacement] = useState("");
  const [comment, setComment] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [locationCode, setLocationCode] = useState("");
  const [showFulfillment, setShowFulfillment] = useState(false);
  const [fulfillmentMethod, setFulfillmentMethod] = useState<"THIS_THURSDAY" | "NEXT_THURSDAY" | "OWN_VEHICLE">("THIS_THURSDAY");
  const [pickupDate, setPickupDate] = useState("");
  const [pickupRecipientEmail, setPickupRecipientEmail] = useState("");
  const [transportType, setTransportType] = useState<"STANDARD_CRANE_GROUND" | "LARGE_CRANE" | "VAN">("STANDARD_CRANE_GROUND");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<{
    placement?: boolean;
    photo?: boolean;
    items?: string[];
  }>({});

  const canEdit = initialUser.role !== "GUEST";
  const canDelete =
    initialUser.role === "ADMIN" || initialUser.role === "MANAGER";

  const hydrateDraft = useCallback((nextOrder: Order) => {
    setDraftChecks(
      Object.fromEntries(
        (nextOrder.items ?? []).map((item) => [item.id, Boolean(item.checked)])
      )
    );
    setPlacement(nextOrder.placement ?? "");
    setComment(nextOrder.comment ?? "");
    setDeliveryDate(nextOrder.deliveryDate ?? "");
    setLocationCode(nextOrder.locationCode ?? "");
    setFulfillmentMethod(nextOrder.fulfillmentMethod ?? "THIS_THURSDAY");
    setPickupDate(nextOrder.pickupDate ?? "");
    setPickupRecipientEmail(nextOrder.pickupRecipientEmail ?? window.localStorage.getItem("waypointEmail") ?? "marcus@waypointlarvik.no");
    setTransportType(nextOrder.transportType ?? "STANDARD_CRANE_GROUND");
  }, []);

  const load = useCallback(async () => {
    const response = await fetch(`/api/orders/${id}`, { cache: "no-store" });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error ?? "Kunne ikke hente ordre.");
    }

    setOrder(result.order);
    hydrateDraft(result.order);
  }, [hydrateDraft, id]);

  useEffect(() => {
    void load().catch((loadError) =>
      setError(
        loadError instanceof Error ? loadError.message : "Kunne ikke hente ordre."
      )
    );
  }, [load]);

  const progress = useMemo(() => {
    const pluckable = (order?.items ?? []).filter((item) => !item.isFreight);
    return {
      checked: pluckable.filter((item) =>
        pickingMode ? draftChecks[item.id] : item.checked
      ).length,
      total: pluckable.length
    };
  }, [draftChecks, order, pickingMode]);

  const canBeginPicking =
    canEdit &&
    order &&
    !["READY_FOR_LOADING", "LOADED", "DELIVERED"].includes(order.status);

  async function startPicking() {
    if (!canBeginPicking || !actorName) return;

    setSaving(true);
    setError(null);
    setInfo(null);

    try {
      const response = await fetch(`/api/orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "PICKING",
          actorName,
          pickingSessionEnded: false
        })
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Kunne ikke starte.");

      setPickingMode(true);
      setInfo("Plukkemodus er åpnet. Marker varer, velg plassering og lagre.");
      await load();
    } catch (startError) {
      setError(
        startError instanceof Error ? startError.message : "Kunne ikke starte."
      );
    } finally {
      setSaving(false);
    }
  }

  function cancelPicking() {
    if (order) hydrateDraft(order);
    setPickingMode(false);
    setError(null);
    setInfo("Endringene i denne plukkeøkten ble forkastet.");
  }

  function itemChecks() {
    return (order?.items ?? [])
      .filter((item) => !item.isFreight)
      .map((item) => ({
        id: item.id,
        checked: Boolean(draftChecks[item.id])
      }));
  }

  function clearValidationFeedback() {
    setValidationMessage(null);
    setValidationErrors({});
  }

  function showValidationFeedback(
    message: string,
    errors: {
      placement?: boolean;
      photo?: boolean;
      items?: string[];
    }
  ) {
    setValidationMessage(message);
    setValidationErrors(errors);

    window.setTimeout(() => {
      setValidationMessage(null);
    }, 5000);

    window.requestAnimationFrame(() => {
      document
        .querySelector("[data-validation-error='true']")
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  function validateBeforeFinalize(): boolean {
    if (!order) return false;

    const missingItemIds = (order.items ?? [])
      .filter(
        (item) =>
          !item.isFreight &&
          !Boolean(draftChecks[item.id])
      )
      .map((item) => item.id);

    const missingPlacement = !placement.trim();
    const missingPhoto = (order.photos ?? []).length === 0;
    const missingLocationCode = placement === "Kasse Drive-In" && !locationCode.trim();

    const missing: string[] = [];
    if (missingItemIds.length > 0) {
      missing.push(
        `${missingItemIds.length} varelinje${
          missingItemIds.length === 1 ? "" : "r"
        } er ikke markert plukket`
      );
    }
    if (missingPlacement) missing.push("plassering er ikke valgt");
    if (missingPhoto) missing.push("bilde av ferdig ordre mangler");
    if (missingLocationCode) missing.push("lokasjonskode ved kasse mangler");

    if (missing.length === 0) {
      clearValidationFeedback();
      return true;
    }

    showValidationFeedback(
      `Ordren kan ikke ferdigstilles: ${missing.join(", ")}.`,
      {
        placement: missingPlacement,
        photo: missingPhoto,
        items: missingItemIds
      }
    );

    return false;
  }

  function inputDate(date: Date) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`; }
  function thursday(weeks:number){const t=new Date();const monday=(t.getDay()+6)%7;const d=new Date(t);d.setDate(t.getDate()-monday+3+weeks*7);return inputDate(d)}
  function beginFinalize(){if(!validateBeforeFinalize())return;setPickupDate(fulfillmentMethod==="NEXT_THURSDAY"?thursday(1):fulfillmentMethod==="THIS_THURSDAY"?thursday(0):pickupDate);setShowFulfillment(true)}
  function openOutlookTemplate(current: Order) {
    if (current.source === "CLICK_AND_COLLECT") return;
    const to = current.pickupRecipientEmail || pickupRecipientEmail.trim();
    if (!to) {
      showValidationFeedback("Skriv inn e-postadressen til Waypoint.", {});
      return;
    }

    window.localStorage.setItem("waypointEmail", to);
    const share = current.pickupShareToken
      ? `${window.location.origin}/pickup/${current.id}?token=${encodeURIComponent(
          current.pickupShareToken
        )}`
      : `${window.location.origin}/orders/${current.id}`;
    const lines = (current.items ?? [])
      .filter((item) => !item.isFreight)
      .map(
        (item) =>
          `- ${item.productName ?? item.description}: ${item.quantity} ${
            item.unit ?? ""
          }`
      )
      .join("\n");
    const subject = `${current.title} – ${current.pickupDate ?? ""}`;
    const body = [
      "Hei,",
      "",
      "Følgende ordre er ferdig plukket:",
      current.title,
      "",
      `Dato: ${current.pickupDate ?? ""}`,
      `Plassering: ${current.placement ?? ""}${
        current.locationCode ? ` – ${current.locationCode}` : ""
      }`,
      `Kunde: ${current.customerName ?? ""}`,
      `Adresse: ${current.deliveryAddress ?? ""}`,
      `Telefon: ${current.phone ?? ""}`,
      "",
      "Kommentar fra plukking:",
      current.comment ?? "Ingen kommentar",
      "",
      "Varelinjer:",
      lines,
      "",
      "Original kundeordre og bilder:",
      share,
      "",
      "Med vennlig hilsen",
      "Obs BYGG Tønsberg"
    ].join("\n");

    // URLSearchParams serialiserer mellomrom som +. Outlook viser enkelte
    // ganger plusstegnene bokstavelig. encodeURIComponent bruker %20.
    const url =
      "https://outlook.office.com/mail/deeplink/compose" +
      `?to=${encodeURIComponent(to)}` +
      `&subject=${encodeURIComponent(subject)}` +
      `&body=${encodeURIComponent(body)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function sendWaypointEmail(current: Order) {
    if (current.source === "CLICK_AND_COLLECT") return;
    const to = current.pickupRecipientEmail || pickupRecipientEmail.trim();
    if (!to) {
      showValidationFeedback("Skriv inn e-postadressen til Waypoint.", {});
      return;
    }

    setSaving(true);
    setError(null);
    setInfo("Sender e-post med original kundeordre og plukkebilder …");

    try {
      const response = await fetch(`/api/orders/${current.id}/waypoint-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to })
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error ?? "E-posten kunne ikke sendes.");
      }
      setInfo(
        result.testMode
          ? `Testmail sendt til din innloggede jobbepost (${result.to}) med ${result.attachmentCount} vedlegg. Waypoint mottok ikke denne testen.`
          : `E-post sendt til ${result.to}, med kopi til ${result.cc}, og ${result.attachmentCount} vedlegg.`
      );
      await load();
    } catch (sendError) {
      setInfo(null);
      setError(
        sendError instanceof Error
          ? sendError.message
          : "E-posten kunne ikke sendes."
      );
    } finally {
      setSaving(false);
    }
  }

  async function savePicking(finalize: boolean) {
    if (!order || !actorName) return;
    if (finalize && !validateBeforeFinalize()) return;

    setSaving(true);
    setError(null);
    setInfo(null);

    try {
      const response = await fetch(`/api/orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: finalize ? "READY_FOR_LOADING" : "PICKING",
          actorName,
          placement: placement || null,
          deliveryDate: deliveryDate || null,
          comment: comment || null,
          itemChecks: itemChecks(),
          pickingSessionEnded: true,
          fulfillmentMethod: finalize ? fulfillmentMethod : undefined,
          pickupDate: finalize ? pickupDate : undefined,
          pickupRecipientEmail: finalize && order.source !== "CLICK_AND_COLLECT" ? pickupRecipientEmail : undefined,
          locationCode: placement === "Kasse Drive-In" ? locationCode : null
        })
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error ?? "Kunne ikke lagre plukkingen.");
      }

      clearValidationFeedback();
      setShowFulfillment(false);
      setPickingMode(false);
      setInfo(
        finalize
          ? "Ordren er ferdigstilt og flyttet til «Til utkjøring»."
          : "Plukkingen er lagret. Ordren er låst igjen."
      );
      await load();
    } catch (saveError) {
      const message =
        saveError instanceof Error
          ? saveError.message
          : "Kunne ikke lagre plukkingen.";

      const lower = message.toLowerCase();
      showValidationFeedback(message, {
        placement: lower.includes("plassering"),
        photo: lower.includes("bilde"),
        items:
          lower.includes("varelinje") || lower.includes("plukket")
            ? (order.items ?? [])
                .filter(
                  (item) =>
                    !item.isFreight &&
                    !Boolean(draftChecks[item.id])
                )
                .map((item) => item.id)
            : []
      });
      setError(null);
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(status: "LOADED" | "DELIVERED") {
    if (!actorName) return;

    setSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, actorName })
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Kunne ikke oppdatere.");

      setInfo(
        status === "LOADED"
          ? "Ordren er markert lastet på bil."
          : "Ordren er markert levert."
      );
      await load();
    } catch (statusError) {
      setError(
        statusError instanceof Error
          ? statusError.message
          : "Kunne ikke oppdatere."
      );
    } finally {
      setSaving(false);
    }
  }

  async function reparse() {
    if (!canEdit) return;

    setSaving(true);
    setError(null);
    setInfo("Tolker PDF og oppdaterer produktinformasjonen …");

    try {
      const response = await fetch(`/api/orders/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "REPARSE", actorName })
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error ?? "Kunne ikke tolke dokumentet.");
      }

      setInfo(`Fant ${result.itemCount ?? 0} varelinjer.`);
      await load();
    } catch (parseError) {
      setInfo(null);
      setError(
        parseError instanceof Error
          ? parseError.message
          : "Kunne ikke tolke dokumentet."
      );
    } finally {
      setSaving(false);
    }
  }

  async function uploadSelectedPhotos(
    event: ChangeEvent<HTMLInputElement>
  ) {
    if (!pickingMode) return;

    const input = event.currentTarget;
    const files = Array.from(input.files ?? []);
    if (files.length === 0) return;

    setSaving(true);
    setError(null);
    setInfo(
      files.length === 1
        ? "Laster opp bildet …"
        : `Laster opp ${files.length} bilder …`
    );

    try {
      for (const file of files) {
        const form = new FormData();
        form.set("file", file);
        form.set("uploadedBy", actorName);

        const response = await fetch(`/api/orders/${id}/photos`, {
          method: "POST",
          body: form
        });
        const result = await response.json();

        if (!response.ok) {
          throw new Error(
            result.error ?? `Kunne ikke laste opp ${file.name}.`
          );
        }
      }

      input.value = "";
      setValidationErrors((current) => ({
        ...current,
        photo: false
      }));
      setInfo(
        files.length === 1
          ? "Bildet er lastet opp."
          : `${files.length} bilder er lastet opp.`
      );
      await load();
      setPickingMode(true);
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Kunne ikke laste opp bildet."
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteOrder() {
    if (!canDelete) return;
    if (!window.confirm("Vil du slette denne ordren permanent?")) return;

    setSaving(true);
    try {
      const response = await fetch(`/api/orders/${id}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error ?? "Kunne ikke slette ordren.");
      }
      window.location.assign("/?deleted=1");
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Kunne ikke slette ordren."
      );
      setSaving(false);
    }
  }

  if (!order) {
    return (
      <main>
        <AppHeader user={initialUser} />
        <section className="modern-order-page">
          <div className="modern-card">
            {error ? <div className="error-box">{error}</div> : "Henter ordre …"}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main>
      <AppHeader user={initialUser} />

      {validationMessage && (
        <div className="validation-toast" role="alert" aria-live="assertive">
          <div>
            <strong>Kan ikke ferdigstille ordren</strong>
            <span>{validationMessage}</span>
          </div>
          <button
            type="button"
            aria-label="Lukk feilmelding"
            onClick={() => setValidationMessage(null)}
          >
            <X size={18} />
          </button>
        </div>
      )}

      <section className="modern-order-page">
        <div className="order-titlebar">
          <div>
            <Link className="modern-back-link" href="/">
              <ArrowLeft size={18} /> Tilbake til oversikt
            </Link>
            <div className="title-line">
              <h1>
                {order.orderNumber
                  ? `Kundeordre ${order.orderNumber}${
                      order.customerName ? ` – ${order.customerName}` : ""
                    }`
                  : order.title}
              </h1>
              <span className="status-chip">{statusText(order.status)}</span>
            </div>
            {order.createdAt && (
              <p className="created-line">
                <CalendarDays size={16} />
                Opprettet {formatDateTime(order.createdAt)}
              </p>
            )}
          </div>

          <div className="title-actions">
            {order.originalDocumentUrl && (
              <a
                className="outline-action"
                href={order.originalDocumentUrl}
                target="_blank"
                rel="noreferrer"
              >
                <FileText size={18} /> Åpne original ordre
                <ExternalLink size={15} />
              </a>
            )}

            {canEdit &&
              !pickingMode &&
              (order.originalDocumentBlob?.pathname ||
                order.originalDocumentPath) && (
                <button
                  className="outline-action"
                  disabled={saving}
                  onClick={() => void reparse()}
                >
                  <FileSearch size={18} />
                  Oppdater produktinfo
                </button>
              )}
          </div>
        </div>

        {error && <div className="error-box order-alert">{error}</div>}
        {info && <div className="info-message order-alert">{info}</div>}

        {initialUser.role === "ADMIN" && (
          <AdminOrderEditor order={order} onUpdated={load} />
        )}

        <div className="picking-workflow-banner">
          <div className={pickingMode ? "workflow-icon active" : "workflow-icon"}>
            {pickingMode ? <Play size={22} /> : <Lock size={22} />}
          </div>
          <div>
            <strong>
              {pickingMode ? "Plukkemodus er åpen" : "Ordren er låst"}
            </strong>
            <p>
              {pickingMode
                ? "Marker det som er plukket, velg plassering og last opp bilde. Lagre når du er ferdig."
                : "Plukkliste og plassering kan først endres etter at du starter plukkingen."}
            </p>
          </div>

          {!pickingMode && canBeginPicking && (
            <button
              className="blue-action workflow-start"
              disabled={saving}
              onClick={() => void startPicking()}
            >
              <Play size={18} />
              {order.status === "PICKING" ? "Fortsett plukking" : "Start plukking"}
            </button>
          )}
        </div>

        <div className="modern-detail-grid staged-picking-grid">
          <section className="modern-card order-information-card">
            <div className="modern-card-title">
              <span className="title-icon"><PackageCheck size={21} /></span>
              <h2>Ordreinformasjon</h2>
            </div>

            <div className="order-summary-list">
              <div>
                <span>Kundeordre</span>
                <strong>{order.orderNumber ?? "Ikke registrert"}</strong>
              </div>
              <div>
                <span>Kunde</span>
                <strong>{order.customerName ?? "Ikke registrert"}</strong>
              </div>
              <div>
                <span>Telefon</span>
                <strong>{order.phone ?? "Ikke registrert"}</strong>
              </div>
              <div className="address-summary-cell">
                <span>Leveringsadresse</span>
                <strong>{order.deliveryAddress ?? "Ikke registrert"}</strong>
              </div>
              <div>
                <span>Leveringsdato</span>
                <strong>{deliveryDate || "Ikke satt"}</strong>
              </div>
              <div>
                <span>Plukket av</span>
                <strong>{order.pickedBy ?? "Ikke startet"}</strong>
              </div>
              <div>
                <span>Plassering</span>
                <strong>{order.placement ?? "Ikke valgt"}</strong>
              </div>
            </div>

            {pickingMode && (
              <div className="picking-session-fields">
                <label>
                  Leveringsdato
                  <input
                    type="date"
                    value={deliveryDate}
                    onChange={(event) => setDeliveryDate(event.target.value)}
                  />
                </label>

                <label
                  className={validationErrors.placement ? "validation-error-field" : ""}
                  data-validation-error={validationErrors.placement ? "true" : undefined}
                >
                  Plassering av ferdig ordre
                  <div className="input-with-icon">
                    <MapPin size={17} />
                    <select
                      value={placement}
                      onChange={(event) => {
                        setPlacement(event.target.value);
                        setValidationErrors((current) => ({
                          ...current,
                          placement: false
                        }));
                      }}
                    >
                      <option value="">Velg plassering</option>
                      <option>Utvendig betong</option>
                      <option>Varemottak Drive-In</option>
                      <option>Kasse Drive-In</option>
                    </select>
                  </div>
                </label>

                {placement === "Kasse Drive-In" && <label>Lokasjonskode ved kasse<input value={locationCode} placeholder="F.eks. B2" onChange={(event)=>setLocationCode(event.target.value)}/></label>}

                <label className="full">
                  Kommentar
                  <textarea
                    rows={3}
                    value={comment}
                    onChange={(event) => setComment(event.target.value)}
                    placeholder="Kommentar til plukkingen …"
                  />
                </label>

                <div
                  className={`full picking-photo-block ${
                    validationErrors.photo ? "validation-error-block" : ""
                  }`}
                  data-validation-error={validationErrors.photo ? "true" : undefined}
                >
                  <h3><Camera size={18} /> Bilde av ferdig ordre</h3>
                  <div className="auto-photo-upload">
                    <label className={saving ? "outline-action disabled" : "outline-action"}>
                      <Camera size={18} />
                      {saving ? "Laster opp …" : "Velg eller ta bilder"}
                      <input
                        name="file"
                        type="file"
                        accept="image/*"
                        capture="environment"
                        multiple
                        disabled={saving}
                        onChange={(event) => void uploadSelectedPhotos(event)}
                      />
                    </label>
                    <p>
                      Bildene lastes opp automatisk med én gang de er valgt.
                    </p>
                  </div>

                  {(order.photos ?? []).length > 0 && (
                    <div className="photo-grid compact-photos">
                      {(order.photos ?? []).map((photo, index) =>
                        photo.url ? (
                          <figure key={index}>
                            <img src={photo.url} alt="Ordrebilde" />
                          </figure>
                        ) : null
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {!pickingMode && (
              <div className="locked-order-note">
                <Info size={18} />
                Detaljer for plukkingen vises når plukkemodus startes.
              </div>
            )}

            {pickingMode && (
              <div className="picking-session-actions">
                <button
                  className="outline-action"
                  disabled={saving}
                  onClick={cancelPicking}
                >
                  <X size={18} /> Avbryt
                </button>
                <button
                  className="blue-action"
                  disabled={saving}
                  onClick={() => void savePicking(false)}
                >
                  <Save size={18} /> Lagre og avslutt
                </button>
                <button
                  className="green-action finalize-action"
                  disabled={saving}
                  onClick={beginFinalize}
                >
                  <CheckCircle2 size={18} /> Ferdigstill ordre
                </button>
              </div>
            )}

            {!pickingMode && order.status === "READY_FOR_LOADING" && canEdit && (
              <button
                className="blue-action full-width-action"
                disabled={saving}
                onClick={() => void setStatus("LOADED")}
              >
                <Truck size={18} /> Marker som lastet på bil
              </button>
            )}

            {!pickingMode && order.status === "LOADED" && canEdit && (
              <button
                className="green-action full-width-action"
                disabled={saving}
                onClick={() => void setStatus("DELIVERED")}
              >
                <CheckCircle2 size={18} /> Marker som levert
              </button>
            )}

            {!pickingMode && canDelete && (
              <button
                className="modern-danger-button delete-bottom"
                disabled={saving}
                onClick={() => void deleteOrder()}
              >
                <Trash2 size={18} /> Slett ordre permanent
              </button>
            )}
          </section>

          <section className="modern-card picking-card">
            <div className="modern-card-title picking-title">
              <span className="title-icon outline"><Box size={23} /></span>
              <h2>Plukkeliste</h2>
              <span className="modern-progress-pill">
                {progress.checked} / {progress.total} plukket
              </span>
            </div>

            <div className="modern-item-list">
              {(order.items ?? []).length === 0 ? (
                <div className="empty-state">Ingen varelinjer ble tolket.</div>
              ) : (
                (order.items ?? []).map((item) => {
                  const checked = pickingMode
                    ? Boolean(draftChecks[item.id])
                    : Boolean(item.checked);

                  return (
                    <article
                      className={`modern-product-row ${checked ? "checked" : ""} ${
                        validationErrors.items?.includes(item.id)
                          ? "validation-error-item"
                          : ""
                      }`}
                      data-validation-error={
                        validationErrors.items?.includes(item.id)
                          ? "true"
                          : undefined
                      }
                      key={item.id}
                    >
                      {pickingMode && !item.isFreight ? (
                        <button
                          className="product-checkbox"
                          type="button"
                          onClick={() => {
                            setDraftChecks((current) => ({
                              ...current,
                              [item.id]: !current[item.id]
                            }));
                            setValidationErrors((current) => ({
                              ...current,
                              items: (current.items ?? []).filter(
                                (id) => id !== item.id
                              )
                            }));
                          }}
                          aria-label={
                            checked
                              ? "Marker som ikke plukket"
                              : "Marker som plukket"
                          }
                        >
                          {checked && <Check size={18} />}
                        </button>
                      ) : (
                        <div
                          className={`locked-check-indicator ${
                            checked ? "checked" : ""
                          }`}
                        >
                          {checked ? <Check size={17} /> : <Lock size={14} />}
                        </div>
                      )}

                      <div className="product-image-wrap">
                        {item.productImageUrl ? (
                          <img
                            src={item.productImageUrl}
                            alt={item.productName ?? item.description}
                          />
                        ) : (
                          <Box size={32} />
                        )}
                      </div>

                      <div className="product-description">
                        <div className="product-name-line">
                          {item.productUrl ? (
                            <a
                              href={item.productUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {item.productName ?? item.description}
                              <ExternalLink size={14} />
                            </a>
                          ) : (
                            <strong>{item.productName ?? item.description}</strong>
                          )}
                        </div>
                        {(item.productName || item.rawDescription) && <p>Radtekst: {item.rawDescription ?? item.description}</p>}
                        <div className="product-tags">
                          {item.articleNumber && (
                            <span>
                              {item.identifierType === "PLU" ? "PLU" : "EAN"}{" "}
                              {item.articleNumber}
                            </span>
                          )}
                          {item.bestNumber && (
                            <span>Best.nr {item.bestNumber}</span>
                          )}
                        </div>
                      </div>

                      <div className="product-quantity">
                        <strong>
                          {item.quantity} {item.unit ?? "stk"}
                        </strong>
                        {item.price !== null && item.price !== undefined && (
                          <span>à {formatPrice(item.price)}</span>
                        )}
                        <em>{checked ? "Plukket" : "Ikke plukket"}</em>
                      </div>
                    </article>
                  );
                })
              )}
            </div>

            <div className="picking-help">
              <Info size={18} />
              {pickingMode
                ? "Endringene lagres samlet når du avslutter plukkeøkten."
                : "Trykk «Start plukking» for å åpne avhuking og plassering."}
            </div>
          </section>
        </div>

        {(order.photos ?? []).length > 0 && <section className="modern-card history-card-spacing"><div className="modern-card-title"><span className="title-icon"><Camera size={21}/></span><h2>Bilder av ferdig plukket ordre</h2></div><div className="photo-grid persisted-picking-photos">{(order.photos??[]).map((photo,index)=>photo.url?<figure key={index}><a href={photo.url} target="_blank"><img src={photo.url} alt="Plukkebilde"/></a><figcaption>{photo.uploadedBy??"Ukjent"}</figcaption></figure>:null)}</div></section>}
        {!pickingMode &&
          order.status === "READY_FOR_LOADING" &&
          order.source !== "CLICK_AND_COLLECT" && (
            <section className="modern-card history-card-spacing outlook-handoff-card">
              <div>
                <p className="eyebrow">WAYPOINT / TRANSPORT</p>
                <h2>Send ordren til Waypoint</h2>
                <p>
                  Direkte sending inkluderer original kundeordre og alle
                  bilder som faktiske vedlegg. I testmodus sendes meldingen
                  bare til jobbeposten til den innloggede brukeren.
                </p>
              </div>
              <div className="waypoint-mail-actions">
                <button
                  className="green-action"
                  disabled={saving}
                  onClick={() => void sendWaypointEmail(order)}
                >
                  <Send size={18} /> Send testmail med vedlegg
                </button>
                <button
                  className="outline-action"
                  disabled={saving}
                  onClick={() => openOutlookTemplate(order)}
                >
                  <Mail size={18} /> Åpne mal i Outlook
                </button>
              </div>
            </section>
          )}

        <section className="modern-card history-card-spacing">
          <div className="modern-card-title">
            <span className="title-icon"><PackageCheck size={21} /></span>
            <h2>Historikk</h2>
          </div>
          <div className="timeline">
            {(order.events ?? []).map((event) => (
              <div className="timeline-item" key={event.id}>
                <MapPin size={16} />
                <div>
                  <strong>{event.description ?? "Hendelse"}</strong>
                  <p>{formatDateTime(event.createdAt)}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
        {showFulfillment && <div className="modal-backdrop"><div className="fulfillment-modal"><div className="modal-heading"><div><p className="eyebrow">SISTE STEG</p><h2>Velg utkjøring eller henting</h2></div><button type="button" onClick={()=>setShowFulfillment(false)}><X size={20}/></button></div><div className="fulfillment-options"><button type="button" className={fulfillmentMethod==="THIS_THURSDAY"?"selected":""} onClick={()=>{setFulfillmentMethod("THIS_THURSDAY");setPickupDate(thursday(0))}}><Truck size={20}/><strong>Torsdag inneværende uke</strong><span>{thursday(0)}</span></button><button type="button" className={fulfillmentMethod==="NEXT_THURSDAY"?"selected":""} onClick={()=>{setFulfillmentMethod("NEXT_THURSDAY");setPickupDate(thursday(1))}}><Truck size={20}/><strong>Torsdag neste uke</strong><span>{thursday(1)}</span></button><button type="button" className={fulfillmentMethod==="OWN_VEHICLE"?"selected":""} onClick={()=>setFulfillmentMethod("OWN_VEHICLE")}><Box size={20}/><strong>Egen bil</strong><span>Velg egen dato</span></button></div><label>Dato<input type="date" value={pickupDate} onChange={e=>setPickupDate(e.target.value)}/></label><label>Type transport<select value={transportType} onChange={e=>setTransportType(e.target.value as "STANDARD_CRANE_GROUND"|"LARGE_CRANE"|"VAN")}><option value="STANDARD_CRANE_GROUND">Standard kranbil til bakkeplan</option><option value="LARGE_CRANE">Kranbil stor</option><option value="VAN">Varebil</option></select></label>{order.source!=="CLICK_AND_COLLECT"&&<label>E-post til Waypoint / transport<input type="email" value={pickupRecipientEmail} onChange={e=>setPickupRecipientEmail(e.target.value)}/></label>}<div className="modal-actions"><button className="outline-action" type="button" onClick={()=>setShowFulfillment(false)}>Tilbake</button><button className="green-action" type="button" disabled={saving||!pickupDate||(order.source!=="CLICK_AND_COLLECT"&&fulfillmentMethod!=="OWN_VEHICLE"&&!pickupRecipientEmail.trim())} onClick={()=>void savePicking(true)}><CheckCircle2 size={18}/>Ferdigstill ordre</button></div></div></div>}
      </section>
    </main>
  );
}
