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

function idFromEmail(email: string) {
  return email.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function validEvents(value: unknown): NotificationEvent[] {
  if (!Array.isArray(value)) return ALL_EVENTS;
  const filtered = value.filter((event): event is NotificationEvent =>
    ALL_EVENTS.includes(event as NotificationEvent)
  );
  return filtered.length > 0 ? filtered : ALL_EVENTS;
}

export async function GET() {
  try {
    await requireRole(["ADMIN"]);
    const snapshot = await adminDb
      .collection("notificationRecipients")
      .orderBy("email")
      .get();

    return NextResponse.json({
      recipients: snapshot.docs.map((doc) => ({
        id: doc.id,
        email: doc.data().email,
        active: doc.data().active !== false,
        events: validEvents(doc.data().events)
      }))
    });
  } catch {
    return NextResponse.json({ error: "Ingen tilgang." }, { status: 403 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireRole(["ADMIN"]);
    const body = (await request.json()) as {
      email?: string;
      events?: NotificationEvent[];
    };
    const email = String(body.email || "").trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Ugyldig e-postadresse." }, { status: 400 });
    }

    await adminDb.collection("notificationRecipients").doc(idFromEmail(email)).set({
      email,
      active: true,
      events: validEvents(body.events),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }, { merge: true });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Ingen tilgang." }, { status: 403 });
  }
}
