import { Resend } from "resend";
import { adminDb } from "@/lib/firebase/admin";

const resend = new Resend(process.env.RESEND_API_KEY);
const fromAddress =
  process.env.NOTIFICATION_FROM_EMAIL ||
  "Hjemleveringordre <varsling@hjemlevering.jobbverktoy.no>";

export async function getNotificationEmails(): Promise<string[]> {
  const snapshot = await adminDb
    .collection("notificationRecipients")
    .where("active", "==", true)
    .get();

  return snapshot.docs
    .map((doc) => String(doc.data().email || "").trim())
    .filter(Boolean);
}

export async function sendOrderNotification(input: {
  subject: string;
  html: string;
}): Promise<void> {
  const recipients = await getNotificationEmails();
  if (recipients.length === 0) return;

  const { error } = await resend.emails.send({
    from: fromAddress,
    to: recipients,
    subject: input.subject,
    html: input.html
  });

  if (error) {
    console.error("Notification email failed:", error);
  }
}
