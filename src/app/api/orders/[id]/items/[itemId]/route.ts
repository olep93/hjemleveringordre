import { requireRole } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    await requireRole(["EMPLOYEE", "MANAGER", "ADMIN"]);
    const { id, itemId } = await context.params;
    const body = await request.json() as {
      checked: boolean;
      actorName?: string;
    };

    const actorName = body.actorName?.trim() || "Ukjent";
    const ref = adminDb.collection("orders").doc(id);
    const snapshot = await ref.get();

    if (!snapshot.exists) {
      return NextResponse.json({ error: "Ordren finnes ikke." }, { status: 404 });
    }

    const data = snapshot.data()!;
    const items = Array.isArray(data.items) ? [...data.items] : [];
    const index = items.findIndex((item: { id?: string }) => item.id === itemId);

    if (index < 0) {
      return NextResponse.json({ error: "Varelinjen finnes ikke." }, { status: 404 });
    }

    items[index] = {
      ...items[index],
      checked: body.checked,
      checkedBy: body.checked ? actorName : null,
      checkedAt: body.checked ? new Date().toISOString() : null
    };

    await ref.update({
      items,
      updatedAt: FieldValue.serverTimestamp()
    });

    await ref.collection("events").add({
      type: body.checked ? "ITEM_CHECKED" : "ITEM_UNCHECKED",
      description: `${items[index].description} ${
        body.checked ? "krysset av" : "åpnet igjen"
      } av ${actorName}.`,
      actorType: "USER",
      actorName,
      createdAt: FieldValue.serverTimestamp()
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kunne ikke oppdatere varelinjen." },
      { status: 400 }
    );
  }
}
