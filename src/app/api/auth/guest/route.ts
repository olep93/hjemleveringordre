import { NextResponse } from "next/server";
import { createGuestSession } from "@/lib/auth";

export async function POST() {
  await createGuestSession();
  return NextResponse.json({ ok: true });
}
