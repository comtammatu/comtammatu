export const INVOICE_UNITS = [
  "Phần",
  "Ly",
  "Chai",
  "Lon",
  "Tô",
  "Cái",
  "Bộ",
] as const;

export type InvoiceUnit = (typeof INVOICE_UNITS)[number];

export const DEFAULT_INVOICE_UNIT: InvoiceUnit = "Phần";

const INVOICE_UNIT_SET = new Set<string>(INVOICE_UNITS);

/** Exact sold names on the current Má Tư menu. Unknown names use category fallback. */
const MENU_INVOICE_UNITS: Readonly<Record<string, InvoiceUnit>> = {
  "sườn cọng": "Phần",
  "sườn cốt lết": "Phần",
  "sườn một gang": "Phần",
  "cơm tấm bì": "Phần",
  "cơm tấm chả": "Phần",
  "cơm tấm trứng": "Phần",
  "cơm thêm": "Phần",
  bì: "Phần",
  chả: "Phần",
  trứng: "Phần",
  "tóp mỡ": "Phần",
  "canh khổ qua": "Tô",
  "cam ép": "Ly",
  "nước sâm": "Ly",
  "rau má": "Ly",
  "trà đá": "Ly",
  "trà tắc": "Ly",
  "coca cola": "Lon",
  "fanta cam": "Lon",
  "fanta xá xị": "Lon",
  sprite: "Lon",
  "nước suối": "Chai",
  "khăn lạnh": "Cái",
  "dụng cụ mang về": "Bộ",
};

function normalizeItemName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase("vi");
}

function parseInvoiceUnit(value: string | null | undefined): InvoiceUnit | null {
  if (typeof value !== "string") return null;
  const unit = value.trim();
  return INVOICE_UNIT_SET.has(unit) ? (unit as InvoiceUnit) : null;
}

function invoiceUnitFromCategory(
  categoryType: string | null | undefined,
): InvoiceUnit {
  return categoryType === "drink" ? "Ly" : DEFAULT_INVOICE_UNIT;
}

export function resolveInvoiceUnit(input: {
  name?: string | null;
  unit?: string | null;
  categoryType?: string | null;
}): InvoiceUnit {
  const explicit = parseInvoiceUnit(input.unit);
  if (explicit) return explicit;

  const name = input.name?.trim() ?? "";
  if (name !== "") {
    const mapped = MENU_INVOICE_UNITS[normalizeItemName(name)];
    if (mapped) return mapped;
  }

  return invoiceUnitFromCategory(input.categoryType);
}
