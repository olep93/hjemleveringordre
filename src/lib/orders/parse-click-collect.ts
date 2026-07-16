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
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/[|]/g, 'I')
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function lines(text: string): string[] {
  return text.split(/\r?\n/).map(clean).filter(Boolean);
}

function labelValue(rows: string[], label: RegExp): string | null {
  for (let i = 0; i < rows.length; i++) {
    const direct = rows[i].match(label);
    if (direct?.[1]) return clean(direct[1]);
    if (label.test(rows[i]) && rows[i + 1]) return clean(rows[i + 1]);
  }
  return null;
}

function digits(value?: string | null): string {
  return clean(value).replace(/\D/g, '');
}

function normalizeOrderNumber(value?: string | null): string | null {
  const match = clean(value).match(/\d{5,10}(?:-\d+)?/);
  return match?.[0] ?? null;
}

function normalizePhone(value?: string | null): string | null {
  const valueDigits = digits(value);
  return valueDigits.length >= 8 && valueDigits.length <= 15 ? valueDigits : null;
}

const CATEGORY_WORDS = new Set([
  'konstruksjonsvirke', 'terrasse', 'maling', 'verktøy', 'byggevarer',
  'trelast', 'isolasjon', 'festemidler', 'utvendig kledning', 'innvendig kledning'
]);

function normalizedLower(value: string): string {
  return clean(value).toLowerCase().replace(/[^a-zæøå0-9 ]/g, '');
}

function isCategory(value: string): boolean {
  return CATEGORY_WORDS.has(normalizedLower(value));
}

function isNoise(value: string): boolean {
  return /^(butikk|ordredato|ordreliste|ordrenr|kunde|adresse|postnr|telefon|e-?post|leveransemetode|gtin|varemerke|modell|farge|størrelse|enhet|antall|side \d+ av \d+)\b/i.test(clean(value));
}

function isGtin(value: string): boolean {
  return /^\d{12,14}$/.test(digits(value));
}

function unitFrom(value: string): string | null {
  const lower = normalizedLower(value);
  if (/\bmeter\b/.test(lower)) return 'Meter';
  if (/\bstk\b/.test(lower)) return 'Stk';
  if (/\bpk\b|\bpakke\b/.test(lower)) return 'Pk';
  if (/\bsett\b/.test(lower)) return 'Sett';
  if (/\bm\b/.test(lower)) return 'M';
  return null;
}

function lastQuantity(value: string): number | null {
  const matches = [...clean(value).matchAll(/(?:^|\s)(\d+(?:[.,]\d+)?)(?=\s|$)/g)];
  if (!matches.length) return null;
  const number = Number(matches.at(-1)![1].replace(',', '.'));
  return Number.isFinite(number) ? number : null;
}

function productHeaderCandidate(value: string): boolean {
  const row = clean(value);
  if (!row || isNoise(row) || isCategory(row) || isGtin(row)) return false;
  if (/^\d{1,4}-\d+$/.test(row)) return false;
  return /[A-Za-zÆØÅæøå]/.test(row) && /\d/.test(row) && row.length <= 100;
}

function findHeader(rows: string[], gtinIndex: number): string | null {
  for (let i = gtinIndex - 1; i >= Math.max(0, gtinIndex - 5); i--) {
    if (productHeaderCandidate(rows[i])) return rows[i];
  }
  return null;
}

function parseProducts(rows: string[]): ClickCollectScannedItem[] {
  const items: ClickCollectScannedItem[] = [];
  const used = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const match = clean(rows[i]).match(/(?:^|\s)(\d{12,14})(?:\s|$)/);
    if (!match || used.has(match[1])) continue;

    const articleNumber = match[1];
    const header = findHeader(rows, i);
    const windowRows = rows.slice(i, Math.min(rows.length, i + 5));
    const combined = windowRows.join(' ');

    const unit = windowRows.map(unitFrom).find(Boolean) ?? unitFrom(combined) ?? 'Stk';
    let quantity = 1;
    for (let j = windowRows.length - 1; j >= 0; j--) {
      const candidate = lastQuantity(windowRows[j]);
      if (candidate !== null && candidate !== Number(articleNumber)) {
        quantity = candidate;
        break;
      }
    }

    const modelParts: string[] = [];
    for (let j = i; j < Math.min(rows.length, i + 4); j++) {
      const row = clean(rows[j]);
      if (j === i) {
        const after = clean(row.replace(articleNumber, ''));
        if (after && /[A-Za-zÆØÅæøå]/.test(after)) modelParts.push(after);
      } else if (
        !isNoise(row) && !isCategory(row) && !isGtin(row) &&
        !productHeaderCandidate(row) && !/^\d+(?:[.,]\d+)?$/.test(row) &&
        !unitFrom(row)
      ) {
        modelParts.push(row);
      }
    }

    let model = clean(modelParts.join(' ')) || null;
    if (model) {
      model = model
        .replace(new RegExp(`\\b${quantity}\\b\\s*$`), '')
        .replace(/\b(?:Meter|Stk|Pk|Sett|M)\b\s*$/i, '')
        .trim() || null;
    }

    items.push({
      articleNumber,
      description: header ?? model ?? `Vare ${articleNumber}`,
      model: model && model.toLowerCase() !== header?.toLowerCase() ? model : null,
      quantity,
      unit
    });
    used.add(articleNumber);
  }

  return items;
}

export function parseClickCollectText(text: string): ClickCollectScanResult {
  const rows = lines(text);

  const orderNumber = normalizeOrderNumber(
    labelValue(rows, /(?:Ordrenr\.?|Ordrenummer)\s*[:.]?\s*(.*)$/i)
  );
  const customerName = labelValue(rows, /^Kunde\s*:\s*(.*)$/i);
  const address = labelValue(rows, /^Adresse\s*:\s*(.*)$/i);
  const postal = labelValue(rows, /^Postnr\.?\s*:\s*(.*)$/i);
  const phone = normalizePhone(labelValue(rows, /^(?:Telefon|Mobiltelefon)\s*:\s*(.*)$/i));
  const email = labelValue(rows, /^E-?post\s*:\s*(.*)$/i);
  const deliveryMethod = labelValue(rows, /^Leveransemetode\s*:?\s*(.*)$/i);

  return {
    orderNumber,
    customerName,
    phone,
    email,
    deliveryAddress: [address, postal].filter(Boolean).join(', ') || null,
    deliveryMethod,
    items: parseProducts(rows),
    rawText: text
  };
}

export function scoreClickCollectScan(scan: ClickCollectScanResult): number {
  return (
    (scan.orderNumber ? 15 : 0) +
    (scan.customerName ? 15 : 0) +
    (scan.phone ? 5 : 0) +
    (scan.deliveryAddress ? 5 : 0) +
    scan.items.length * 25
  );
}
