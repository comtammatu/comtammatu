const VIETQR_BUSINESS_LOOKUP_URL = "https://api.vietqr.io/v2/business";
const BUSINESS_TAX_CODE_PATTERN = /^\d{10}(-\d{3})?$/;

export interface BusinessTaxLookup {
  name: string;
  address: string;
}

type BusinessTaxLookupParseResult =
  | { kind: "found"; business: BusinessTaxLookup }
  | { kind: "not-found" }
  | { kind: "invalid" };

function readBoundedText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text && text.length <= maxLength ? text : null;
}

export function isBusinessTaxCode(value: string): boolean {
  return BUSINESS_TAX_CODE_PATTERN.test(value.trim());
}

export function parseVietQrBusinessLookup(
  payload: unknown,
): BusinessTaxLookupParseResult {
  if (!payload || typeof payload !== "object") return { kind: "invalid" };

  const envelope = payload as Record<string, unknown>;
  if (typeof envelope.code !== "string") return { kind: "invalid" };
  if (envelope.code === "51") return { kind: "not-found" };
  if (envelope.code !== "00") return { kind: "invalid" };
  if (!envelope.data || typeof envelope.data !== "object") {
    return { kind: "invalid" };
  }

  const data = envelope.data as Record<string, unknown>;
  const name = readBoundedText(data.name, 200);
  const address = readBoundedText(data.address, 500);
  if (!name || !address) return { kind: "invalid" };

  return { kind: "found", business: { name, address } };
}

export async function lookupBusinessTaxCode(
  taxCode: string,
  signal?: AbortSignal,
): Promise<BusinessTaxLookup | null> {
  const normalizedTaxCode = taxCode.trim();
  if (!isBusinessTaxCode(normalizedTaxCode)) return null;

  const response = await fetch(
    `${VIETQR_BUSINESS_LOOKUP_URL}/${encodeURIComponent(normalizedTaxCode)}`,
    {
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      signal,
    },
  );
  if (!response.ok) throw new Error("business_tax_lookup_unavailable");

  const parsed = parseVietQrBusinessLookup(await response.json());
  if (parsed.kind === "invalid") {
    throw new Error("business_tax_lookup_invalid_response");
  }
  return parsed.kind === "found" ? parsed.business : null;
}
