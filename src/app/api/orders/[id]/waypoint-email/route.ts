import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { adminDb } from "@/lib/firebase/admin";
import { requireRole } from "@/lib/auth";
import { readPrivateBlobBuffer } from "@/lib/blob-storage";
import { formatOrderItemsHtml, type NotificationItem } from "@/lib/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type BlobReference = {
  pathname?: string;
  filename?: string;
  contentType?: string;
};


type WaypointOrder = {
  title?: string | null;
  source?: string | null;
  pickupRecipientEmail?: string | null;
  originalDocumentBlob?: BlobReference | null;
  photos?: BlobReference[];
  placement?: string | null;
  locationCode?: string | null;
  pickupDate?: string | null;
  transportType?: "STANDARD_CRANE_GROUND" | "LARGE_CRANE" | "VAN" | null;
  transportComment?: string | null;
  customerName?: string | null;
  deliveryAddress?: string | null;
  phone?: string | null;
  comment?: string | null;
  items?: NotificationItem[];
};

const resend = new Resend(process.env.RESEND_API_KEY);
const fromAddress =
  process.env.NOTIFICATION_FROM_EMAIL ||
  "Hjemleveringordre <varsling@hjemlevering.jobbverktoy.no>";

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRole(["EMPLOYEE", "MANAGER", "ADMIN"]);
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as {
      to?: string;
    };

    const snapshot = await adminDb.collection("orders").doc(id).get();
    if (!snapshot.exists) {
      return NextResponse.json({ error: "Ordren finnes ikke." }, { status: 404 });
    }

    const order = snapshot.data()! as WaypointOrder;
    if (order.source === "CLICK_AND_COLLECT") {
      return NextResponse.json(
        { error: "Klikk & Hent-ordre skal ikke sendes til Waypoint." },
        { status: 400 }
      );
    }

    const settingsSnapshot = await adminDb
      .collection("appSettings")
      .doc("email")
      .get();
    const emailSettings = settingsSnapshot.data();

    const configuredWaypointEmail = String(
      emailSettings?.waypointEmail || "marcus@waypointlarvik.no"
    )
      .trim()
      .toLowerCase();

    const waypointEmail = String(
      body.to || order.pickupRecipientEmail || configuredWaypointEmail
    )
      .trim()
      .toLowerCase();

    const loggedInEmail = String(user.username ?? "")
      .trim()
      .toLowerCase();

    if (!loggedInEmail || !loggedInEmail.includes("@")) {
      return NextResponse.json(
        {
          error:
            "Den innloggede brukeren må ha jobb-e-post som brukernavn for å sende testmail."
        },
        { status: 400 }
      );
    }

    if (!waypointEmail || !waypointEmail.includes("@")) {
      return NextResponse.json(
        { error: "Waypoint-adressen er ugyldig." },
        { status: 400 }
      );
    }

    // Testmodus styres fra administrasjonspanelet.
    // Standard er aktivert, slik at nye oppsett aldri sender til transportør
    // før en administrator uttrykkelig slår testmodus av.
    const testMode =
      typeof emailSettings?.waypointTestMode === "boolean"
        ? emailSettings.waypointTestMode
        : true;

    const to = testMode ? loggedInEmail : waypointEmail;
    const cc = testMode ? undefined : loggedInEmail;

    const attachments: Array<{ filename: string; content: Buffer }> = [];
    let totalBytes = 0;
    const maxBytes = 30 * 1024 * 1024;

    async function addAttachment(file?: BlobReference | null) {
      if (!file?.pathname) return;
      const content = await readPrivateBlobBuffer(file.pathname);
      totalBytes += content.length;
      if (totalBytes > maxBytes) {
        throw new Error(
          "Vedleggene er større enn 30 MB. Fjern noen bilder og prøv igjen."
        );
      }
      attachments.push({
        filename: file.filename || `vedlegg-${attachments.length + 1}`,
        content
      });
    }

    await addAttachment(order.originalDocumentBlob as BlobReference | null);
    for (const photo of Array.isArray(order.photos) ? order.photos : []) {
      await addAttachment(photo as BlobReference);
    }

    const placement = `${order.placement ?? "Ikke valgt"}${
      order.locationCode ? ` – ${order.locationCode}` : ""
    }`;

    const transportTypeLabel =
      order.transportType === "LARGE_CRANE"
        ? "Kranbil stor"
        : order.transportType === "VAN"
          ? "Varebil"
          : "Standard kranbil til bakkeplan";

    const transportWarning =
      order.transportType === "LARGE_CRANE"
        ? "NB: Dette påløper ekstrakostnad utenfor standard leveringsvilkår, kontakt Waypoint direkte for priser."
        : order.transportType === "VAN"
          ? "NB: Innbæring må eventuelt avtales direkte med Waypoint. Dette er kun levering med varebil."
          : "NB: Standard levering leveres normalt kun til bakkeplan og løftes rett av bil. For andre avtaler må transportør kontaktes.";

    const html = `
      <div style="font-family:Arial,sans-serif;color:#071a3a;max-width:720px;line-height:1.45;">
        <div style="margin-bottom:20px;padding:18px;border:3px solid #c62828;background:#fff3f3;text-align:center;color:#9b1c1c;">
          <div style="font-size:24px;font-weight:900;line-height:1.2;">DENNE E-POSTEN KAN IKKE BESVARES</div>
          <div style="margin-top:10px;font-size:18px;font-weight:800;">Alle henvendelser vedrørende denne e-posten må sendes til <a href="mailto:obsbygg.tonsberg@coop.no" style="color:#002b67;text-decoration:underline;">obsbygg.tonsberg@coop.no</a></div>
        </div>
        <h2 style="color:#002b67;margin-bottom:8px;">${escapeHtml(
          order.title ?? "Ferdig plukket ordre"
        )}</h2>
        <p>Hei,</p>
        <p>Følgende ordre er ferdig plukket og klar for avtalt utkjøring/henting.</p>
        <table role="presentation" style="border-collapse:collapse;width:100%;margin:16px 0;">
          <tr><td style="padding:6px 0;color:#64748b;">Dato</td><td style="padding:6px 0;"><strong>${escapeHtml(order.pickupDate ?? "Ikke satt")}</strong></td></tr><tr><td style="padding:6px 0;color:#64748b;">Transporttype</td><td style="padding:6px 0;"><strong>${escapeHtml(transportTypeLabel)}</strong></td></tr>
          <tr>
            <td colspan="2" style="padding:10px 12px;background:#fff0f0;border-left:4px solid #c62828;color:#9b1c1c;font-weight:800;">
              ${escapeHtml(transportWarning)}
            </td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;">Kommentar til transportør</td>
            <td style="padding:6px 0;"><strong>${escapeHtml(order.transportComment ?? "Ingen kommentar")}</strong></td>
          </tr>
          <tr><td style="padding:6px 0;color:#64748b;">Plassering</td><td style="padding:6px 0;"><strong>${escapeHtml(placement)}</strong></td></tr>
          <tr><td style="padding:6px 0;color:#64748b;">Kunde</td><td style="padding:6px 0;">${escapeHtml(order.customerName ?? "")}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b;">Adresse</td><td style="padding:6px 0;">${escapeHtml(order.deliveryAddress ?? "")}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b;">Telefon</td><td style="padding:6px 0;">${escapeHtml(order.phone ?? "")}</td></tr>
        </table>
        <h3 style="margin-bottom:6px;">Kommentar fra plukking</h3>
        <div style="padding:12px;background:#fff8df;border-left:4px solid #e6a700;border-radius:6px;white-space:pre-wrap;">${escapeHtml(
          order.comment ?? "Ingen kommentar"
        )}</div>
        <h3 style="margin-top:20px;margin-bottom:6px;">Varelinjer</h3>
        ${formatOrderItemsHtml(order.items ?? [])}
        <p style="margin-top:18px;">Original kundeordre og bilder av ferdig plukket ordre ligger vedlagt.</p>
        <p>Med vennlig hilsen<br/><strong>Obs BYGG Tønsberg</strong></p>
      </div>
    `;

    const { error } = await resend.emails.send({
      from: fromAddress,
      to: [to],
      ...(cc ? { cc: [cc] } : {}),
      subject: `${testMode ? "[TEST] " : ""}${
        order.title ?? "Ferdig plukket ordre"
      } – ${order.pickupDate ?? ""}`,
      html: testMode
        ? `
          <div style="font-family:Arial,sans-serif;max-width:720px;margin-bottom:16px;padding:12px 14px;background:#fff4d8;border-left:4px solid #e6a700;color:#654b00;">
            <strong>TESTSENDING</strong><br/>
            Denne meldingen skulle normalt vært sendt til ${escapeHtml(
              waypointEmail
            )}. I testmodus sendes den bare til den innloggede brukeren.
          </div>
          ${html}
        `
        : html,
      attachments
    });

    if (error) throw new Error(error.message);

    await adminDb.collection("orders").doc(id).collection("events").add({
      type: "WAYPOINT_EMAIL_SENT",
      description: testMode
        ? `Testmail med ${attachments.length} vedlegg ble sendt til ${loggedInEmail} av ${user.displayName}. Planlagt Waypoint-mottaker: ${waypointEmail}.`
        : `E-post med ${attachments.length} vedlegg ble sendt til ${waypointEmail}, med kopi til ${loggedInEmail}, av ${user.displayName}.`,
      actorType: "USER",
      actorName: user.displayName,
      createdAt: new Date()
    });

    await adminDb.collection("orders").doc(id).update({
      pickupRecipientEmail: waypointEmail,
      waypointEmailSentAt: new Date(),
      waypointEmailSentBy: user.displayName
    });

    return NextResponse.json({
      ok: true,
      to,
      cc: cc ?? null,
      waypointEmail,
      testMode,
      attachmentCount: attachments.length
    });
  } catch (error) {
    console.error("Waypoint email failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "E-posten kunne ikke sendes."
      },
      { status: 400 }
    );
  }
}
