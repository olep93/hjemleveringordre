import { uploadPrivateBlob, type StoredBlob } from "@/lib/blob-storage";
import type { ParsedOrderItem } from "@/lib/orders/parse-order-pdf";

type ExistingItem = ParsedOrderItem & {
  productName?: string | null;
  productUrl?: string | null;
  productImageBlob?: StoredBlob | null;
  productImageSourceUrl?: string | null;
  productLookupStatus?: string | null;
  productLookupAt?: string | null;
};

export type EnrichedOrderItem = ParsedOrderItem & {
  productName: string | null;
  productUrl: string | null;
  productImageBlob: StoredBlob | null;
  productImageSourceUrl: string | null;
  productLookupStatus: "FOUND" | "NOT_FOUND" | "ERROR" | "SKIPPED";
  productLookupAt: string;
};

type ProductInfo = {
  name: string;
  productUrl: string;
  imageUrl: string | null;
};

const REQUEST_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (compatible; Hjemleveringordre/1.4; +https://jobbverktoy.no)",
  Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
  "Accept-Language": "nb-NO,nb;q=0.9,no;q=0.8,en;q=0.6"
};

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x2F;/gi, "/")
    .replace(/\\u002F/g, "/")
    .replace(/\\u0026/g, "&")
    .replace(/\\u003A/g, ":")
    .trim();
}

function stripTags(value: string): string {
  return decodeHtml(value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
}

function absoluteUrl(value: string, base: string): string | null {
  try {
    const url = new URL(decodeHtml(value), base);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function isObsProductUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const hostOk =
      url.hostname === "obsbygg.no" || url.hostname === "www.obsbygg.no";
    const searchPage = /^\/(?:sok|search)(?:\/|$)/i.test(url.pathname);
    return hostOk && !searchPage && /\/\d{6,10}\/?$/.test(url.pathname);
  } catch {
    return false;
  }
}

function imageFromJson(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const child of value) {
      const result = imageFromJson(child);
      if (result) return result;
    }
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return (
      imageFromJson(record.url) ??
      imageFromJson(record.contentUrl) ??
      imageFromJson(record.image)
    );
  }
  return null;
}

function findProductJson(value: unknown, ean: string): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;

  if (Array.isArray(value)) {
    for (const child of value) {
      const match = findProductJson(child, ean);
      if (match) return match;
    }
    return null;
  }

  const record = value as Record<string, unknown>;
  const type = record["@type"];
  const types = Array.isArray(type) ? type.map(String) : [String(type ?? "")];

  if (
    types.some((entry) => entry.toLowerCase() === "product") &&
    JSON.stringify(record).includes(ean)
  ) {
    return record;
  }

  for (const child of Object.values(record)) {
    const match = findProductJson(child, ean);
    if (match) return match;
  }

  return null;
}

