import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

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

const PARSER_VERSION = "obsbygg-pdfjs-v4";

type PositionedText = {
  text: string;
  x: number;
  y: number;
};

function clean(value?: string | null): string {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseDecimal(value?: string | null): number | null {
  const normalized = clean(value)
    .replace(/\./g, "")
    .replace(",", ".");

  if (!normalized) return null;

  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
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

async function extractPdfLines(buffer: Buffer): Promise<string[]> {
  const loadingTask = getDocument({
    data: new Uint8Array(buffer),
    disableFontFace: true,
    useSystemFonts: true,
    isEvalSupported: false
  });

  const document = await loadingTask.promise;
  const allLines: string[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      const page = await document.getPage(pageNumber);
      const textContent = await page.getTextContent();

      const positioned: PositionedText[] = textContent.items
        .filter(
          (
            item
          ): item is {
            str: string;
            transform: number[];
          } =>
            typeof item === "object" &&
            item !== null &&
            "str" in item &&
            "transform" in item
        )
        .map((item) => ({
          text: clean(item.str),
          x: Number(item.transform[4] ?? 0),
          y: Number(item.transform[5] ?? 0)
        }))
        .filter((item) => item.text.length > 0);

      positioned.sort((a, b) => {
        const yDifference = b.y - a.y;
        if (Math.abs(yDifference) > 2) return yDifference;
        return a.x - b.x;
      });

      const rows: PositionedText[][] = [];

      for (const item of positioned) {
        const existing = rows.find(
          (row) => Math.abs((row[0]?.y ?? item.y) - item.y) <= 2
        );

        if (existing) {
          existing.push(item);
        } else {
          rows.push([item]);
        }
      }

      rows
        .sort((a, b) => (b[0]?.y ?? 0) - (a[0]?.y ?? 0))
        .forEach((row) => {
          const line = clean(
            row
              .sort((a, b) => a.x - b.x)
              .map((item) => item.text)
              .join(" ")
          );

          if (line) allLines.push(line);
        });
    }
  } finally {
    await document.destroy();
  }

  return allLines;
}

function findOrderNumber(text: string): string | null {
  return (
    text.match(/\bKundeordre\s*[:#-]?\s*(\d+)\b/i)?.[1] ??
    text.match(/\bOrdre(?:nummer|nr\.?)\s*[:#-]?\s*(\d+)\b/i)?.[1] ??
    null
  );
}

function findCustomerName(lines: string[], text: string): string | null {
  for (const line of lines) {
    const match = line.match(/\bKunde:\s*(\d+\s+.+)$/i);
    if (match?.[1]) return normalizeCustomerName(match[1]);
  }

  return normalizeCustomerName(
    text.match(/\bKunde:\s*(\d+\s+[^\r\n]+)/i)?.[1] ?? null
  );
}

function findPhone(lines: string[], text: string): string | null {
  const line =
    lines.find((value) => /\bMobiltelefon:/i.test(value)) ??
    text.match(/\bMobiltelefon:\s*([^\r\n]+)/i)?.[0] ??
    "";

  const raw = clean(line.replace(/^.*?Mobiltelefon:\s*/i, ""));

  if (!raw || /telefonnummer|mangler|ikke registrert/i.test(raw)) return null;

  const phone = raw.replace(/[^\d+]/g, "");
  return phone.length >= 6 ? phone : null;
}

function findOrderDate(text: string): string | null {
  return (
    text.match(
      /\bOrdredato:\s*([0-9]{1,2}[.\-/][0-9]{1,2}[.\-/][0-9]{2,4})/i
    )?.[1] ?? null
  );
}

function findSeller(lines: string[], text: string): string | null {
  const line = lines.find((value) => /^Selger:/i.test(value));
  if (line) return clean(line.replace(/^Selger:\s*/i, "")) || null;

  return clean(text.match(/\bSelger:\s*([^\r\n]+)/i)?.[1]) || null;
}

function buildItem(
  match: RegExpMatchArray,
  index: number
): ParsedOrderItem {
  const description = clean(match[2]);
  const isFreight = /frakt/i.test(description);

  return {
    id: `${match[1]}-${index + 1}`,
    articleNumber: match[1],
    description,
    bestNumber: match[3],
    quantity: parseDecimal(match[4]) ?? 1,
    unit: clean(match[5]) || null,
    deliveredQuantity: parseDecimal(match[6]),
    price: parseDecimal(match[7]),
    lineTotal: parseDecimal(match[9]),
    checked: isFreight,
    checkedBy: isFreight ? "SYSTEM" : null,
    checkedAt: isFreight ? new Date().toISOString() : null,
    isFreight
  };
}

function parseOrderRows(lines: string[]): ParsedOrderItem[] {
  const headerIndex = lines.findIndex(
    (line) =>
      /EAN\/PLU/i.test(line) &&
      /Varetekst/i.test(line) &&
      /Bestnr/i.test(line)
  );

  const candidates =
    headerIndex >= 0 ? lines.slice(headerIndex + 1) : lines;

  const rowPattern =
    /^(\d{6,14})\s+(.+?)\s+(\d{5,10})\s+(?:(?:\d{1,2}[.\-/]\d{1,2}[.\-/]\d{2,4})\s+)?(\d+(?:[.,]\d+)?)\s+(Stk|M|LM|Pk|Pak|Sett|Eske|Par)\s+(\d+(?:[.,]\d+)?)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)$/i;

  const items: ParsedOrderItem[] = [];

  for (const line of candidates) {
    if (/^(SUM|TOTALSUM|TOTAL SUM)\b/i.test(line)) break;

    const match = line.match(rowPattern);
    if (match) items.push(buildItem(match, items.length));
  }

  return items;
}

function parseCollapsedRows(lines: string[]): ParsedOrderItem[] {
  const compact = clean(lines.join(" "));
  const start = compact.search(/\bEAN\/PLU\b/i);

  if (start < 0) return [];

  const endCandidates = [
    compact.search(/\bTOTALSUM\b/i),
    compact.search(/\bTOTAL SUM\b/i),
    compact.search(/\bSUM\b/i)
  ].filter((value) => value > start);

  if (endCandidates.length === 0) return [];

  const body = compact.slice(start, Math.min(...endCandidates));

  const rowPattern =
    /(\d{6,14})\s+(.+?)\s+(\d{5,10})\s+(?:(?:\d{1,2}[.\-/]\d{1,2}[.\-/]\d{2,4})\s+)?(\d+(?:[.,]\d+)?)\s+(Stk|M|LM|Pk|Pak|Sett|Eske|Par)\s+(\d+(?:[.,]\d+)?)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)/gi;

  const items: ParsedOrderItem[] = [];
  let match: RegExpExecArray | null;

  while ((match = rowPattern.exec(body)) !== null) {
    items.push(buildItem(match, items.length));
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
  const lines = await extractPdfLines(buffer);
  const rawText = lines.join("\n");

  const lineItems = parseOrderRows(lines);
  const fallbackItems =
    lineItems.length > 0 ? [] : parseCollapsedRows(lines);

  return {
    orderNumber: findOrderNumber(rawText),
    customerName: findCustomerName(lines, rawText),
    phone: findPhone(lines, rawText),
    orderDate: findOrderDate(rawText),
    seller: findSeller(lines, rawText),
    items: deduplicate([...lineItems, ...fallbackItems]),
    rawText,
    parserVersion: PARSER_VERSION
  };
}
