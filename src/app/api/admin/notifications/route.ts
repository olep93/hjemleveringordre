import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireRole } from "@/lib/auth";

function idFromEmail(email: string) {
  return email.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
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
        ...doc.data()
      }))
    });
  } catch (error) {
    return NextResponse.json({ error: "Ingen tilgang." }, { status: 403 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireRole(["ADMIN"]);
    const body = (await request.json()) as { email?: string };
    const email = String(body.email || "").trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Ugyldig e-postadresse." }, { status: 400 });
    }

    await adminDb.collection("notificationRecipients").doc(idFromEmail(email)).set({
      email,
      active: true,
      createdAt: new Date().toISOString()
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: "Ingen tilgang." }, { status: 403 });
  }
}
