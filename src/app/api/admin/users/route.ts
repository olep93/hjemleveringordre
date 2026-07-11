import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { hashPassword, requireRole, type UserRole } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireRole(["ADMIN"]);
    const snapshot = await adminDb.collection("users").orderBy("username").get();
    return NextResponse.json({
      users: snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          username: data.username,
          displayName: data.displayName,
          role: data.role,
          active: data.active !== false
        };
      })
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Feil";
    return NextResponse.json(
      { error: message },
      { status: message === "UNAUTHORIZED" ? 401 : 403 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireRole(["ADMIN"]);
    const body = (await request.json()) as {
      username?: string;
      displayName?: string;
      password?: string;
      role?: UserRole;
    };

    const username = String(body.username || "").trim();
    const displayName = String(body.displayName || username).trim();
    const password = String(body.password || "");
    const role = body.role;

    if (!username || password.length < 8) {
      return NextResponse.json(
        { error: "Brukernavn og passord på minst 8 tegn er påkrevd." },
        { status: 400 }
      );
    }

    if (!["EMPLOYEE", "MANAGER", "ADMIN"].includes(String(role))) {
      return NextResponse.json({ error: "Ugyldig rolle." }, { status: 400 });
    }

    const duplicate = await adminDb
      .collection("users")
      .where("usernameLower", "==", username.toLowerCase())
      .limit(1)
      .get();

    if (!duplicate.empty) {
      return NextResponse.json(
        { error: "Brukernavnet finnes allerede." },
        { status: 409 }
      );
    }

    const ref = adminDb.collection("users").doc();
    await ref.set({
      username,
      usernameLower: username.toLowerCase(),
      displayName,
      role,
      passwordHash: hashPassword(password),
      active: true,
      mustChangePassword: false,
      createdAt: new Date().toISOString()
    });

    return NextResponse.json({ ok: true, id: ref.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Feil";
    return NextResponse.json(
      { error: message },
      { status: message === "UNAUTHORIZED" ? 401 : 403 }
    );
  }
}
