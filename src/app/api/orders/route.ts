import { requireUser } from "@/lib/auth";
import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireUser();
    const snapshot = await adminDb
      .collection("orders")
      .orderBy("createdAt", "desc")
      .limit(200)
      .get();

    const orders = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        internalId: data.internalId ?? null,
        title: data.orderNumber
          ? `Kundeordre ${data.orderNumber}${data.customerName ? ` – ${data.customerName}` : ""}`
          : data.customerName
            ? `Hjemlevering – ${data.customerName}`
            : "Ny ordre – må kontrolleres",
        orderNumber: data.orderNumber ?? null,
        customerName: data.customerName ?? null,
        phone: data.phone ?? null,
        deliveryDate: data.deliveryDate ?? null,
        status: data.status ?? "DEVIATION",
        placement: data.placement ?? null,
        pickedBy: data.pickedBy ?? null,
        photoCount: Array.isArray(data.photos) ? data.photos.length : 0,
        itemCount: Array.isArray(data.items) ? data.items.length : 0,
        checkedItemCount: Array.isArray(data.items)
          ? data.items.filter((item: { checked?: boolean; isFreight?: boolean }) => item.checked || item.isFreight).length
          : 0,
        importError: data.importError ?? null,
        attachmentCount: Array.isArray(data.attachments) ? data.attachments.length : 0,
        createdAt: data.createdAt?.toDate?.()?.toISOString?.() ?? null
      };
    });

    return NextResponse.json({ orders });
  } catch (error) {
    return NextResponse.json(
      { orders: [], error: error instanceof Error ? error.message : "Kunne ikke hente ordre." },
      { status: 500 }
    );
  }
}
