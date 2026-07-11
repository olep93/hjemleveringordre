import { NextRequest, NextResponse } from "next/server";
import { createGuestSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  await createGuestSession();

  const nextPath = request.nextUrl.searchParams.get("next") || "/";
  const safeNextPath = nextPath.startsWith("/") ? nextPath : "/";

  return NextResponse.redirect(new URL(safeNextPath, request.url));
}

export async function POST() {
  await createGuestSession();
  return NextResponse.json({ ok: true });
}
