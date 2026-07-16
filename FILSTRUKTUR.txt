import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { hashPassword, requireRole, type UserRole } from "@/lib/auth";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const current = await requireRole(["ADMIN"]);
    const { id } = await context.params;
    const body = (await request.json()) as {
      active?: boolean;
      displayName?: string;
      role?: UserRole;
      password?: string;
    };

    if (id === current.id && body.active === false) {
      return NextResponse.json(
        { error: "Du kan ikke deaktivere din egen bruker." },
        { status: 400 }
      );
    }

    if (
      body.role &&
      !["EMPLOYEE", "MANAGER", "ADMIN"].includes(body.role)
    ) {
      return NextResponse.json({ error: "Ugyldig rolle." }, { status: 400 });
    }

    const update: Record<string, unknown> = {
      updatedAt: new Date().toISOString()
    };

    if (typeof body.active === "boolean") update.active = body.active;
    if (body.displayName?.trim()) update.displayName = body.displayName.trim();
    if (body.role) update.role = body.role;
    if (body.password !== undefined) {
      if (body.password.length < 8) {
        return NextResponse.json(
          { error: "Passordet må være minst 8 tegn." },
          { status: 400 }
        );
      }
      update.passwordHash = hashPassword(body.password);
    }

    await adminDb.collection("users").doc(id).update(update);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Feil";
    return NextResponse.json({ error: message }, { status: 403 });
  }
}
