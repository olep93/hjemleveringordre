import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireRole } from "@/lib/auth";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const current = await requireRole(["ADMIN"]);
    const { id } = await context.params;
    const body = (await request.json()) as { active?: boolean };

    if (id === current.id && body.active === false) {
      return NextResponse.json(
        { error: "Du kan ikke deaktivere din egen bruker." },
        { status: 400 }
      );
    }

    await adminDb.collection("users").doc(id).update({
      active: body.active !== false
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Feil";
    return NextResponse.json({ error: message }, { status: 403 });
  }
}