function metaContent(html: string, property: string): string | null {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const expressions = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`,
      "i"
    )
  ];

  for (const expression of expressions) {
    const value = html.match(expression)?.[1];
    if (value) return decodeHtml(value);
  }

  return null;
}

function parseProductPage(html: string, pageUrl: string, ean: string): ProductInfo | null {
  const textIncludesEan =
    html.includes(ean) ||
    new RegExp(`Art(?:ikkel)?\\s*nr\\.?[^0-9]{0,30}${ean}`, "i").test(html);

  if (!textIncludesEan) return null;

  const scripts = [...html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  )];

  for (const script of scripts) {
    try {
      const json = JSON.parse(script[1].trim()) as unknown;
      const product = findProductJson(json, ean);
      if (!product) continue;

      const name = String(product.name ?? "").trim();
      const image = imageFromJson(product.image);
      const productUrl =
        absoluteUrl(String(product.url ?? pageUrl), pageUrl) ?? pageUrl;

      if (name) {
        return {
          name,
          productUrl,
          imageUrl: image ? absoluteUrl(image, pageUrl) : null
        };
      }
    } catch {
      // Continue to OpenGraph and HTML fallbacks.
    }
  }

  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  const title =
    metaContent(html, "og:title") ??
    (h1 ? stripTags(h1) : null) ??
    html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ??
    null;

  if (!title) return null;

  const canonical =
    html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1] ??
    html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i)?.[1] ??
    pageUrl;

  const image =
    metaContent(html, "og:image") ??
    metaContent(html, "twitter:image") ??
    html.match(/<img[^>]+(?:src|data-src)=["']([^"']+)["'][^>]+alt=["'][^"']*["']/i)?.[1] ??
    null;

  return {
    name: stripTags(title).replace(/\s*\|\s*Obsbygg\.no.*$/i, "").trim(),
    productUrl: absoluteUrl(canonical, pageUrl) ?? pageUrl,
    imageUrl: image ? absoluteUrl(image, pageUrl) : null
  };
}

async function fetchText(url: string, timeoutMs = 10000): Promise<{
  html: string;
  finalUrl: string;
}> {
  const response = await fetch(url, {
    headers: REQUEST_HEADERS,
    redirect: "follow",
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs)
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return { html: await response.text(), finalUrl: response.url || url };
}

function linksFromObsSearch(html: string, baseUrl: string, ean: string): string[] {
  const normalized = html
    .replace(/\\u002F/g, "/")
    .replace(/\\u003A/g, ":")
    .replace(/\\u0026/g, "&");

  const scored: Array<{ url: string; score: number }> = [];

  for (const match of normalized.matchAll(
    /(?:href=|["'](?:url|href)["']\s*:\s*)["']([^"'#]+)["']/gi
  )) {
    const url = absoluteUrl(match[1], baseUrl);
    if (!url || !isObsProductUrl(url)) continue;

    const index = match.index ?? 0;
    const context = normalized.slice(Math.max(0, index - 1500), index + 1500);
    scored.push({
      url,
      score: context.includes(ean) ? 100 : 10
    });
  }

  return [...new Map(
    scored
      .sort((a, b) => b.score - a.score)
      .map((item) => [item.url, item])
  ).values()].map((item) => item.url);
}

function linksFromBingRss(xml: string): string[] {
  const links = [...xml.matchAll(/<link>(https?:\/\/[^<]+)<\/link>/gi)]
    .map((match) => decodeHtml(match[1]))
    .filter(isObsProductUrl);
  return [...new Set(links)];
}

function linksFromDuckDuckGo(html: string): string[] {
  const links: string[] = [];

  for (const match of html.matchAll(/href=["']([^"']+)["']/gi)) {
    let value = decodeHtml(match[1]);

    try {
      const url = new URL(value, "https://html.duckduckgo.com");
      const redirectTarget = url.searchParams.get("uddg");
      if (redirectTarget) value = decodeURIComponent(redirectTarget);
    } catch {
      // Ignore malformed result links.
    }

    if (isObsProductUrl(value)) links.push(value);
  }

  return [...new Set(links)];
}

async function validateCandidates(
  links: string[],
  ean: string
): Promise<ProductInfo | null> {
  for (const link of links.slice(0, 12)) {
    try {
      const page = await fetchText(link);
      const product = parseProductPage(page.html, page.finalUrl, ean);
      if (product) return product;
    } catch {
      // One failed candidate must not stop the lookup.
    }
  }

  return null;
}

async function lookupProduct(ean: string): Promise<ProductInfo | null> {
  // 1. Obs BYGG's own search. It can be client-rendered, so several parameter
  // variants are tried and embedded links are extracted.
  const obsSearchUrls = [
    `https://www.obsbygg.no/sok?q=${encodeURIComponent(ean)}`,
    `https://www.obsbygg.no/sok?query=${encodeURIComponent(ean)}`,
    `https://www.obsbygg.no/search?q=${encodeURIComponent(ean)}`
  ];

  for (const searchUrl of obsSearchUrls) {
    try {
      const result = await fetchText(searchUrl);
      const direct = parseProductPage(result.html, result.finalUrl, ean);
      if (direct && isObsProductUrl(direct.productUrl)) return direct;

      const found = await validateCandidates(
        linksFromObsSearch(result.html, result.finalUrl, ean),
        ean
      );
      if (found) return found;
    } catch {
      // Continue with next search strategy.
    }
  }

  // 2. Bing RSS provides a simple server-readable fallback without JavaScript.
  try {
    const query = encodeURIComponent(`site:obsbygg.no "${ean}"`);
    const result = await fetchText(
      `https://www.bing.com/search?format=rss&q=${query}`
    );
    const found = await validateCandidates(linksFromBingRss(result.html), ean);
    if (found) return found;
  } catch {
    // Continue with DuckDuckGo.
  }

  // 3. DuckDuckGo HTML is a second no-JavaScript search fallback.
  try {
    const query = encodeURIComponent(`site:obsbygg.no "${ean}"`);
    const result = await fetchText(
      `https://html.duckduckgo.com/html/?q=${query}`
    );
    const found = await validateCandidates(
      linksFromDuckDuckGo(result.html),
      ean
    );
    if (found) return found;
  } catch {
    // No product found.
  }

  return null;
}

