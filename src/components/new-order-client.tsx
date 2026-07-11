"use client";

import Link from "next/link";
import { ArrowLeft, Camera, FileUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export default function NewOrderPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const formData = new FormData(event.currentTarget);
      const response = await fetch("/api/orders/manual", {
        method: "POST",
        body: formData
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Kunne ikke opprette ordre.");
      router.push(`/orders/${result.id}`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Kunne ikke opprette ordre.");
      setSaving(false);
    }
  }

  return (
    <main className="page-shell">
      <div className="page-header">
        <Link className="back-link" href="/"><ArrowLeft size={19} /> Tilbake</Link>
        <div><p className="eyebrow">RESERVELØSNING</p><h1>Legg til ordre manuelt</h1></div>
      </div>

      <form className="form-card" onSubmit={submit}>
        <div className="upload-box">
          <FileUp size={32} />
          <div>
            <strong>Last opp PDF eller ta bilde av ordrearket</strong>
            <p>PDF tolkes automatisk. Bilde lagres og kan kontrolleres manuelt.</p>
          </div>
          <input name="file" type="file" accept="application/pdf,image/*" capture="environment" />
        </div>

        <div className="form-grid">
          <label>Ordrenummer<input name="orderNumber" placeholder="F.eks. 539" /></label>
          <label>Kundenavn<input name="customerName" placeholder="Navn på kunde" /></label>
          <label>Telefon<input name="phone" inputMode="tel" placeholder="Mobilnummer" /></label>
          <label>Leveringsdato<input name="deliveryDate" type="date" /></label>
          <label>Opprettet av<input name="createdBy" required placeholder="Ditt navn" /></label>
          <label className="full">Kommentar<textarea name="comment" rows={4} placeholder="Eventuell merknad eller avvik" /></label>
        </div>

        {error && <div className="error-box">{error}</div>}
        <button className="primary-button large" disabled={saving}>
          <Camera size={19} /> {saving ? "Oppretter …" : "Opprett ordre"}
        </button>
      </form>
    </main>
  );
}
