import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { requireRole } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const settingsRef = adminDb.collection("appSettings").doc("email");

export async function GET() {
  try {
    await requireRole(["EMPLOYEE", "MANAGER", "ADMIN"]);

    const snapshot = await settingsRef.get();
    const data = snapshot.data();

    return NextResponse.json({
      settings: {
        waypointTestMode:
          typeof data?.waypointTestMode === "boolean"
            ? data.waypointTestMode
            : true,
        waypointEmail:
          String(data?.waypointEmail ?? "marcus@waypointlarvik.no")
            .trim()
            .toLowerCase()
      }
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Kunne ikke hente innstillinger.";

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

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireRole(["ADMIN"]);
    const body = (await request.json()) as {
      waypointTestMode?: boolean;
      waypointEmail?: string;
    };

    const update: Record<string, unknown> = {
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: user.displayName
    };

    if (typeof body.waypointTestMode === "boolean") {
      update.waypointTestMode = body.waypointTestMode;
    }

    if (typeof body.waypointEmail === "string") {
      const email = body.waypointEmail.trim().toLowerCase();

      if (!email || !email.includes("@")) {
        return NextResponse.json(
          { error: "Transportøradressen er ugyldig." },
          { status: 400 }
        );
      }

      update.waypointEmail = email;
    }

    await settingsRef.set(update, { merge: true });

    const snapshot = await settingsRef.get();
    const data = snapshot.data();

    return NextResponse.json({
      ok: true,
      settings: {
        waypointTestMode:
          typeof data?.waypointTestMode === "boolean"
            ? data.waypointTestMode
            : true,
        waypointEmail:
          String(data?.waypointEmail ?? "marcus@waypointlarvik.no")
            .trim()
            .toLowerCase()
      }
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Kunne ikke lagre innstillinger.";

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