function extensionFromContentType(contentType: string): string {
  if (contentType.includes("png")) return "png";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("gif")) return "gif";
  if (contentType.includes("avif")) return "avif";
  return "jpg";
}

async function copyProductImage(input: {
  imageUrl: string;
  productUrl: string;
  orderId: string;
  ean: string;
}): Promise<StoredBlob | null> {
  const response = await fetch(input.imageUrl, {
    headers: {
      ...REQUEST_HEADERS,
      Accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8",
      Referer: input.productUrl
    },
    redirect: "follow",
    cache: "no-store",
    signal: AbortSignal.timeout(12000)
  });

  if (!response.ok) return null;

  const contentType = response.headers.get("content-type") ?? "image/jpeg";
  if (!contentType.startsWith("image/")) return null;

  const bytes = await response.arrayBuffer();
  if (bytes.byteLength === 0 || bytes.byteLength > 10 * 1024 * 1024) {
    return null;
  }

  return uploadPrivateBlob({
    pathnamePrefix: `orders/${input.orderId}/products/${input.ean}`,
    filename: `product.${extensionFromContentType(contentType)}`,
    body: bytes,
    contentType
  });
}

async function enrichOne(
  item: ParsedOrderItem,
  orderId: string,
  existing?: ExistingItem
): Promise<EnrichedOrderItem> {
  const productLookupAt = new Date().toISOString();
  const ean = item.articleNumber?.trim();

  if (
    !ean ||
    item.identifierType === "PLU" ||
    !/^\d{12,14}$/.test(ean) ||
    item.isFreight
  ) {
    return {
      ...item,
      productName: existing?.productName ?? null,
      productUrl: existing?.productUrl ?? null,
      productImageBlob: existing?.productImageBlob ?? null,
      productImageSourceUrl: existing?.productImageSourceUrl ?? null,
      productLookupStatus: "SKIPPED",
      productLookupAt
    };
  }

  try {
    const product = await lookupProduct(ean);

    if (!product) {
      return {
        ...item,
        productName: existing?.productName ?? null,
        productUrl: existing?.productUrl ?? null,
        productImageBlob: existing?.productImageBlob ?? null,
        productImageSourceUrl: existing?.productImageSourceUrl ?? null,
        productLookupStatus: "NOT_FOUND",
        productLookupAt
      };
    }

    let productImageBlob: StoredBlob | null = null;

    if (product.imageUrl) {
      try {
        productImageBlob = await copyProductImage({
          imageUrl: product.imageUrl,
          productUrl: product.productUrl,
          orderId,
          ean
        });
      } catch {
        productImageBlob = null;
      }
    }

    return {
      ...item,
      productName: product.name,
      productUrl: product.productUrl,
      productImageBlob: productImageBlob ?? existing?.productImageBlob ?? null,
      productImageSourceUrl:
        product.imageUrl ?? existing?.productImageSourceUrl ?? null,
      productLookupStatus: "FOUND",
      productLookupAt
    };
  } catch {
    return {
      ...item,
      productName: existing?.productName ?? null,
      productUrl: existing?.productUrl ?? null,
      productImageBlob: existing?.productImageBlob ?? null,
      productImageSourceUrl: existing?.productImageSourceUrl ?? null,
      productLookupStatus: "ERROR",
      productLookupAt
    };
  }
}

export async function enrichOrderItems(
  items: ParsedOrderItem[],
  orderId: string,
  existingItems: ExistingItem[] = []
): Promise<EnrichedOrderItem[]> {
  const existingByEan = new Map(
    existingItems
      .filter((item) => item.articleNumber)
      .map((item) => [String(item.articleNumber), item])
  );

  const result: EnrichedOrderItem[] = [];

  for (let index = 0; index < items.length; index += 3) {
    const enriched = await Promise.all(
      items.slice(index, index + 3).map((item) =>
        enrichOne(
          item,
          orderId,
          item.articleNumber
            ? existingByEan.get(String(item.articleNumber))
            : undefined
        )
      )
    );
    result.push(...enriched);
  }

  return result;
}
