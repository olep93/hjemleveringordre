import { del, get, put } from "@vercel/blob";

export type StoredBlob = {
  url: string;
  pathname: string;
  filename: string;
  contentType: string;
};

function safeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function uploadPrivateBlob(input: {
  pathnamePrefix: string;
  filename: string;
  body: Blob | ArrayBuffer | ReadableStream | string;
  contentType: string;
}): Promise<StoredBlob> {
  const filename = safeFilename(input.filename);
  const blob = await put(`${input.pathnamePrefix}/${filename}`, input.body, {
    access: "private",
    addRandomSuffix: true,
    contentType: input.contentType
  });

  return {
    url: blob.url,
    pathname: blob.pathname,
    filename,
    contentType: input.contentType
  };
}

export async function readPrivateBlobBuffer(
  pathnameOrUrl: string
): Promise<Buffer> {
  const result = await get(pathnameOrUrl, {
    access: "private",
    useCache: false
  });

  if (!result || result.statusCode !== 200 || !result.stream) {
    throw new Error("Filen finnes ikke i Vercel Blob.");
  }

  const arrayBuffer = await new Response(result.stream).arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function deletePrivateBlobs(
  urlsOrPathnames: Array<string | null | undefined>
): Promise<void> {
  const values = [...new Set(urlsOrPathnames.filter(Boolean) as string[])];
  if (values.length === 0) return;
  await del(values);
}

export function privateFileRouteUrl(
  pathname: string,
  filename?: string | null
): string {
  const params = new URLSearchParams({ pathname });
  if (filename) params.set("filename", filename);
  return `/api/files?${params.toString()}`;
}
