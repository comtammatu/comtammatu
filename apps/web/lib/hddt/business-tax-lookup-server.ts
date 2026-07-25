import {
  isBusinessTaxCode,
  parseVietQrBusinessLookup,
  type BusinessTaxLookup,
} from "./business-tax-lookup";

const VIETQR_BUSINESS_LOOKUP_URL = "https://api.vietqr.io/v2/business";

export async function fetchBusinessTaxCode(
  taxCode: string,
): Promise<BusinessTaxLookup | null> {
  const normalizedTaxCode = taxCode.trim();
  if (!isBusinessTaxCode(normalizedTaxCode)) return null;

  const response = await fetch(
    `${VIETQR_BUSINESS_LOOKUP_URL}/${encodeURIComponent(normalizedTaxCode)}`,
    { next: { revalidate: 3600 } },
  );
  if (!response.ok) throw new Error("business_tax_lookup_unavailable");

  const parsed = parseVietQrBusinessLookup(await response.json());
  if (parsed.kind === "invalid") {
    throw new Error("business_tax_lookup_invalid_response");
  }
  return parsed.kind === "found" ? parsed.business : null;
}
