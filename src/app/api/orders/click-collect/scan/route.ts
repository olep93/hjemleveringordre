import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { parseClickCollectText } from "@/lib/orders/parse-click-collect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    await requireRole(["EMPLOYEE", "MANAGER", "ADMIN"]);

    const form = await request.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Velg et bilde av Klikk & Hent-ordren." },
        { status: 400 }
      );
    }

    if (!file.type.startsWith("image/")) {
      return NextResponse.json(
        { error: "Skanneren støtter bildefiler." },
        { status: 415 }
      );
    }

    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("eng");

    try {
      const imageBuffer = Buffer.from(await file.arrayBuffer());
      const result = await worker.recognize(imageBuffer);

      return NextResponse.json({
        ok: true,
        scan: parseClickCollectText(result.data.text),
        confidence: result.data.confidence
      });
    } finally {
      await worker.terminate();
    }
  } catch (error) {
    console.error("Click & Collect OCR failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Bildet kunne ikke skannes."
      },
      { status: 500 }
    );
  }
}
