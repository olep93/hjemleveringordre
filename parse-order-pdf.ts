import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireRole } from "@/lib/auth";
import type { NotificationEvent } from "@/lib/notifications";

const ALL_EVENTS: NotificationEvent[] = [
  "NEW_ORDER",
  "READY_FOR_LOADING",
  "LOADED",
  "DELIVERED"
];

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(["ADMIN"]);
    const { id } = await context.params;
    const body = (await request.json()) as {
      active?: boolean;
      events?: NotificationEvent[];
    };

    const update: Record<string, unknown> = {
      updatedAt: new Date().toISOString()
    };

    if (typeof body.active === "boolean") update.active = body.active;
    if (Array.isArray(body.events)) {
      update.events = body.events.filter((event) =>
        ALL_EVENTS.includes(event)
      );
    }

    await adminDb.collection("notificationRecipients").doc(id).update(update);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Ingen tilgang." }, { status: 403 });
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(["ADMIN"]);
    const { id } = await context.params;
    await adminDb.collection("notificationRecipients").doc(id).delete();
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Ingen tilgang." }, { status: 403 });
  }
}
