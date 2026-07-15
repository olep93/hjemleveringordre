import { requireRole } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { uploadPrivateBlob } from "@/lib/blob-storage";

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
    const contentType = file.type || "image/jpeg";

    const stored = await uploadPrivateBlob({
      pathnamePrefix: `orders/${id}/photos`,
      filename: file.name || `photo-${Date.now()}.jpg`,
      body: new Blob([buffer], { type: contentType }),
      contentType
    });

    const photo = {
      ...stored,
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
      {
        error:
          error instanceof Error ? error.message : "Kunne ikke laste opp bilde."
      },
      { status: 400 }
    );
  }
}
