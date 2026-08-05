import { requireRole } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { parseOrderPdf } from "@/lib/orders/parse-order-pdf";
import { getSuggestedDeliveryDate } from "@/lib/orders/delivery-date";
import { uploadPrivateBlob } from "@/lib/blob-storage";
import { enrichOrderItems } from "@/lib/orders/enrich-products";
import type { ParsedOrderItem } from "@/lib/orders/parse-order-pdf";
import {
  escapeHtml,
  formatOrderItemsHtml,
  sendOrderNotification
} from "@/lib/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    await requireRole(["EMPLOYEE", "MANAGER", "ADMIN"]);

    const form = await request.formData();
    const file = form.get("file");
    const deliveryDate =
      String(form.get("deliveryDate") ?? "").trim() ||
      getSuggestedDeliveryDate(new Date());
    const comment = String(form.get("comment") ?? "").trim() || null;
    const requestedSource = String(form.get("sourceType") ?? "MANUAL");
    const createdBy = String(form.get("createdBy") ?? "").trim() || "Ukjent";

    let orderNumber = String(form.get("orderNumber") ?? "").trim() || null;
    let customerName = String(form.get("customerName") ?? "").trim() || null;
    let phone = String(form.get("phone") ?? "").trim() || null;
    let deliveryAddress =
      String(form.get("deliveryAddress") ?? "").trim() || null;
    let orderDate: string | null = null;
    let seller: string | null = null;
    let rawExtractedText: string | null = null;
    let items: ParsedOrderItem[] = [];
    const itemsJson = String(form.get("itemsJson") ?? "").trim();
    if (itemsJson) {
      const entered = JSON.parse(itemsJson) as Array<{articleNumber?: string; description?: string; quantity?: string | number; unit?: string}>;
      items = entered.filter((x) => x.description?.trim()).map((x, index) => {
        const raw = String(x.description ?? "").trim();
        const open = raw.match(/^(?:ÅPEN|APEN)\s+PLU\s+(.+)$/i);
        return {
          id: `manual-${Date.now()}-${index}`,
          articleNumber: open || !/^\d{12,14}$/.test(String(x.articleNumber ?? "")) ? null : String(x.articleNumber),
          description: open ? open[1].trim() : raw,
          rawDescription: open ? raw : null,
          lineComment: null,
          identifierType:
            open ||
            !/^\d{12,14}$/.test(
              String(x.articleNumber ?? "").trim()
            )
              ? "PLU"
              : "EAN",
          bestNumber: null,
          quantity: Number(x.quantity) || 1,
          unit: String(x.unit ?? "Stk"),
          deliveredQuantity: null, price: null, lineTotal: null,
          checked: false, checkedBy: null, checkedAt: null,
          isFreight: /frakt/i.test(raw)
        } satisfies ParsedOrderItem;
      });
    }

    const orderRef = adminDb.collection("orders").doc();
    let originalDocumentBlob: {
      url: string;
      pathname: string;
      filename: string;
      contentType: string;
    } | null = null;
    let source = requestedSource === "CLICK_AND_COLLECT" ? "CLICK_AND_COLLECT" : "MANUAL";

    if (file instanceof File && file.size > 0) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const contentType = file.type || "application/octet-stream";

      originalDocumentBlob = await uploadPrivateBlob({
        pathnamePrefix: `orders/${orderRef.id}/original`,
        filename: file.name || "ordrevedlegg",
        body: new Blob([buffer], { type: contentType }),
        contentType
      });

      if (
        file.type === "application/pdf" ||
        file.name.toLowerCase().endsWith(".pdf")
      ) {
        source = requestedSource === "CLICK_AND_COLLECT" ? "CLICK_AND_COLLECT" : "MANUAL_PDF";

        try {
          const parsed = await parseOrderPdf(buffer);
          orderNumber = orderNumber ?? parsed.orderNumber;
          customerName = customerName ?? parsed.customerName;
          phone = phone ?? parsed.phone;
          deliveryAddress = deliveryAddress ?? parsed.deliveryAddress;
          orderDate = parsed.orderDate;
          seller = parsed.seller;
          rawExtractedText = parsed.rawText;
          if (items.length === 0) items = parsed.items;
        } catch {
          // Dokumentet lagres selv om tolkingen feiler.
        }
      } else {
        source = requestedSource === "CLICK_AND_COLLECT" ? "CLICK_AND_COLLECT" : "MANUAL_IMAGE";
      }
    }

    const enrichedItems =
      items.length > 0 ? await enrichOrderItems(items, orderRef.id) : [];

    const title = orderNumber
      ? `Kundeordre ${orderNumber}${customerName ? ` – ${customerName}` : ""}`
      : customerName
        ? `Hjemlevering – ${customerName}`
        : "Ny manuell ordre";

    await orderRef.set({
      internalId: `HL-${new Date().getFullYear()}-${orderRef.id
        .slice(0, 8)
        .toUpperCase()}`,
      title,
      orderNumber,
      customerName,
      phone,
      deliveryAddress,
      orderDate,
      deliveryDate,
      seller,
      comment,
      status: "TO_PICK",
      source,
      originalDocumentBlob,
      rawExtractedText,
      importError: null,
      items: enrichedItems,
      placement: null,
      pickedBy: null,
      photos: [],
      locationCode: null,
      fulfillmentMethod: null,
      pickupDate: null,
      pickupRecipientEmail: null,
      createdBy,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });

    await orderRef.collection("events").add({
      type: "ORDER_CREATED_MANUALLY",
      description: `Ordren ble opprettet manuelt av ${createdBy}.`,
      actorType: "USER",
      actorName: createdBy,
      createdAt: FieldValue.serverTimestamp()
    });

    let notification: { sent: number; error?: string } | null = null;

    if (source === "CLICK_AND_COLLECT") {
      try {
        notification = await sendOrderNotification({
          event: "NEW_ORDER",
          subject: `Ny Klikk & Hent-ordre: ${title}`,
          html: `
            <div style="font-family:Arial,sans-serif;color:#071a3a;max-width:680px;">
              <h2 style="color:#002b67;">${escapeHtml(title)}</h2>
              <p>En ny Klikk &amp; Hent-ordre er registrert av <strong>${escapeHtml(createdBy)}</strong>.</p>
              <p>
                Hentedato: <strong>${deliveryDate}</strong><br/>
                Kunde: <strong>${escapeHtml(customerName ?? "Ikke registrert")}</strong><br/>
                Antall varelinjer: <strong>${enrichedItems.length}</strong>
              </p>
              <h3 style="margin-bottom:6px;">Dette skal plukkes</h3>
              ${formatOrderItemsHtml(enrichedItems)}
            </div>
          `
        });
      } catch (notificationError) {
        notification = {
          sent: 0,
          error:
            notificationError instanceof Error
              ? notificationError.message
              : "Ukjent feil ved e-postutsending."
        };
      }

      await orderRef.collection("events").add({
        type: notification.error
          ? "NEW_ORDER_NOTIFICATION_FAILED"
          : "NEW_ORDER_NOTIFICATION_SENT",
        description: notification.error
          ? `Ordren ble opprettet, men e-postvarslingen feilet: ${notification.error}`
          : notification.sent > 0
            ? `Varsel om ny Klikk & Hent-ordre ble sendt til ${notification.sent} mottaker(e).`
            : "Ordren ble opprettet, men ingen aktive mottakere var konfigurert for varsel om ny ordre.",
        actorType: "SYSTEM",
        createdAt: FieldValue.serverTimestamp()
      });
    }

    return NextResponse.json({
      ok: true,
      id: orderRef.id,
      notification
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "Kunne ikke opprette ordre."
      },
      { status: 400 }
    );
  }
}
