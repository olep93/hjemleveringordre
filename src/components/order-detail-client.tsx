"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  FileSearch,
  FileText,
  MapPin,
  PackageCheck,
  Trash2,
  Truck
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type Item = {
  id: string;
  articleNumber?: string | null;
  bestNumber?: string | null;
  description: string;
  quantity: number;
  unit?: string | null;
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
  deliveryDate?: string | null;
  status: string;
  placement?: string | null;
  pickedBy?: string | null;
  comment?: string | null;
  originalDocumentUrl?: string | null;
  originalDocumentPath?: string | null;
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

export default function OrderPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [order, setOrder] = useState<Order | null>(null);
  const [actorName, setActorName] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [placement, setPlacement] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [currentUser, setCurrentUser] = useState<{
    displayName: string;
    role: string;
  } | null>(null);

  const canEdit = currentUser && currentUser.role !== "GUEST";
  const canDelete =
    currentUser?.role === "ADMIN" || currentUser?.role === "MANAGER";

  const load = useCallback(async () => {
    const response = await fetch(`/api/orders/${id}`, { cache: "no-store" });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error ?? "Kunne ikke hente ordre.");
    }

    setOrder(result.order);
    setOrderNumber(result.order.orderNumber ?? "");
    setCustomerName(result.order.customerName ?? "");
    setPhone(result.order.phone ?? "");
    setPlacement(result.order.placement ?? "");
    setDeliveryDate(result.order.deliveryDate ?? "");
    setComment(result.order.comment ?? "");
  }, [id]);

  useEffect(() => {
    void load().catch((e) => setError(e.message));

    void fetch("/api/auth/me")
      .then((response) => response.json())
      .then((result) => {
        if (result.user) {
          setCurrentUser(result.user);
          if (result.user.role !== "GUEST") {
            setActorName(result.user.displayName);
          }
        }
      });
  }, [load]);

  const progress = useMemo(() => {
    const items = order?.items ?? [];
    const pluckable = items.filter((item) => !item.isFreight);
    const checked = pluckable.filter((item) => item.checked).length;
    return { checked, total: pluckable.length };
  }, [order]);

  async function update(status?: string) {
    if (!canEdit) {
      setError("Gjestetilgang er skrivebeskyttet.");
      return;
    }

    if (!actorName.trim()) {
      setError("Skriv inn navnet ditt først.");
      return;
    }

    setSaving(true);
    setError(null);
    setInfo(null);

    try {
      const response = await fetch(`/api/orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          actorName,
          orderNumber: orderNumber || null,
          customerName: customerName || null,
          phone: phone || null,
          placement: placement || null,
          deliveryDate: deliveryDate || null,
          comment: comment || null
        })
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error ?? "Kunne ikke oppdatere.");
      }

      setInfo(status ? "Statusen er oppdatert." : "Endringene er lagret.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunne ikke oppdatere.");
    } finally {
      setSaving(false);
    }
  }

  async function reparse() {
    if (!canEdit) {
      setError("Gjestetilgang er skrivebeskyttet.");
      return;
    }

    setSaving(true);
    setError(null);
    setInfo(null);

    try {
      const response = await fetch(`/api/orders/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "REPARSE", actorName })
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error ?? "Kunne ikke tolke dokumentet på nytt.");
      }

      setInfo(
        `Dokumentet ble tolket på nytt. Fant ${result.itemCount ?? 0} varelinjer.`
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunne ikke tolke dokumentet.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleItem(item: Item) {
    if (!canEdit) {
      setError("Gjestetilgang er skrivebeskyttet.");
      return;
    }

    if (!actorName.trim()) {
      setError("Skriv inn navnet ditt før du krysser av varer.");
      return;
    }

    const response = await fetch(
      `/api/orders/${id}/items/${encodeURIComponent(item.id)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checked: !item.checked, actorName })
      }
    );

    const result = await response.json();
    if (!response.ok) {
      setError(result.error ?? "Kunne ikke oppdatere varelinjen.");
      return;
    }

    await load();
  }

  async function uploadPhoto(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canEdit) {
      setError("Gjestetilgang er skrivebeskyttet.");
      return;
    }

    const formElement = event.currentTarget;

    if (!actorName.trim()) {
      setError("Skriv inn navnet ditt før du laster opp bilde.");
      return;
    }

    const form = new FormData(formElement);
    form.set("uploadedBy", actorName);
    setSaving(true);

    try {
      const response = await fetch(`/api/orders/${id}/photos`, {
        method: "POST",
        body: form
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error ?? "Kunne ikke laste opp bilde.");
      }

      formElement.reset();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunne ikke laste opp bilde.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteOrder() {
    if (!canDelete) {
      setError("Bare leder eller administrator kan slette ordre.");
      return;
    }

    if (!window.confirm("Vil du slette denne ordren permanent?")) return;

    setSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/orders/${id}`, { method: "DELETE" });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          `${result.error ?? "Kunne ikke slette ordren."} (HTTP ${response.status})`
        );
      }

      window.location.assign("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunne ikke slette ordren.");
      setSaving(false);
    }
  }

  if (!order) {
    return (
      <main className="page-shell">
        {error ? <div className="error-box">{error}</div> : "Henter ordre …"}
      </main>
    );
  }

  return (
    <main className="page-shell">
      <div className="page-header">
        <Link className="back-link" href="/">
          <ArrowLeft size={19} /> Dashboard
        </Link>
        <div>
          <p className="eyebrow">{order.status}</p>
          <h1>
            {orderNumber
              ? `Kundeordre ${orderNumber}${customerName ? ` – ${customerName}` : ""}`
              : customerName
                ? `Hjemlevering – ${customerName}`
                : "Ny ordre – må kontrolleres"}
          </h1>
        </div>
      </div>

      {currentUser?.role === "GUEST" && (
        <div className="guest-notice">
          Du ser ordren som gjest. Logg inn for å plukke, redigere eller slette.
        </div>
      )}

      <div className="detail-grid">
        <section className="form-card">
          <h2>Ordreinformasjon</h2>

          <div className="form-grid order-header-fields">
            <label>
              Kundeordrenummer
              <input
                value={orderNumber}
                onChange={(e) => setOrderNumber(e.target.value)}
                disabled={!canEdit}
                placeholder="F.eks. 539"
              />
            </label>

            <label>
              Kundenavn
              <input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                disabled={!canEdit}
                placeholder="Navn på kunde"
              />
            </label>

            <label>
              Telefon
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={!canEdit}
                placeholder="Mobilnummer"
              />
            </label>

            <label>
              Navnet ditt
              <input
                value={actorName}
                onChange={(e) => setActorName(e.target.value)}
                disabled={!canEdit}
                placeholder="Hvem utfører handlingen?"
              />
            </label>

            <label>
              Leveringsdato
              <input
                type="date"
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
                disabled={!canEdit}
              />
            </label>

            <label>
              Plassering
              <select
                value={placement}
                onChange={(e) => setPlacement(e.target.value)}
                disabled={!canEdit}
              >
                <option value="">Velg plassering</option>
                <option>Utvendig betong</option>
                <option>Varemottak Drive-In</option>
                <option>Kasse Drive-In</option>
              </select>
            </label>

            <label className="full">
              Kommentar
              <textarea
                rows={3}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                disabled={!canEdit}
              />
            </label>
          </div>

          {error && <div className="error-box">{error}</div>}
          {info && <div className="info-message">{info}</div>}

          {canEdit && (
            <>
              <div className="action-grid">
                <button
                  className="secondary-button"
                  disabled={saving}
                  onClick={() => void update("PICKING")}
                >
                  Start plukking
                </button>

                <button
                  className="success-button"
                  disabled={saving}
                  onClick={() => void update("READY_FOR_LOADING")}
                >
                  <PackageCheck size={18} /> Klar for lasting
                </button>

                <button
                  className="secondary-button"
                  disabled={saving}
                  onClick={() => void update("LOADED")}
                >
                  <Truck size={18} /> Lastet på bil
                </button>

                <button
                  className="secondary-button"
                  disabled={saving}
                  onClick={() => void update()}
                >
                  Lagre endringer
                </button>
              </div>

              {order.originalDocumentPath && (
                <button
                  className="secondary-button reparse-button"
                  disabled={saving}
                  onClick={() => void reparse()}
                >
                  <FileSearch size={18} /> Tolk originaldokument på nytt
                </button>
              )}
            </>
          )}

          {canDelete && (
            <button
              className="danger-button delete-order-button"
              disabled={saving}
              onClick={() => void deleteOrder()}
            >
              <Trash2 size={18} /> Slett ordre permanent
            </button>
          )}

          {order.originalDocumentUrl && (
            <a
              className="document-link"
              href={order.originalDocumentUrl}
              target="_blank"
              rel="noreferrer"
            >
              <FileText size={18} /> Åpne original ordre
            </a>
          )}
        </section>

        <section className="form-card">
          <div className="section-title-row">
            <h2>Plukkeliste</h2>
            <span className="progress-pill">
              {progress.checked}/{progress.total}
            </span>
          </div>

          <div className="item-list">
            {(order.items ?? []).length === 0 ? (
              <div className="empty-state compact">
                Ingen varelinjer ble tolket. Bruk «Tolk originaldokument på nytt»,
                eller åpne originalordren for manuell kontroll.
              </div>
            ) : (
              (order.items ?? []).map((item) => (
                <button
                  type="button"
                  className={`item-row ${item.checked ? "checked" : ""} ${
                    item.isFreight ? "freight" : ""
                  }`}
                  key={item.id}
                  onClick={() =>
                    canEdit && !item.isFreight && void toggleItem(item)
                  }
                  disabled={!canEdit || item.isFreight}
                >
                  <span className="check-box">
                    {item.checked ? <CheckCircle2 size={20} /> : null}
                  </span>
                  <span className="item-copy">
                    <strong>
                      {item.quantity} {item.unit ?? "stk"} – {item.description}
                    </strong>
                    <small>
                      {item.articleNumber
                        ? `EAN ${item.articleNumber}`
                        : ""}
                      {item.bestNumber
                        ? ` · Best.nr. ${item.bestNumber}`
                        : ""}
                      {item.checkedBy && item.checkedBy !== "SYSTEM"
                        ? ` · ${item.checkedBy}`
                        : ""}
                    </small>
                  </span>
                </button>
              ))
            )}
          </div>
        </section>

        <section className="form-card">
          <h2>Bilder av ferdig ordre</h2>

          {canEdit && (
            <form className="photo-form" onSubmit={uploadPhoto}>
              <input
                name="file"
                type="file"
                accept="image/*"
                capture="environment"
                required
              />
              <button className="primary-button" disabled={saving}>
                <Camera size={18} /> Last opp bilde
              </button>
            </form>
          )}

          <div className="photo-grid">
            {(order.photos ?? []).map((photo, index) =>
              photo.url ? (
                <figure key={index}>
                  <img
                    src={photo.url}
                    alt={photo.filename ?? "Ordrebilde"}
                  />
                  <figcaption>{photo.uploadedBy ?? "Ukjent"}</figcaption>
                </figure>
              ) : null
            )}
          </div>
        </section>

        <section className="form-card full-width">
          <h2>Historikk</h2>
          <div className="timeline">
            {(order.events ?? []).map((event) => (
              <div className="timeline-item" key={event.id}>
                <MapPin size={16} />
                <div>
                  <strong>{event.description ?? "Hendelse"}</strong>
                  <p>
                    {event.createdAt
                      ? new Date(event.createdAt).toLocaleString("nb-NO")
                      : ""}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
