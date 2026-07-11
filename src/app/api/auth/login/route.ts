import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import {
  createSession,
  ensureBootstrapData,
  verifyPassword,
  type UserRole
} from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    await ensureBootstrapData();

    const body = (await request.json()) as {
      username?: string;
      password?: string;
    };

    const username = String(body.username || "").trim();
    const password = String(body.password || "");

    const snapshot = await adminDb
      .collection("users")
      .where("usernameLower", "==", username.toLowerCase())
      .limit(1)
      .get();

    if (snapshot.empty) {
      return NextResponse.json(
        { error: "Feil brukernavn eller passord." },
        { status: 401 }
      );
    }

    const doc = snapshot.docs[0];
    const data = doc.data();

    if (data.active === false || !verifyPassword(password, data.passwordHash)) {
      return NextResponse.json(
        { error: "Feil brukernavn eller passord." },
        { status: 401 }
      );
    }

    await createSession({
      id: doc.id,
      username: data.username,
      displayName: data.displayName || data.username,
      role: data.role as UserRole
    });

    return NextResponse.json({
      ok: true,
      user: {
        id: doc.id,
        username: data.username,
        displayName: data.displayName || data.username,
        role: data.role
      }
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Innlogging feilet." },
      { status: 500 }
    );
  }
}
