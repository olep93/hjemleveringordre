"use client";

import { ExternalLink, Image as ImageIcon, Pencil, Plus, RotateCcw, Save, Trash2, X } from "lucide-react";
import { useState } from "react";

type Item = {
  id: string;
  articleNumber?: string | null;
  identifierType?: "EAN" | "PLU" | null;
  description: string;
  rawDescription?: string | null;
  lineComment?: string | null;
  bestNumber?: string | null;
  quantity: number;
  unit?: string | null;
  checked?: boolean;
  checkedBy?: string | null;
  checkedAt?: string | null;
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
  placement?: string | null;
  locationCode?: string | null;
  comment?: string | null;
  fulfillmentMethod?: "THIS_THURSDAY" | "NEXT_THURSDAY" | "OWN_VEHICLE" | null;
  transportType?: "STANDARD_CRANE_GROUND" | "LARGE_CRANE" | "VAN" | null;
  transportComment?: string | null;
  pickupDate?: string | null;
  pickupRecipientEmail?: string | null;
  items?: Item[];
  photos?: Array<{
    url?: string | null;
    filename?: string;
    uploadedBy?: string | null;
    createdAt?: string;
  }>;
};

export function AdminOrderEditor({
  order,
  onUpdated
}: {
  order: Order;
  onUpdated: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Order>({
    ...order,
    pickupRecipientEmail:
      order.pickupRecipientEmail || "marcus@waypointlarvik.no",
    items: (order.items ?? []).map((item) => ({ ...item }))
  });

  function resetDraft() {
    setDraft({
      ...order,
      pickupRecipientEmail:
        order.pickupRecipientEmail || "marcus@waypointlarvik.no",
      items: (order.items ?? []).map((item) => ({ ...item }))
    });
  }

  function field<K extends keyof Order>(key: K, value: Order[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function item(index: number, patch: Partial<Item>) {
    setDraft((current) => ({
      ...current,
      items: (current.items ?? []).map((entry, itemIndex) =>
        itemIndex === index ? { ...entry, ...patch } : entry
      )
    }));
  }

  async function deletePhoto(index: number) {
    const photo = order.photos?.[index];

    if (
      !window.confirm(
        `Slette ${photo?.filename ?? `bilde ${index + 1}`} permanent?`
      )
    ) {
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(
        `/api/orders/${order.id}/photos/${index}`,
        { method: "DELETE" }
      );
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error ?? "Bildet kunne ikke slettes.");
      }

      await onUpdated();
      setOpen(false);
    } catch (error) {
      window.alert(
        error instanceof Error ? error.message : "Bildet kunne ikke slettes."
      );
    } finally {
      setSaving(false);
    }
  }

  async function save() {
    setSaving(true);
    try {
      const response = await fetch(`/api/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminEdit: draft })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Kunne ikke lagre.");
      await onUpdated();
      setOpen(false);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Kunne ikke lagre.");
    } finally {
      setSaving(false);
    }
  }

  async function resetToPick() {
    if (!window.confirm("Tilbakestille ordren til «Må plukkes»?")) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminAction: "RESET_TO_PICK" })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Kunne ikke tilbakestille.");
      await onUpdated();
      setOpen(false);
    } catch (error) {
      window.alert(
        error instanceof Error ? error.message : "Kunne ikke tilbakestille."
      );
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <div className="admin-order-tools">
        <button className="outline-action" onClick={() => { resetDraft(); setOpen(true); }}>
          <Pencil size={17} /> Rediger hele ordren
        </button>
        <button className="admin-reset-button" onClick={() => void resetToPick()}>
          <RotateCcw size={17} /> Tilbakestill til «Må plukkes»
        </button>
      </div>
    );
  }

  return (
    <section className="admin-order-editor">
      <div className="admin-order-editor-heading">
        <div>
          <p className="eyebrow">ADMINISTRATOR</p>
          <h2>Rediger hele ordren</h2>
        </div>
        <button onClick={() => setOpen(false)}><X size={20} /></button>
      </div>

      <div className="admin-edit-grid">
        <label>Tittel<input value={draft.title || ""} onChange={(e)=>field("title",e.target.value)} /></label>
        <label>Ordrenummer<input value={draft.orderNumber || ""} onChange={(e)=>field("orderNumber",e.target.value)} /></label>
        <label>Kundenavn<input value={draft.customerName || ""} onChange={(e)=>field("customerName",e.target.value)} /></label>
        <label>Telefon<input value={draft.phone || ""} onChange={(e)=>field("phone",e.target.value)} /></label>
        <label className="full">Leveringsadresse<input value={draft.deliveryAddress || ""} onChange={(e)=>field("deliveryAddress",e.target.value)} /></label>
        <label>Leveringsdato<input type="date" value={draft.deliveryDate || ""} onChange={(e)=>field("deliveryDate",e.target.value)} /></label>
        <label>Plassering<select value={draft.placement || ""} onChange={(e)=>field("placement",e.target.value)}>
          <option value="">Ikke valgt</option><option>Utvendig betong</option><option>Varemottak Drive-In</option><option>Kasse Drive-In</option>
        </select></label>
        <label>Lokasjonskode<input value={draft.locationCode || ""} onChange={(e)=>field("locationCode",e.target.value)} /></label>
        <label>Hente-/utkjøringsdato<input type="date" value={draft.pickupDate || ""} onChange={(e)=>field("pickupDate",e.target.value)} /></label>
        <label>Leveringsmåte<select value={draft.fulfillmentMethod || ""} onChange={(e)=>field("fulfillmentMethod",(e.target.value || null) as Order["fulfillmentMethod"])}>
          <option value="">Ikke valgt</option><option value="THIS_THURSDAY">Torsdag inneværende uke</option><option value="NEXT_THURSDAY">Torsdag neste uke</option><option value="OWN_VEHICLE">Egen bil</option>
        </select></label>
        <label>Transporttype<select value={draft.transportType || "STANDARD_CRANE_GROUND"} onChange={(e)=>field("transportType",e.target.value as Order["transportType"])}><option value="STANDARD_CRANE_GROUND">Standard kranbil til bakkeplan</option><option value="LARGE_CRANE">Kranbil stor</option><option value="VAN">Varebil</option></select></label><label className="full">Kommentar til transportør<textarea rows={3} value={draft.transportComment || ""} onChange={(e)=>field("transportComment",e.target.value)} /></label>
        <label className="full">Kommentar<textarea rows={3} value={draft.comment || ""} onChange={(e)=>field("comment",e.target.value)} /></label>
      </div>

      <div className="admin-items-heading">
        <div>
          <h3>Bilder av ferdig plukket ordre</h3>
          <p>Administrator kan åpne eller slette feilaktige bilder.</p>
        </div>
      </div>

      {(order.photos ?? []).length > 0 ? (
        <div className="admin-photo-list">
          {(order.photos ?? []).map((photo, index) => (
            <article className="admin-photo-card" key={`${photo.filename}-${index}`}>
              {photo.url ? (
                <a href={photo.url} target="_blank" rel="noreferrer">
                  <img src={photo.url} alt={photo.filename ?? `Bilde ${index + 1}`} />
                </a>
              ) : (
                <div className="admin-photo-placeholder">
                  <ImageIcon size={28} />
                </div>
              )}

              <div className="admin-photo-meta">
                <strong>{photo.filename ?? `Bilde ${index + 1}`}</strong>
                <span>Lastet opp av {photo.uploadedBy ?? "ukjent bruker"}</span>
              </div>

              <div className="admin-photo-actions">
                {photo.url && (
                  <a
                    className="outline-action compact"
                    href={photo.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink size={15} /> Åpne
                  </a>
                )}
                <button
                  className="admin-item-delete"
                  type="button"
                  disabled={saving}
                  onClick={() => void deletePhoto(index)}
                >
                  <Trash2 size={15} /> Slett bilde
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="admin-empty-photos">
          Ingen plukkebilder er lagret på ordren.
        </div>
      )}

      <div className="admin-items-heading">
        <h3>Varelinjer</h3>
        <button className="outline-action compact" onClick={() => field("items", [...(draft.items ?? []), {
          id:`new-${Date.now()}`, articleNumber:null, identifierType:"EAN", description:"", rawDescription:null, lineComment:null, bestNumber:null, quantity:1, unit:"Stk", checked:false, isFreight:false
        }])}><Plus size={16}/> Legg til varelinje</button>
      </div>

      <div className="admin-item-list">
        {(draft.items ?? []).map((entry,index)=>(
          <article className="admin-item-row" key={entry.id}>
            <div className="admin-item-top"><strong>Varelinje {index+1}</strong><button onClick={()=>field("items",(draft.items??[]).filter((_,i)=>i!==index))}><Trash2 size={16}/> Slett linje</button></div>
            <div className="admin-item-grid">
              <label>Type<select value={entry.identifierType || "EAN"} onChange={(e)=>item(index,{identifierType:e.target.value as "EAN"|"PLU"})}><option>EAN</option><option>PLU</option></select></label>
              <label>EAN/PLU<input value={entry.articleNumber || ""} onChange={(e)=>item(index,{articleNumber:e.target.value})}/></label>
              <label className="wide">Varetekst<input value={entry.description || ""} onChange={(e)=>item(index,{description:e.target.value})}/></label>
              <label>Best.nr.<input value={entry.bestNumber || ""} onChange={(e)=>item(index,{bestNumber:e.target.value})}/></label>
              <label>Antall<input type="number" step="any" value={entry.quantity} onChange={(e)=>item(index,{quantity:Number(e.target.value)})}/></label>
              <label>Enhet<select value={entry.unit || "Stk"} onChange={(e)=>item(index,{unit:e.target.value})}><option>Stk</option><option>Meter</option><option>M</option><option>Pk</option><option>Sett</option></select></label>
              <label className="wide">Radtekst<input value={entry.rawDescription || ""} onChange={(e)=>item(index,{rawDescription:e.target.value})}/></label>
              <label className="wide">Linjekommentar<textarea rows={2} value={entry.lineComment || ""} onChange={(e)=>item(index,{lineComment:e.target.value})}/></label>
              <label className="check"><input type="checkbox" checked={Boolean(entry.checked)} onChange={(e)=>item(index,{checked:e.target.checked})}/> Markert plukket</label>
              <label className="check"><input type="checkbox" checked={Boolean(entry.isFreight)} onChange={(e)=>item(index,{isFreight:e.target.checked})}/> Fraktlinje</label>
            </div>
          </article>
        ))}
      </div>

      <div className="admin-editor-actions">
        <button className="admin-reset-button" onClick={() => void resetToPick()}><RotateCcw size={17}/> Tilbakestill</button>
        <button className="outline-action" onClick={()=>setOpen(false)}><X size={17}/> Avbryt</button>
        <button className="blue-action" disabled={saving} onClick={()=>void save()}><Save size={17}/> {saving ? "Lagrer …" : "Lagre endringer"}</button>
      </div>
    </section>
  );
}
