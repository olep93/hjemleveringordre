import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireRole } from "@/lib/auth";
import { deletePrivateBlobs } from "@/lib/blob-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PhotoReference = {
  pathname?: string;
  filename?: string;
};

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string; index: string }> }
) {
  try {
    const user = await requireRole(["ADMIN"]);
    const { id, index: rawIndex } = await context.params;
    const index = Number(rawIndex);

    if (!Number.isInteger(index) || index < 0) {
      return NextResponse.json({ error: "Ugyldig bildeindeks." }, { status: 400 });
    }

    const ref = adminDb.collection("orders").doc(id);
    const snapshot = await ref.get();

    if (!snapshot.exists) {
      return NextResponse.json({ error: "Ordren finnes ikke." }, { status: 404 });
    }

    const photos: PhotoReference[] = Array.isArray(snapshot.data()?.photos)
      ? snapshot.data()!.photos
      : [];

    const photo = photos[index];
    if (!photo) {
      return NextResponse.json({ error: "Bildet finnes ikke." }, { status: 404 });
    }

    if (photo.pathname) {
      await deletePrivateBlobs([photo.pathname]);
    }

    const remaining = photos.filter((_, i) => i !== index);

    await ref.update({
      photos: remaining,
      updatedAt: new Date()
    });

    await ref.collection("events").add({
      type: "ADMIN_PHOTO_DELETED",
      description: `${user.displayName} slettet bildet ${
        photo.filename ?? `bilde ${index + 1}`
      }.`,
      actorType: "USER",
      actorName: user.displayName,
      createdAt: new Date()
    });

    return NextResponse.json({ ok: true, remaining: remaining.length });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Bildet kunne ikke slettes."
      },
      { status: 400 }
    );
  }
}
