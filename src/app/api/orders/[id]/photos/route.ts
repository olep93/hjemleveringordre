import { requireRole } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb, adminStorage } from "@/lib/firebase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(["EMPLOYEE", "MANAGER", "ADMIN"]);
    const { id } = await context.params;
    const form = await request.formData();
    const file = form.get("file");
    const uploadedBy = String(form.get("uploadedBy") ?? "").trim() || "Ukjent";

    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "Velg et bilde." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `orders/${id}/photos/${Date.now()}-${safeName}`;

    await adminStorage.bucket().file(path).save(buffer, {
      resumable: false,
      contentType: file.type || "image/jpeg"
    });

    const photo = {
      path,
      filename: file.name,
      uploadedBy,
      createdAt: new Date().toISOString()
    };

    const ref = adminDb.collection("orders").doc(id);
    await ref.update({
      photos: FieldValue.arrayUnion(photo),
      updatedAt: FieldValue.serverTimestamp()
    });

    await ref.collection("events").add({
      type: "PHOTO_UPLOADED",
      description: `Bilde lastet opp av ${uploadedBy}.`,
      actorType: "USER",
      actorName: uploadedBy,
      createdAt: FieldValue.serverTimestamp()
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kunne ikke laste opp bilde." },
      { status: 400 }
    );
  }
}
