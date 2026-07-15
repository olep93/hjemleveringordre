import { get } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireUser();

    const pathname = request.nextUrl.searchParams.get("pathname");
    const filename = request.nextUrl.searchParams.get("filename");

    if (!pathname) {
      return NextResponse.json({ error: "Mangler filsti." }, { status: 400 });
    }

    const result = await get(pathname, {
      access: "private",
      ifNoneMatch: request.headers.get("if-none-match") ?? undefined
    });

    if (!result) {
      return new NextResponse("Filen finnes ikke.", { status: 404 });
    }

    if (result.statusCode === 304) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          ETag: result.blob.etag,
          "Cache-Control": "private, no-cache"
        }
      });
    }

    if (result.statusCode !== 200 || !result.stream) {
      return new NextResponse("Filen finnes ikke.", { status: 404 });
    }

    const disposition = filename
      ? `inline; filename*=UTF-8''${encodeURIComponent(filename)}`
      : "inline";

    return new NextResponse(result.stream, {
      headers: {
        "Content-Type": result.blob.contentType,
        "Content-Disposition": disposition,
        "X-Content-Type-Options": "nosniff",
        ETag: result.blob.etag,
        "Cache-Control": "private, no-cache"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Kunne ikke åpne fil.";
    return NextResponse.json(
      { error: message },
      { status: message === "UNAUTHORIZED" ? 401 : 500 }
    );
  }
}
