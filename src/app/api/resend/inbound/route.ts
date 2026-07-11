import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { Resend } from "resend";
import { adminDb } from "@/lib/firebase/admin";
import { parseOrderPdf } from "@/lib/orders/parse-order-pdf";
import { getSuggestedDeliveryDate } from "@/lib/orders/delivery-date";
import { sendOrderNotification } from "@/lib/notifications";
import { ensureBootstrapData } from "@/lib/auth";
import { uploadPrivateBlob } from "@/lib/blob-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const resend = new Resend(process.env.RESEND_API_KEY);

type IncomingEvent = {
  type: string;
  created_at: string;
  data: {
    email_id: string;
    created_at?: string;
    from: string;
    to: string[];
    subject?: string | null;
    message_id?: string | null;
  };
};

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: "Resend inbound webhook",
    configured: Boolean(
      process.env.RESEND_API_KEY &&
        process.env.RESEND_WEBHOOK_SECRET &&
        process.env.FIREBASE_SERVICE_ACCOUNT &&
        process.env.BLOB_STORE_ID
    ),
    storage: "Vercel Blob private"
  });
}

export async function POST(request: NextRequest) {
  try {
    await ensureBootstrapData();

    const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
    if (!webhookSecret) throw new Error("RESEND_WEBHOOK_SECRET mangler.");

    const payload = await request.text();
    const event = resend.webhooks.verify({
      payload,
      headers: {
        id: request.headers.get("svix-id") ?? "",
        timestamp: request.headers.get("svix-timestamp") ?? "",
        signature: request.headers.get("svix-signature") ?? ""
      },
      webhookSecret
    }) as IncomingEvent;

    if (event.type !== "email.received") {
      return NextResponse.json({ ok: true, ignored: event.type });
    }

    const emailId = event.data.email_id;
    const documentId = `email-${emailId}`;
    const orderRef = adminDb.collection("orders").doc(documentId);

    if ((await orderRef.get()).exists) {
      return NextResponse.json({ ok: true, duplicate: true, emailId });
    }

    const { data: attachmentData, error: attachmentError } =
      await resend.emails.receiving.attachments.list({ emailId });

    if (attachmentError) {
      throw new Error(`Vedlegg kunne ikke hentes: ${attachmentError.message}`);
    }

    const attachments = attachmentData?.data ?? [];
    const pdfAttachment = attachments.find((attachment) => {
      const filename = attachment.filename ?? "";
      return (
        attachment.content_type === "application/pdf" ||
        filename.toLowerCase().endsWith(".pdf")
      );
    });

    let parsed: Awaited<ReturnType<typeof parseOrderPdf>> | null = null;
    let originalDocumentBlob: {
      url: string;
      pathname: string;
      filename: string;
      contentType: string;
    } | null = null;
    let importError: string | null = null;

    if (!pdfAttachment) {
      importError = "E-posten inneholdt ikke et PDF-vedlegg.";
    } else {
      try {
        const response = await fetch(pdfAttachment.download_url);

        if (!response.ok) {
          throw new Error(`PDF-nedlasting feilet med HTTP ${response.status}.`);
        }

        const pdfBuffer = Buffer.from(await response.arrayBuffer());
        parsed = await parseOrderPdf(pdfBuffer);

        const filename = pdfAttachment.filename ?? "kundeordre.pdf";
        const contentType =
          pdfAttachment.content_type || "application/pdf";

        originalDocumentBlob = await uploadPrivateBlob({
          pathnamePrefix: `orders/${documentId}/original`,
          filename,
          body: new Blob([pdfBuffer], { type: contentType }),
          contentType
        });
      } catch (error) {
        importError =
          error instanceof Error ? error.message : "Ukjent feil ved PDF-import.";
      }
    }

    const receivedAt = new Date(event.data.created_at ?? event.created_at);
    const deliveryDate = getSuggestedDeliveryDate(receivedAt);
    const orderNumber = parsed?.orderNumber ?? null;
    const customerName = parsed?.customerName ?? null;

    const title =
      orderNumber && customerName
        ? `Kundeordre ${orderNumber} – ${customerName}`
        : orderNumber
          ? `Kundeordre ${orderNumber}`
          : "Ny ordre – må kontrolleres";

    const status = pdfAttachment ? "TO_PICK" : "DEVIATION";

    await orderRef.set({
      internalId: `HL-${receivedAt.getFullYear()}-${emailId
        .replace(/-/g, "")
        .slice(0, 8)
        .toUpperCase()}`,
      title,
      orderNumber,
      customerName,
      phone: parsed?.phone ?? null,
      orderDate: parsed?.orderDate ?? null,
      deliveryDate,
      seller: parsed?.seller ?? null,
      status,
      source: "EMAIL_PDF",
      sourceEmail: {
        resendEmailId: emailId,
        messageId: event.data.message_id ?? null,
        from: event.data.from,
        to: event.data.to,
        subject: event.data.subject ?? null,
        receivedAt: receivedAt.toISOString()
      },
      attachments: attachments.map((attachment) => ({
        id: attachment.id,
        filename: attachment.filename ?? "vedlegg",
        contentType: attachment.content_type ?? "application/octet-stream"
      })),
      originalDocumentBlob,
      rawExtractedText: parsed?.rawText ?? null,
      parserVersion: parsed?.parserVersion ?? null,
      parsingSummary: parsed
        ? {
            foundOrderNumber: Boolean(parsed.orderNumber),
            foundCustomerName: Boolean(parsed.customerName),
            itemCount: parsed.items.length
          }
        : null,
      importError,
      items: parsed?.items ?? [],
      placement: null,
      pickedBy: null,
      photos: [],
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });

    await orderRef.collection("events").add({
      type: "ORDER_RECEIVED",
      description: orderNumber
        ? `Kundeordre ${orderNumber} mottatt via e-post.`
        : "E-post mottatt. Ordren må kontrolleres manuelt.",
      actorType: "SYSTEM",
      createdAt: FieldValue.serverTimestamp()
    });

    await sendOrderNotification({
      subject: `Ny hjemlevering: ${title}`,
      html: `
        <h2>${title}</h2>
        <p>En ny hjemlevering er registrert.</p>
        <p>Leveringsdato: <strong>${deliveryDate}</strong></p>
        <p>Antall varelinjer: <strong>${parsed?.items.length ?? 0}</strong></p>
      `
    });

    return NextResponse.json({
      ok: true,
      emailId,
      orderNumber,
      customerName,
      itemCount: parsed?.items.length ?? 0,
      deliveryDate,
      status,
      importError
    });
  } catch (error) {
    console.error("Inbound webhook failed:", error);

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Ukjent feil."
      },
      { status: 400 }
    );
  }
}
