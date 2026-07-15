import { Resend } from "resend";
import { adminDb } from "@/lib/firebase/admin";

export type NotificationEvent =
  | "NEW_ORDER"
  | "READY_FOR_LOADING"
  | "LOADED"
  | "DELIVERED";

type NotificationItem = {
  productName?: string | null;
  description?: string | null;
  quantity?: number | string | null;
  unit?: string | null;
  articleNumber?: string | null;
  lineComment?: string | null;
  identifierType?: "EAN" | "PLU" | null;
  isFreight?: boolean;
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
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function formatOrderItemsHtml(
  items: NotificationItem[] | null | undefined
): string {
  const rows = (Array.isArray(items) ? items : []).filter(
    (item) => !item.isFreight
  );

  if (rows.length === 0) {
    return "<p><em>Ingen varelinjer ble registrert.</em></p>";
  }

  const body = rows
    .map((item) => {
      const name = item.productName || item.description || "Ukjent vare";
      const amount = `${item.quantity ?? "–"} ${item.unit ?? ""}`.trim();
      const identifier = item.articleNumber
        ? `<div style="color:#64748b;font-size:12px;margin-top:3px;">${
            item.identifierType === "PLU" ? "PLU" : "EAN"
          } ${escapeHtml(item.articleNumber)}</div>`
        : "";
      const comment = item.lineComment
        ? `<div style="color:#7c5a15;font-size:12px;margin-top:5px;">${escapeHtml(
            item.lineComment
          ).replace(/\n/g, "<br/>")}</div>`
        : "";

      return `
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;">
            <strong>${escapeHtml(name)}</strong>
            ${identifier}
            ${comment}
          </td>
          <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;text-align:right;white-space:nowrap;">
            <strong>${escapeHtml(amount)}</strong>
          </td>
        </tr>
      `;
    })
    .join("");

  return `
    <table role="presentation" style="width:100%;border-collapse:collapse;margin:14px 0;border:1px solid #dbe5f1;border-radius:10px;overflow:hidden;">
      <thead>
        <tr style="background:#eef5ff;color:#002b67;">
          <th style="padding:9px 12px;text-align:left;">Vare</th>
          <th style="padding:9px 12px;text-align:right;">Antall</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
  `;
}

export async function getNotificationEmails(
  event: NotificationEvent
): Promise<string[]> {
  const snapshot = await adminDb
    .collection("notificationRecipients")
    .where("active", "==", true)
    .get();

  return snapshot.docs
    .filter((doc) => {
      const events = doc.data().events;
      return (
        !Array.isArray(events) ||
        events.length === 0 ||
        events.includes(event)
      );
    })
    .map((doc) => String(doc.data().email || "").trim())
    .filter(Boolean);
}

export async function sendOrderNotification(input: {
  event: NotificationEvent;
  subject: string;
  html: string;
}): Promise<{ sent: number; error?: string }> {
  const recipients = await getNotificationEmails(input.event);
  if (recipients.length === 0) return { sent: 0 };

  const { error } = await resend.emails.send({
    from: fromAddress,
    to: recipients,
    subject: input.subject,
    html: input.html
  });

  if (error) {
    console.error("Notification email failed:", error);
    return { sent: 0, error: error.message };
  }

  return { sent: recipients.length };
}
