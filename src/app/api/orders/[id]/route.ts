import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { randomBytes } from "crypto";
import { adminDb } from "@/lib/firebase/admin";
import { requireRole, requireUser } from "@/lib/auth";
import {
  formatOrderItemsHtml,
  sendOrderNotification
} from "@/lib/notifications";
import { parseOrderPdf } from "@/lib/orders/parse-order-pdf";
import { enrichOrderItems } from "@/lib/orders/enrich-products";
import {
  deletePrivateBlobs,
  privateFileRouteUrl,
  readPrivateBlobBuffer
} from "@/lib/blob-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BlobReference = {
  url?: string;
  pathname?: string;
  filename?: string;
  contentType?: string;
};

type OrderItem = {
  id?: string;
  description?: string;
  rawDescription?: string | null;
  lineComment?: string | null;
  identifierType?: "EAN" | "PLU" | null;
  productName?: string | null;
  articleNumber?: string | null;
  bestNumber?: string | null;
  quantity?: number;
  unit?: string | null;
  deliveredQuantity?: number | null;
  price?: number | null;
  lineTotal?: number | null;
  checked?: boolean;
  checkedBy?: string | null;
  checkedAt?: string | null;
  isFreight?: boolean;
  productImageBlob?: BlobReference | null;
};

function buildTitle(orderNumber?: string | null, customerName?: string | null) {
  if (orderNumber && customerName) {
    return `Kundeordre ${orderNumber} – ${customerName}`;
  }
  if (orderNumber) return `Kundeordre ${orderNumber}`;
  if (customerName) return `Hjemlevering – ${customerName}`;
  return "Ny ordre – må kontrolleres";
}

function fileUrl(blob?: BlobReference | null): string | null {
  if (!blob?.pathname) return null;
  return privateFileRouteUrl(blob.pathname, blob.filename);
}

