import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function allowedHost(hostname: string): boolean {
  return (
    hostname === "obsbygg.no" ||
    hostname.endsWith(".obsbygg.no") ||
    hostname === "coop.no" ||
    hostname.endsWith(".coop.no") ||
    hostname.endsWith(".ctfassets.net") ||
    hostname.endsWith(".cloudinary.com") ||
    hostname.endsWith(".azureedge.net")
  );
}

export async function GET(request: NextRequest) {
  try {
    await requireUser();

    const rawUrl = request.nextUrl.searchParams.get("url");
    if (!rawUrl) {
      return NextResponse.json({ error: "Mangler bilde-URL." }, { status: 400 });
    }

    const url = new URL(rawUrl);
    if (!allowedHost(url.hostname)) {
      return NextResponse.json({ error: "Bildekilden er ikke tillatt." }, { status: 403 });
    }

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Hjemleveringordre/1.4)",
        Accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8",
        Referer: "https://www.obsbygg.no/"
      },
      cache: "force-cache",
      next: { revalidate: 86400 }
    });

    if (!response.ok || !response.body) {
      return NextResponse.json({ error: "Bildet kunne ikke hentes." }, { status: 404 });
    }

    const contentType = response.headers.get("content-type") ?? "image/jpeg";
    if (!contentType.startsWith("image/")) {
      return NextResponse.json({ error: "Ugyldig bildefil." }, { status: 415 });
    }

    return new NextResponse(response.body, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=86400"
      }
    });
  } catch {
    return NextResponse.json({ error: "Kunne ikke hente bildet." }, { status: 500 });
  }
}
