import * as mupdf from "mupdf";

export type ParsedOrderItem = {
  id: string;
  articleNumber: string | null;
  description: string;
  bestNumber: string | null;
  quantity: number;
  unit: string | null;
  deliveredQuantity: number | null;
  price: number | null;
  lineTotal: number | null;
  checked: boolean;
  checkedBy: string | null;
  checkedAt: string | null;
  isFreight: boolean;
};

export type ParsedOrder = {
  orderNumber: string | null;
  customerName: string | null;
  phone: string | null;
  orderDate: string | null;
  seller: string | null;
  items: ParsedOrderItem[];
  rawText: string;
  parserVersion: string;
};

type PositionedText = {
  text: string;
  x: number;
  y: number;
};

const PARSER_VERSION = "obsbygg-mupdf-coordinates-v6";

function clean(value?: string | null): string {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseDecimal(value?: string | null): number | null {
  const normalized = clean(value)
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");

  if (!normalized) return null;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeCustomerName(value?: string | null): string | null {
  const customer = clean(value).replace(/^\d+\s+/, "");
  if (!customer) return null;

  if (customer.includes(",")) {
    const [lastName, firstName] = customer.split(",", 2).map(clean);
    if (lastName && firstName) return `${firstName} ${lastName}`;
  }

  return customer;
}

function collectSpans(node: unknown, result: PositionedText[]): void {
  if (!node || typeof node !== "object") return;

  const value = node as Record<string, unknown>;

  if (typeof value.text === "string" && Array.isArray(value.bbox)) {
    const bbox = value.bbox.map(Number);
    if (bbox.length >= 4) {
      result.push({
        text: clean(value.text),
        x: bbox[0],
        y: (bbox[1] + bbox[3]) / 2
      });
    }
  }

  for (const child of Object.values(value)) {
    if (Array.isArray(child)) {
      for (const item of child) collectSpans(item, result);
    } else if (child && typeof child === "object") {
      collectSpans(child, result);
    }
  }
}

function groupSpansIntoRows(spans: PositionedText[]): string[] {
  const sorted = spans
    .filter((span) => span.text)
    .sort((a, b) => {
      const yDiff = a.y - b.y;
      if (Math.abs(yDiff) > 2.5) return yDiff;
      return a.x - b.x;
    });

  const rows: Array<{ y: number; spans: PositionedText[] }> = [];

  for (const span of sorted) {
    let row = rows.find((candidate) => Math.abs(candidate.y - span.y) <= 2.5);

    if (!row) {
      row = { y: span.y, spans: [] };
      rows.push(row);
    }

    row.spans.push(span);
    row.y =
      row.spans.reduce((sum, current) => sum + current.y, 0) /
      row.spans.length;
  }

  return rows
    .sort((a, b) => a.y - b.y)
    .map((row) =>
      clean(
        row.spans
          .sort((a, b) => a.x - b.x)
          .map((span) => span.text)
          .join(" ")
      )
    )
    .filter(Boolean);
}

function extractRows(buffer: Buffer): string[] {
  const document = mupdf.PDFDocument.openDocument(
    new Uint8Array(buffer),
    "application/pdf"
  );

  try {
    const rows: string[] = [];

    for (let pageIndex = 0; pageIndex < document.countPages(); pageIndex++) {
      const page = document.loadPage(pageIndex);

      try {
        const structuredText = page.toStructuredText("preserve-whitespace");

        try {
          const spans: PositionedText[] = [];

          try {
            const json = JSON.parse(structuredText.asJSON()) as unknown;
            collectSpans(json, spans);
          } catch {
            // Some PDFs do not expose structured JSON correctly.
          }

          if (spans.length > 0) {
            rows.push(...groupSpansIntoRows(spans));
          } else {
            rows.push(
              ...structuredText
                .asText()
                .split(/\r?\n/)
                .map(clean)
                .filter(Boolean)
            );
          }
        } finally {
          structuredText.destroy();
        }
      } finally {
        page.destroy();
      }
    }

    return rows;
  } finally {
    document.destroy();
  }
}

function extractOrderNumber(text: string): string | null {
  return (
    text.match(/\bKundeordre\s*[:#-]?\s*(\d+)\b/i)?.[1] ??
    text.match(/\bOrdre(?:nummer|nr\.?)\s*[:#-]?\s*(\d+)\b/i)?.[1] ??
    null
  );
}

function extractCustomerName(rows: string[], text: string): string | null {
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];

    const inline = row.match(/\bKunde:\s*(\d+\s+.+)$/i);
    if (inline?.[1]) return normalizeCustomerName(inline[1]);

    if (/^Kunde:\s*$/i.test(row) && rows[index + 1]) {
      return normalizeCustomerName(rows[index + 1]);
    }
  }

  return normalizeCustomerName(
    text.match(/\bKunde:\s*(\d+\s+[^\r\n]+)/i)?.[1] ?? null
  );
}

function extractPhone(rows: string[], text: string): string | null {
  const source =
    rows.find((row) => /\bMobiltelefon:/i.test(row)) ??
    text.match(/\bMobiltelefon:\s*([^\r\n]+)/i)?.[0] ??
    "";

  const raw = clean(source.replace(/^.*?Mobiltelefon:\s*/i, ""));

  if (!raw || /telefonnummer|mangler|ikke registrert/i.test(raw)) {
    return null;
  }

  const phone = raw.replace(/[^\d+]/g, "");
  return phone.length >= 6 ? phone : null;
}

function extractOrderDate(text: string): string | null {
  return (
    text.match(
      /\bOrdredato:\s*([0-9]{1,2}[.\-/][0-9]{1,2}[.\-/][0-9]{2,4})/i
    )?.[1] ?? null
  );
}

function extractSeller(rows: string[], text: string): string | null {
  const row = rows.find((value) => /^Selger:/i.test(value));

  if (row) return clean(row.replace(/^Selger:\s*/i, "")) || null;

  return clean(text.match(/\bSelger:\s*([^\r\n]+)/i)?.[1]) || null;
}

function isUnit(value: string): boolean {
  return /^(stk|m|lm|pk|pak|sett|eske|par)$/i.test(value);
}

function isQuantity(value: string): boolean {
  return /^\d+(?:[.,]\d+)?$/.test(value);
}

function isDate(value: string): boolean {
  return /^\d{1,2}[.\-/]\d{1,2}[.\-/]\d{2,4}$/.test(value);
}

function parseItemRow(row: string, index: number): ParsedOrderItem | null {
  const eanMatch = clean(row).match(/^(\d{6,14})\s+(.+)$/);
  if (!eanMatch) return null;

  const articleNumber = eanMatch[1];
  const tokens = clean(eanMatch[2]).split(" ").filter(Boolean);

  const unitIndex = tokens.findIndex(
    (token, tokenIndex) =>
      isUnit(token) &&
      tokenIndex > 0 &&
      isQuantity(tokens[tokenIndex - 1])
  );

  if (unitIndex < 2) return null;

  const quantity = tokens[unitIndex - 1];
  const unit = tokens[unitIndex];

  let bestNumberIndex = unitIndex - 2;

  while (
    bestNumberIndex >= 0 &&
    (isDate(tokens[bestNumberIndex]) ||
      !/^\d{5,10}$/.test(tokens[bestNumberIndex]))
  ) {
    bestNumberIndex--;
  }

  if (bestNumberIndex < 1) return null;

  const bestNumber = tokens[bestNumberIndex];
  const description = clean(tokens.slice(0, bestNumberIndex).join(" "));
  if (!description) return null;

  const numericAfterUnit = tokens
    .slice(unitIndex + 1)
    .filter((token) => /^[\d.,]+$/.test(token));

  const deliveredQuantity = numericAfterUnit[0] ?? quantity;
  const price = numericAfterUnit[1] ?? null;
  const lineTotal =
    numericAfterUnit.length >= 4
      ? numericAfterUnit[3]
      : numericAfterUnit.at(-1) ?? null;

  const isFreight = /frakt/i.test(description);

  return {
    id: `${articleNumber}-${index + 1}`,
    articleNumber,
    description,
    bestNumber,
    quantity: parseDecimal(quantity) ?? 1,
    unit,
    deliveredQuantity: parseDecimal(deliveredQuantity),
    price: parseDecimal(price),
    lineTotal: parseDecimal(lineTotal),
    checked: isFreight,
    checkedBy: isFreight ? "SYSTEM" : null,
    checkedAt: isFreight ? new Date().toISOString() : null,
    isFreight
  };
}

function parseRows(rows: string[]): ParsedOrderItem[] {
  const tableStart = rows.findIndex(
    (row) => /EAN\/PLU/i.test(row) && /Varetekst/i.test(row)
  );

  const candidates = tableStart >= 0 ? rows.slice(tableStart + 1) : rows;
  const items: ParsedOrderItem[] = [];

  for (const row of candidates) {
    if (/^(SUM|TOTALSUM|TOTAL SUM)\b/i.test(row)) break;

    const item = parseItemRow(row, items.length);
    if (item) items.push(item);
  }

  return items;
}

function parseFlattenedFallback(rows: string[]): ParsedOrderItem[] {
  const text = clean(rows.join(" "));
  const tableStart = text.search(/\bEAN\/PLU\b/i);
  if (tableStart < 0) return [];

  const tableText = text.slice(tableStart);
  const eanMatches = [...tableText.matchAll(/\b\d{12,14}\b/g)];

  const items: ParsedOrderItem[] = [];

  for (let index = 0; index < eanMatches.length; index++) {
    const current = eanMatches[index];
    const next = eanMatches[index + 1];

    const start = current.index ?? 0;
    const end = next?.index ?? tableText.search(/\b(?:SUM|TOTALSUM|TOTAL SUM)\b/i);

    const chunk = clean(
      tableText.slice(start, end > start ? end : tableText.length)
    );

    const item = parseItemRow(chunk, items.length);
    if (item) items.push(item);
  }

  return items;
}

function deduplicate(items: ParsedOrderItem[]): ParsedOrderItem[] {
  const seen = new Set<string>();

  return items.filter((item) => {
    const key = [
      item.articleNumber,
      item.bestNumber,
      item.description,
      item.quantity,
      item.unit
    ].join("|");

    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function parseOrderPdf(buffer: Buffer): Promise<ParsedOrder> {
  const rows = extractRows(buffer);
  const rawText = rows.join("\n");

  const rowItems = parseRows(rows);
  const fallbackItems =
    rowItems.length > 0 ? [] : parseFlattenedFallback(rows);

  return {
    orderNumber: extractOrderNumber(rawText),
    customerName: extractCustomerName(rows, rawText),
    phone: extractPhone(rows, rawText),
    orderDate: extractOrderDate(rawText),
    seller: extractSeller(rows, rawText),
    items: deduplicate([...rowItems, ...fallbackItems]),
    rawText,
    parserVersion: PARSER_VERSION
  };
}