function applyItemChecks(
  originalItems: OrderItem[],
  checks: Array<{ id: string; checked: boolean }> | undefined,
  actorName: string
): OrderItem[] {
  if (!Array.isArray(checks)) return originalItems;

  const checkMap = new Map(checks.map((entry) => [entry.id, entry.checked]));

  return originalItems.map((item) => {
    if (!item.id || item.isFreight || !checkMap.has(item.id)) return item;

    const checked = Boolean(checkMap.get(item.id));
    const changed = checked !== Boolean(item.checked);

    return {
      ...item,
      checked,
      checkedBy: checked ? actorName : null,
      checkedAt: checked
        ? changed
          ? new Date().toISOString()
          : item.checkedAt ?? new Date().toISOString()
        : null
    };
  });
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await requireUser();

    const { id } = await context.params;
    const ref = adminDb.collection("orders").doc(id);
    const snapshot = await ref.get();

    if (!snapshot.exists) {
      return NextResponse.json({ error: "Ordren finnes ikke." }, { status: 404 });
    }

    const data = snapshot.data()!;
    const eventsSnapshot = await ref
      .collection("events")
      .orderBy("createdAt", "desc")
      .limit(100)
      .get();

    const photos = (Array.isArray(data.photos) ? data.photos : []).map(
      (photo: BlobReference & Record<string, unknown>) => ({
        ...photo,
        url: photo.pathname
          ? privateFileRouteUrl(photo.pathname, photo.filename)
          : null
      })
    );

    const items = (Array.isArray(data.items) ? data.items : []).map(
      (
        item: Record<string, unknown> & {
          productImageBlob?: BlobReference | null;
          productImageSourceUrl?: string | null;
        }
      ) => ({
        ...item,
        productImageUrl: item.productImageBlob?.pathname
          ? privateFileRouteUrl(
              item.productImageBlob.pathname,
              item.productImageBlob.filename
            )
          : typeof item.productImageSourceUrl === "string"
            ? `/api/product-image?url=${encodeURIComponent(
                item.productImageSourceUrl
              )}`
            : null
      })
    );

    return NextResponse.json({
      order: {
        id,
        ...data,
        title: buildTitle(data.orderNumber, data.customerName),
        createdAt: data.createdAt?.toDate?.()?.toISOString?.() ?? null,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString?.() ?? null,
        originalDocumentUrl: fileUrl(data.originalDocumentBlob),
        items,
        hasLegacyFirebaseDocument: Boolean(
          data.originalDocumentPath && !data.originalDocumentBlob
        ),
        photos,
        events: eventsSnapshot.docs.map((doc) => {
          const event = doc.data();
          return {
            id: doc.id,
            ...event,
            createdAt: event.createdAt?.toDate?.()?.toISOString?.() ?? null
          };
        })
      }
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Kunne ikke hente ordre.";

    return NextResponse.json(
      { error: message },
      { status: message === "UNAUTHORIZED" ? 401 : 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(["EMPLOYEE", "MANAGER", "ADMIN"]);

    const { id } = await context.params;
    const body = (await request.json()) as {
      status?: string;
      actorName?: string;
      placement?: string | null;
      deliveryDate?: string | null;
      comment?: string | null;
      orderNumber?: string | null;
      customerName?: string | null;
      phone?: string | null;
      itemChecks?: Array<{ id: string; checked: boolean }>;
      pickingSessionEnded?: boolean;
      fulfillmentMethod?: "THIS_THURSDAY" | "NEXT_THURSDAY" | "OWN_VEHICLE";
      pickupDate?: string | null;
      pickupRecipientEmail?: string | null;
      locationCode?: string | null;
      adminAction?: "RESET_TO_PICK";
      adminEdit?: {
        title?: string | null;
        orderNumber?: string | null;
        customerName?: string | null;
        phone?: string | null;
        deliveryAddress?: string | null;
        deliveryDate?: string | null;
        placement?: string | null;
        locationCode?: string | null;
        comment?: string | null;
        fulfillmentMethod?: "THIS_THURSDAY" | "NEXT_THURSDAY" | "OWN_VEHICLE" | null;
        pickupDate?: string | null;
        pickupRecipientEmail?: string | null;
        items?: OrderItem[];
      };
    };

    const actorName = body.actorName?.trim() || "Ukjent";
    const ref = adminDb.collection("orders").doc(id);
    const snapshot = await ref.get();

    if (!snapshot.exists) {
      return NextResponse.json({ error: "Ordren finnes ikke." }, { status: 404 });
    }

    const current = snapshot.data()!;
    const currentItems: OrderItem[] = Array.isArray(current.items)
      ? current.items
      : [];

    if (body.adminAction || body.adminEdit) {
      const admin = await requireRole(["ADMIN"]);

      if (body.adminAction === "RESET_TO_PICK") {
        const resetItems = currentItems.map((item) => ({
          ...item,
          checked: item.isFreight ? true : false,
          checkedBy: item.isFreight ? "SYSTEM" : null,
          checkedAt: item.isFreight ? item.checkedAt ?? new Date().toISOString() : null
        }));

        await ref.update({
          status: "TO_PICK",
          items: resetItems,
          pickedBy: null,
          pickedAt: null,
          pickingStartedAt: null,
          pickingSessionOpen: false,
          lastPickingSavedAt: null,
          lastPickingSavedBy: null,
          fulfillmentMethod: null,
          pickupDate: null,
          pickupShareToken: null,
          updatedAt: FieldValue.serverTimestamp()
        });

        await ref.collection("events").add({
          type: "ADMIN_RESET_TO_PICK",
          description: `Ordren ble tilbakestilt til «Må plukkes» av ${admin.displayName}.`,
          actorType: "USER",
          actorName: admin.displayName,
          createdAt: FieldValue.serverTimestamp()
        });

        return NextResponse.json({ ok: true });
      }

      const edit = body.adminEdit!;
      const orderNumber = edit.orderNumber?.trim() || null;
      const customerName = edit.customerName?.trim() || null;
      const editedItems = Array.isArray(edit.items)
        ? edit.items
            .filter((item) => String(item.description ?? "").trim())
            .map((item, index) => {
              const articleNumber = String(item.articleNumber ?? "").trim() || null;
              const identifierType =
                item.identifierType === "PLU" ||
                (articleNumber && !/^\d{12,14}$/.test(articleNumber))
                  ? "PLU"
                  : "EAN";

              return {
                ...item,
                id: item.id || `admin-${Date.now()}-${index}`,
                articleNumber,
                identifierType,
                description: String(item.description ?? "").trim(),
                rawDescription: String(item.rawDescription ?? "").trim() || null,
                lineComment: String(item.lineComment ?? "").trim() || null,
                bestNumber: String(item.bestNumber ?? "").trim() || null,
                quantity: Number(item.quantity) || 1,
                unit: String(item.unit ?? "Stk").trim() || "Stk",
                checked: Boolean(item.checked),
                checkedBy: item.checked ? item.checkedBy ?? admin.displayName : null,
                checkedAt: item.checked ? item.checkedAt ?? new Date().toISOString() : null,
                isFreight: Boolean(item.isFreight)
              };
            })
        : currentItems;

      await ref.update({
        title: edit.title?.trim() || buildTitle(orderNumber, customerName),
        orderNumber,
        customerName,
        phone: edit.phone?.trim() || null,
        deliveryAddress: edit.deliveryAddress?.trim() || null,
        deliveryDate: edit.deliveryDate || null,
        placement: edit.placement?.trim() || null,
        locationCode: edit.locationCode?.trim() || null,
        comment: edit.comment || null,
        fulfillmentMethod: edit.fulfillmentMethod ?? null,
        pickupDate: edit.pickupDate || null,
        pickupRecipientEmail:
          edit.pickupRecipientEmail?.trim().toLowerCase() ||
          "marcus@waypointlarvik.no",
        items: editedItems,
        updatedAt: FieldValue.serverTimestamp()
      });

      await ref.collection("events").add({
        type: "ADMIN_ORDER_EDITED",
        description: `Ordren og varelinjene ble redigert av ${admin.displayName}.`,
        actorType: "USER",
        actorName: admin.displayName,
        createdAt: FieldValue.serverTimestamp()
      });

      return NextResponse.json({ ok: true, itemCount: editedItems.length });
    }
    const nextItems = applyItemChecks(
      currentItems,
      body.itemChecks,
      actorName
    );
    const photos = Array.isArray(current.photos) ? current.photos : [];
    const placement =
      "placement" in body ? body.placement?.trim() || null : current.placement ?? null;

    const incompleteItems = nextItems.filter(
      (item) => !item.checked && !item.isFreight
    );

    if (body.status === "READY_FOR_LOADING") {
      if (incompleteItems.length > 0) {
        return NextResponse.json(
          {
            error: `${incompleteItems.length} varelinje(r) er ikke markert plukket.`
          },
          { status: 400 }
        );
      }

      if (!placement) {
        return NextResponse.json(
          { error: "Velg hvor ordren er plassert før den ferdigstilles." },
          { status: 400 }
        );
      }

      if (photos.length === 0) return NextResponse.json({ error: "Last opp minst ett bilde av ferdig ordre før den ferdigstilles." }, { status: 400 });
      if (placement === "Kasse Drive-In" && !body.locationCode?.trim()) return NextResponse.json({ error: "Skriv inn lokasjonskode for Kasse Drive-In, for eksempel B2." }, { status: 400 });
      if (!body.fulfillmentMethod || !body.pickupDate) return NextResponse.json({ error: "Velg utkjøringsmåte og dato før ordren ferdigstilles." }, { status: 400 });
    }

    const newOrderNumber =
      "orderNumber" in body
        ? body.orderNumber?.trim() || null
        : current.orderNumber ?? null;

    const newCustomerName =
      "customerName" in body
        ? body.customerName?.trim() || null
        : current.customerName ?? null;

    const update: Record<string, unknown> = {
      updatedAt: FieldValue.serverTimestamp(),
      title: buildTitle(newOrderNumber, newCustomerName)
    };

    if (Array.isArray(body.itemChecks)) update.items = nextItems;
    if (body.status) update.status = body.status;
    if ("placement" in body) update.placement = placement;
    if ("deliveryDate" in body) update.deliveryDate = body.deliveryDate || null;
    if ("comment" in body) update.comment = body.comment || null;
    if ("orderNumber" in body) update.orderNumber = newOrderNumber;
    if ("customerName" in body) update.customerName = newCustomerName;
    if ("phone" in body) update.phone = body.phone?.trim() || null;
    if ("locationCode" in body) update.locationCode = body.locationCode?.trim() || null;
    if ("fulfillmentMethod" in body) update.fulfillmentMethod = body.fulfillmentMethod ?? null;
    if ("pickupDate" in body) update.pickupDate = body.pickupDate || null;
    if ("pickupRecipientEmail" in body) update.pickupRecipientEmail = body.pickupRecipientEmail?.trim().toLowerCase() || null;

    if (body.status === "PICKING") {
      update.pickedBy = actorName;
      update.pickingStartedAt =
        current.pickingStartedAt ?? FieldValue.serverTimestamp();
      update.pickingSessionOpen = !body.pickingSessionEnded;
    }

    if (body.pickingSessionEnded) {
      update.pickingSessionOpen = false;
      update.lastPickingSavedAt = FieldValue.serverTimestamp();
      update.lastPickingSavedBy = actorName;
    }

    if (body.status === "READY_FOR_LOADING") {
      update.pickedBy = actorName;
      update.pickedAt = FieldValue.serverTimestamp();
      update.pickingSessionOpen = false;
      update.pickupShareToken =
        current.pickupShareToken || randomBytes(24).toString("hex");
    }

    await ref.update(update);

    const latestSnapshot = await ref.get();
    const latest = latestSnapshot.data()!;

    if (body.status === "READY_FOR_LOADING") {
      await sendOrderNotification({
        event: "READY_FOR_LOADING",
        subject: `${latest.title ?? "Ordre"} er ferdig plukket`,
        html: `
          <div style="font-family:Arial,sans-serif;color:#071a3a;max-width:680px;">
            <h2 style="color:#002b67;">${latest.title ?? "Hjemlevering"}</h2>
            <p>Ordren er ferdig plukket av <strong>${actorName}</strong>.</p>
            <p>
              Plassering: <strong>${latest.placement ?? "Ikke valgt"}${latest.locationCode ? ` – ${latest.locationCode}` : ""}</strong><br/>
              Utkjøring/henting: <strong>${latest.pickupDate ?? "Ikke satt"}</strong><br/>
              Plukkekommentar: <strong>${latest.comment ?? "Ingen kommentar"}</strong>
            </p>
            <h3 style="margin-bottom:6px;">Ferdig plukket</h3>
            ${formatOrderItemsHtml(latest.items)}
          </div>
        `
      });
    }

    if (body.status === "LOADED" || body.status === "DELIVERED") {
      const event = body.status === "LOADED" ? "LOADED" : "DELIVERED";

      await sendOrderNotification({
        event,
        subject:
          body.status === "LOADED"
            ? `${latest.title ?? "Ordre"} er lastet på bil`
            : `${latest.title ?? "Ordre"} er levert`,
        html: `
          <div style="font-family:Arial,sans-serif;color:#071a3a;max-width:680px;">
            <h2 style="color:#002b67;">${latest.title ?? "Hjemlevering"}</h2>
            <p>Status: <strong>${
              body.status === "LOADED" ? "Lastet på bil" : "Levert"
            }</strong></p>
            <p>Registrert av: <strong>${actorName}</strong></p>
            ${formatOrderItemsHtml(latest.items)}
          </div>
        `
      });
    }

    await ref.collection("events").add({
      type:
        body.status === "READY_FOR_LOADING"
          ? "ORDER_COMPLETED"
          : body.pickingSessionEnded
            ? "PICKING_SAVED"
            : body.status
              ? "STATUS_CHANGED"
              : "ORDER_UPDATED",
      description:
        body.status === "READY_FOR_LOADING"
          ? `Ordren ble ferdigstilt av ${actorName}.`
          : body.pickingSessionEnded
            ? `Plukkingen ble lagret og lukket av ${actorName}.`
            : body.status === "PICKING"
              ? `Plukking startet av ${actorName}.`
              : body.status
                ? `Status endret til ${body.status} av ${actorName}.`
                : `Ordren ble oppdatert av ${actorName}.`,
      actorType: "USER",
      actorName,
      createdAt: FieldValue.serverTimestamp()
    });

    return NextResponse.json({
      ok: true,
      incompleteItems: incompleteItems.length
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Kunne ikke oppdatere ordre.";

    return NextResponse.json(
      { error: message },
      {
        status:
          message === "UNAUTHORIZED"
            ? 401
            : message === "FORBIDDEN"
              ? 403
              : 400
      }
    );
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(["EMPLOYEE", "MANAGER", "ADMIN"]);

    const { id } = await context.params;
    const body = (await request.json()) as {
      action?: string;
      actorName?: string;
    };

    if (body.action !== "REPARSE") {
      return NextResponse.json({ error: "Ugyldig handling." }, { status: 400 });
    }

    const ref = adminDb.collection("orders").doc(id);
    const snapshot = await ref.get();

    if (!snapshot.exists) {
      return NextResponse.json({ error: "Ordren finnes ikke." }, { status: 404 });
    }

    const data = snapshot.data()!;
    const blob = data.originalDocumentBlob as BlobReference | null | undefined;

    if (!blob?.pathname && data.originalDocumentPath) {
      return NextResponse.json(
        {
          error:
            "Denne eldre ordren ligger i Firebase Storage. Slett den og send PDF-en på nytt."
        },
        { status: 400 }
      );
    }

    if (!blob?.pathname) {
      return NextResponse.json(
        { error: "Ordren har ikke et originaldokument å tolke." },
        { status: 400 }
      );
    }

    const buffer = await readPrivateBlobBuffer(blob.pathname);
    const parsed = await parseOrderPdf(buffer);

    const orderNumber = parsed.orderNumber ?? data.orderNumber ?? null;
    const customerName = parsed.customerName ?? data.customerName ?? null;
    const existingItems = Array.isArray(data.items) ? data.items : [];
    const enrichedItems = await enrichOrderItems(parsed.items, id, existingItems);

    await ref.update({
      orderNumber,
      customerName,
      phone: parsed.phone ?? data.phone ?? null,
      deliveryAddress:
        parsed.deliveryAddress ?? data.deliveryAddress ?? null,
      orderDate: parsed.orderDate ?? data.orderDate ?? null,
      seller: parsed.seller ?? data.seller ?? null,
      items: enrichedItems.length > 0 ? enrichedItems : data.items ?? [],
      rawExtractedText: parsed.rawText,
      parserVersion: parsed.parserVersion,
      parsingSummary: {
        foundOrderNumber: Boolean(parsed.orderNumber),
        foundCustomerName: Boolean(parsed.customerName),
        itemCount: enrichedItems.length
      },
      title: buildTitle(orderNumber, customerName),
      status:
        data.status === "DEVIATION" && orderNumber ? "TO_PICK" : data.status,
      importError: null,
      updatedAt: FieldValue.serverTimestamp()
    });

    await ref.collection("events").add({
      type: "ORDER_REPARSED",
      description: `Originaldokument og produktinformasjon ble oppdatert av ${
        body.actorName?.trim() || "Ukjent"
      }.`,
      actorType: "USER",
      actorName: body.actorName?.trim() || "Ukjent",
      createdAt: FieldValue.serverTimestamp()
    });

    return NextResponse.json({
      ok: true,
      orderNumber,
      customerName,
      itemCount: enrichedItems.length
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Kunne ikke tolke dokumentet.";

    return NextResponse.json(
      { error: message },
      { status: message === "FORBIDDEN" ? 403 : 400 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRole(["MANAGER", "ADMIN"]);

    const { id } = await context.params;
    const ref = adminDb.collection("orders").doc(id);
    const snapshot = await ref.get();

    if (!snapshot.exists) {
      return NextResponse.json(
        { error: "Ordren er allerede slettet." },
        { status: 404 }
      );
    }

    const data = snapshot.data()!;
    const original = data.originalDocumentBlob as BlobReference | undefined;
    const photos = Array.isArray(data.photos) ? data.photos : [];
    const items = Array.isArray(data.items) ? data.items : [];

    try {
      await deletePrivateBlobs([
        original?.url,
        original?.pathname,
        ...photos.flatMap((photo: BlobReference) => [
          photo.url,
          photo.pathname
        ]),
        ...items.flatMap(
          (item: { productImageBlob?: BlobReference | null }) => [
            item.productImageBlob?.url,
            item.productImageBlob?.pathname
          ]
        )
      ]);
    } catch (blobError) {
      console.warn("Blob-filer kunne ikke slettes:", blobError);
    }

    await adminDb.recursiveDelete(ref);

    return NextResponse.json({
      ok: true,
      deletedBy: user.displayName
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Kunne ikke slette ordren.";

    return NextResponse.json(
      { error: message },
      {
        status:
          message === "UNAUTHORIZED"
            ? 401
            : message === "FORBIDDEN"
              ? 403
              : 500
      }
    );
  }
}
