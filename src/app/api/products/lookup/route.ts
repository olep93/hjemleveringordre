import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { lookupProduct } from "@/lib/orders/enrich-products";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    await requireRole(["EMPLOYEE", "MANAGER", "ADMIN"]);
    const ean = request.nextUrl.searchParams.get("ean")?.replace(/\D/g, "") ?? "";
    if (!/^\d{12,14}$/.test(ean)) {
      return NextResponse.json(
        { error: "Skriv inn et gyldig EAN med 12–14 sifre." },
        { status: 400 }
      );
    }

    const product = await lookupProduct(ean);
    return NextResponse.json({ ok: true, found: Boolean(product), product });
  } catch (error) {
    console.error("Product lookup failed:", error);
    return NextResponse.json(
      { error: "Vareoppslaget feilet. Prøv igjen." },
      { status: 500 }
    );
  }
}
