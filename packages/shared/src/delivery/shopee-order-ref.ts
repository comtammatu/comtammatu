const SHOPEE_DATED_REF = /^(\d{2})(\d{2})(\d)-(\d{4,})$/;
const OCR_LEADING_O = /^O(?=\d{4}-)/i;

export function canonicalizeShopeeOrderRef(ref: string): string {
  const trimmed = ref.trim().replace(/_/g, "-");
  if (!trimmed) return "";
  return trimmed.replace(OCR_LEADING_O, "0");
}

export function shopeeKitchenCallRef(ref: string): string | null {
  const canonical = canonicalizeShopeeOrderRef(ref);
  const dated = SHOPEE_DATED_REF.exec(canonical);
  const suffix = dated?.[4];
  if (suffix && suffix.length >= 4) return suffix.slice(-4);
  if (/^\d{4}$/.test(canonical)) return canonical;
  return null;
}

export function shopeeOrderRefLookupKeys(ref: string): string[] {
  const trimmed = ref.trim();
  if (!trimmed) return [];
  const canonical = canonicalizeShopeeOrderRef(trimmed);
  const keys = new Set<string>([trimmed, canonical]);
  if (/^0\d{4}-/.test(canonical)) {
    keys.add(`O${canonical.slice(1)}`);
  }
  return [...keys];
}
