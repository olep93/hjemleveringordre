export type ClickCollectScannedItem = {
  articleNumber: string;
  description: string;
  model: string | null;
  quantity: number;
  unit: string;
};

export type ClickCollectScanResult = {
  orderNumber: string | null;
  customerName: string | null;
  phone: string | null;
  email: string | null;
  deliveryAddress: string | null;
  deliveryMethod: string | null;
  items: ClickCollectScannedItem[];
  rawText: string;
};

function clean(value?: string | null): string {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/[|]/g, "I")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map(clean)
    .filter(Boolean);
}

function findValue(lines: string[], expression: RegExp): string | null {
  for (const line of lines) {
    const match = line.match(expression);
    if (match?.[1]) return clean(match[1]);
  }
  return null;
}

function normalizeOrderNumber(value?: string | null): string | null {
  const match = clean(value).match(/\d{5,10}(?:-\d+)?/);
  return match?.[0] ?? null;
}

function normalizePhone(value?: string | null): string | null {
  const digits = clean(value).replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

function looksLikeCategory(line: string): boolean {
  const normalized = line.toLowerCase();
  return (
    /^(konstruksjonsvirke|terrasse|maling|verktøy|byggevarer|trelast|isolasjon|festemidler)$/.test(
      normalized
    ) ||
    /^(gtin|varemerke|modell|farge|størrelse|enhet|antall)$/.test(normalized)
  );
}

function looksLikeProductHeader(line: string): boolean {
  if (looksLikeCategory(line)) return false;
  if (/^(butikk|ordredato|ordreliste|ordrenr|kunde|adresse|postnr|telefon|e-post|leveransemetode)/i.test(line)) {
    return false;
  }
  if (/^\d{8,14}\b/.test(line)) return false;
  if (/^\d{1,4}-\d+$/.test(line)) return false;
  return /[A-Za-zÆØÅæøå]/.test(line) && /\d/.test(line);
}

function parseItemDataLine(
  line: string
): {
  articleNumber: string;
  model: string | null;
  quantity: number;
  unit: string;
} | null {
  const gtin = line.match(/\b(\d{12,14})\b/);
  if (!gtin) return null;

  const tokens = clean(line).split(" ");
  const articleIndex = tokens.findIndex((token) => token === gtin[1]);
  const after = tokens.slice(articleIndex + 1);

  let quantity = 1;
  let unit = "Stk";
  let quantityIndex = -1;

  for (let index = after.length - 1; index >= 0; index--) {
    const numeric = after[index].replace(",", ".");
    if (/^\d+(?:\.\d+)?$/.test(numeric)) {
      quantity = Number(numeric);
      quantityIndex = index;

      const previous = clean(after[index - 1] ?? "");
      if (/^(meter|m|stk|pk|pakke|sett)$/i.test(previous)) {
        unit =
          previous.toLowerCase() === "meter"
            ? "Meter"
            : previous.toLowerCase() === "m"
              ? "M"
              : previous.toLowerCase() === "pk" ||
                  previous.toLowerCase() === "pakke"
                ? "Pk"
                : previous.toLowerCase() === "sett"
                  ? "Sett"
                  : "Stk";
      }
      break;
    }
  }

  const modelTokens =
    quantityIndex > 0
      ? after.slice(0, quantityIndex).filter((token) => !/^(meter|m|stk|pk|pakke|sett)$/i.test(token))
      : after;

  const model = clean(modelTokens.join(" ")) || null;

  return {
    articleNumber: gtin[1],
    model,
    quantity: Number.isFinite(quantity) ? quantity : 1,
    unit
  };
}

export function parseClickCollectText(text: string): ClickCollectScanResult {
  const lines = normalizeLines(text);

  const orderNumber = normalizeOrderNumber(
    findValue(lines, /(?:Ordrenr\.?|Ordrenummer)\s*[:.]?\s*(.+)$/i)
  );

  const customerName = findValue(lines, /^Kunde\s*:\s*(.+)$/i);
  const address = findValue(lines, /^Adresse\s*:\s*(.+)$/i);
  const postal = findValue(lines, /^Postnr\.?\s*:\s*(.+)$/i);
  const phone = normalizePhone(
    findValue(lines, /^(?:Telefon|Mobiltelefon)\s*:\s*(.+)$/i)
  );
  const email = findValue(lines, /^E-?post\s*:\s*(.+)$/i);
  const deliveryMethod = findValue(lines, /^Leveransemetode\s*:?\s*(.+)$/i);

  const tableStart = lines.findIndex((line) =>
    /\bGTIN\b/i.test(line) && /\bAntall\b/i.test(line)
  );
  const scanLines = tableStart >= 0 ? lines.slice(tableStart + 1) : lines;

  const items: ClickCollectScannedItem[] = [];
  let pendingHeader: string | null = null;

  for (let index = 0; index < scanLines.length; index++) {
    const line = scanLines[index];

    if (/^(sum|totalsum|side \d+ av \d+)$/i.test(line)) break;
    if (looksLikeCategory(line)) continue;

    const itemData = parseItemDataLine(line);

    if (itemData) {
      const header =
        pendingHeader ||
        clean(itemData.model) ||
        `Vare ${itemData.articleNumber}`;

      items.push({
        articleNumber: itemData.articleNumber,
        description: header,
        model:
          itemData.model && itemData.model.toLowerCase() !== header.toLowerCase()
            ? itemData.model
            : null,
        quantity: itemData.quantity,
        unit: itemData.unit
      });

      pendingHeader = null;
      continue;
    }

    if (looksLikeProductHeader(line)) {
      pendingHeader = line;
    }
  }

  return {
    orderNumber,
    customerName,
    phone,
    email,
    deliveryAddress: [address, postal].filter(Boolean).join(", ") || null,
    deliveryMethod,
    items,
    rawText: text
  };
}
