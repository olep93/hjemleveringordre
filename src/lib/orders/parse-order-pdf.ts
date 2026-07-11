import pdf from "pdf-parse";

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

const PARSER_VERSION = "obsbygg-order-v3";

function clean(value?: string | null): string {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCustomerName(value?: string | null): string | null {
  const cleaned = clean(value).replace(/^\d+\s+/, "");
  if (!cleaned) return null;

  // Source format is normally "Etternavn, Fornavn/beskrivelse".
  if (cleaned.includes(",")) {
    const [lastName, firstName] = cleaned
      .split(",")
      .map((part) => clean(part));

    if (lastName && firstName) {
      return `${firstName} ${lastName}`.trim();
    }
  }

  return cleaned;
}

function parseDecimal(value?: string | null): number | null {
  const cleaned = clean(value);
  if (!cleaned) return null;

  const normalized = cleaned
    .replace(/\./g, "")
    .replace(",", ".");

  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function extractOrderNumber(text: string): string | null {
  return (
    text.match(/\bKundeordre\s*[:#-]?\s*(\d+)\b/i)?.[1] ??
    text.match(/\bOrdre(?:nummer|nr\.?)\s*[:#-]?\s*(\d+)\b/i)?.[1] ??
    null
  );
}

function extractCustomerName(text: string): string | null {
  const match =
    text.match(
      /\bKunde:\s*(\d+\s+[^\r\n]+?)(?=\s{2,}|\r?\n|Leveringsadr\.|Mobiltelefon:|Selger:)/i
    )?.[1] ??
    text.match(/\bKunde:\s*([^\r\n]+)/i)?.[1] ??
    null;

  return normalizeCustomerName(match);
}

function extractPhone(text: string): string | null {
  const raw =
    text.match(/\bMobiltelefon:\s*([^\r\n]+)/i)?.[1] ??
    text.match(/\b(?:Telefon|Tlf\.?):\s*([^\r\n]+)/i)?.[1] ??
    null;

  const cleaned = clean(raw);

  if (
    !cleaned ||
    /telefonnummer|ikke registrert|mangler/i.test(cleaned)
  ) {
    return null;
  }

  const digits = cleaned.replace(/[^\d+]/g, "");
  return digits.length >= 6 ? digits : null;
}

function extractOrderDate(text: string): string | null {
  return (
    text.match(
      /\bOrdredato:\s*([0-9]{1,2}[.\-/][0-9]{1,2}[.\-/][0-9]{2,4})/i
    )?.[1] ?? null
  );
}

function extractSeller(text: string): string | null {
  const seller = clean(text.match(/\bSelger:\s*([^\r\n]+)/i)?.[1]);
  return seller || null;
}

function normalizeLines(text: string): string[] {
  return text
    .replace(/\u00a0/g, " ")
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/\t+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    )
    .filter(Boolean);
}

function createItem(input: {
  articleNumber: string;
  description: string;
  bestNumber: string;
  quantity: string;
  unit: string;
  deliveredQuantity?: string | null;
  price?: string | null;
  lineTotal?: string | null;
  index: number;
}): ParsedOrderItem {
  const description = clean(input.description);
  const isFreight = /frakt/i.test(description);

  return {
    id: `${input.articleNumber}-${input.index + 1}`,
    articleNumber: input.articleNumber,
    description,
    bestNumber: input.bestNumber,
    quantity: parseDecimal(input.quantity) ?? 1,
    unit: clean(input.unit) || null,
    deliveredQuantity: parseDecimal(input.deliveredQuantity),
    price: parseDecimal(input.price),
    lineTotal: parseDecimal(input.lineTotal),
    checked: isFreight,
    checkedBy: isFreight ? "SYSTEM" : null,
    checkedAt: isFreight ? new Date().toISOString() : null,
    isFreight
  };
}

function parseExactObsRows(text: string): ParsedOrderItem[] {
  const lines = normalizeLines(text);
  const headerIndex = lines.findIndex(
    (line) =>
      /\bEAN\/PLU\b/i.test(line) &&
      /\bVaretekst\b/i.test(line) &&
      /\bBestnr\b/i.test(line)
  );

  if (headerIndex < 0) return [];

  const rowPattern =
    /^(\d{6,14})\s+(.+?)\s+(\d{5,10})\s+(\d+(?:[.,]\d+)?)\s+(Stk|M|LM|Pk|Pak|Sett|Eske|Par)\s+(\d+(?:[.,]\d+)?)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)$/i;

  const items: ParsedOrderItem[] = [];

  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i];

    if (/^(SUM|TOTALSUM|TOTAL SUM)\b/i.test(line)) break;

    const match = line.match(rowPattern);
    if (!match) continue;

    items.push(
      createItem({
        articleNumber: match[1],
        description: match[2],
        bestNumber: match[3],
        quantity: match[4],
        unit: match[5],
        deliveredQuantity: match[6],
        price: match[7],
        lineTotal: match[9],
        index: items.length
      })
    );
  }

  return items;
}

function parseCollapsedObsRows(text: string): ParsedOrderItem[] {
  const compact = text
    .replace(/\u00a0/g, " ")
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const start = compact.search(/\bEAN\/PLU\b/i);
  const endCandidates = [
    compact.search(/\bTOTALSUM\b/i),
    compact.search(/\bTOTAL SUM\b/i),
    compact.search(/\bSUM\b/i)
  ].filter((value) => value > start);

  if (start < 0 || endCandidates.length === 0) return [];

  const end = Math.min(...endCandidates);
  const body = compact.slice(start, end);

  const rowPattern =
    /(\d{6,14})\s+(.+?)\s+(\d{5,10})\s+(\d+(?:[.,]\d+)?)\s+(Stk|M|LM|Pk|Pak|Sett|Eske|Par)\s+(\d+(?:[.,]\d+)?)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)/gi;

  const items: ParsedOrderItem[] = [];
  let match: RegExpExecArray | null;

  while ((match = rowPattern.exec(body)) !== null) {
    items.push(
      createItem({
        articleNumber: match[1],
        description: match[2],
        bestNumber: match[3],
        quantity: match[4],
        unit: match[5],
        deliveredQuantity: match[6],
        price: match[7],
        lineTotal: match[9],
        index: items.length
      })
    );
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
  const result = await pdf(buffer);
  const rawText = result.text ?? "";

  const exactRows = parseExactObsRows(rawText);
  const fallbackRows =
    exactRows.length > 0 ? [] : parseCollapsedObsRows(rawText);

  return {
    orderNumber: extractOrderNumber(rawText),
    customerName: extractCustomerName(rawText),
    phone: extractPhone(rawText),
    orderDate: extractOrderDate(rawText),
    seller: extractSeller(rawText),
    items: deduplicate([...exactRows, ...fallbackRows]),
    rawText,
    parserVersion: PARSER_VERSION
  };
}
