import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { requireRole, requireUser } from "@/lib/auth";
import { sendOrderNotification } from "@/lib/notifications";
import { parseOrderPdf } from "@/lib/orders/parse-order-pdf";
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

    return NextResponse.json({
      order: {
        id,
        ...data,
        title: buildTitle(data.orderNumber, data.customerName),
        createdAt: data.createdAt?.toDate?.()?.toISOString?.() ?? null,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString?.() ?? null,
        originalDocumentUrl: fileUrl(data.originalDocumentBlob),
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
    };

    const actorName = body.actorName?.trim() || "Ukjent";
    const ref = adminDb.collection("orders").doc(id);
    const snapshot = await ref.get();

    if (!snapshot.exists) {
      return NextResponse.json({ error: "Ordren finnes ikke." }, { status: 404 });
    }

    const current = snapshot.data()!;
    const items = Array.isArray(current.items) ? current.items : [];
    const photos = Array.isArray(current.photos) ? current.photos : [];

    const incompleteItems = items.filter(
      (item: { checked?: boolean; isFreight?: boolean }) =>
        !item.checked && !item.isFreight
    );

    if (body.status === "READY_FOR_LOADING") {
      if (incompleteItems.length > 0) {
        return NextResponse.json(
          { error: "Alle plukkbare varelinjer må være krysset av først." },
          { status: 400 }
        );
      }

      if (!body.placement) {
        return NextResponse.json(
          { error: "Velg plassering før ordren settes klar for lasting." },
          { status: 400 }
        );
      }

      if (photos.length === 0) {
        return NextResponse.json(
          { error: "Last opp minst ett bilde av ferdig ordre først." },
          { status: 400 }
        );
      }
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

    if (body.status) update.status = body.status;
    if ("placement" in body) update.placement = body.placement || null;
    if ("deliveryDate" in body) update.deliveryDate = body.deliveryDate || null;
    if ("comment" in body) update.comment = body.comment || null;
    if ("orderNumber" in body) update.orderNumber = newOrderNumber;
    if ("customerName" in body) update.customerName = newCustomerName;
    if ("phone" in body) update.phone = body.phone?.trim() || null;

    if (body.status === "PICKING") {
      update.pickedBy = actorName;
      update.pickingStartedAt = FieldValue.serverTimestamp();
    }

    if (body.status === "READY_FOR_LOADING") {
      update.pickedBy = actorName;
      update.pickedAt = FieldValue.serverTimestamp();
    }

    await ref.update(update);

    if (body.status === "READY_FOR_LOADING") {
      const latest = (await ref.get()).data()!;

      await sendOrderNotification({
        subject: `${latest.title ?? "Ordre"} er klar for lasting`,
        html: `
          <h2>${latest.title ?? "Hjemlevering"}</h2>
          <p>Ordren er ferdig plukket av <strong>${actorName}</strong>.</p>
          <p>Plassering: <strong>${latest.placement ?? "Ikke valgt"}</strong></p>
          <p>Leveringsdato: <strong>${latest.deliveryDate ?? "Ikke satt"}</strong></p>
        `
      });
    }

    await ref.collection("events").add({
      type: body.status ? "STATUS_CHANGED" : "ORDER_UPDATED",
      description: body.status
        ? `Status endret til ${body.status} av ${actorName}.`
        : `Ordren ble oppdatert av ${actorName}.`,
      actorType: "USER",
      actorName,
      createdAt: FieldValue.serverTimestamp()
    });

    return NextResponse.json({ ok: true });
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
            "Denne eldre ordren ligger i Firebase Storage. Slett den og send PDF-en på nytt for å flytte den til Vercel Blob."
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

    await ref.update({
      orderNumber,
      customerName,
      phone: parsed.phone ?? data.phone ?? null,
      orderDate: parsed.orderDate ?? data.orderDate ?? null,
      seller: parsed.seller ?? data.seller ?? null,
      items: parsed.items.length > 0 ? parsed.items : data.items ?? [],
      rawExtractedText: parsed.rawText,
      parserVersion: parsed.parserVersion,
      parsingSummary: {
        foundOrderNumber: Boolean(parsed.orderNumber),
        foundCustomerName: Boolean(parsed.customerName),
        itemCount: parsed.items.length
      },
      title: buildTitle(orderNumber, customerName),
      status:
        data.status === "DEVIATION" && orderNumber ? "TO_PICK" : data.status,
      importError: null,
      updatedAt: FieldValue.serverTimestamp()
    });

    await ref.collection("events").add({
      type: "ORDER_REPARSED",
      description: `Originaldokumentet ble tolket på nytt av ${
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
      itemCount: parsed.items.length
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

    try {
      await deletePrivateBlobs([
        original?.url,
        original?.pathname,
        ...photos.flatMap((photo: BlobReference) => [
          photo.url,
          photo.pathname
        ])
      ]);
    } catch (blobError) {
      console.warn(
        "Blob-filer kunne ikke slettes. Firestore-ordren slettes likevel:",
        blobError
      );
    }

    await adminDb.recursiveDelete(ref);

    return NextResponse.json({
      ok: true,
      deletedBy: user.displayName
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Kunne ikke slette ordren.";

    console.error("Delete order failed:", error);

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
