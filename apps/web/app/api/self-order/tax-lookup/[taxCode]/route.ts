import {
  isBusinessTaxCode,
  parseVietQrBusinessLookup,
} from "@lib/hddt/business-tax-lookup";

const VIETQR_BUSINESS_LOOKUP_URL = "https://api.vietqr.io/v2/business";
const CACHE_HEADERS = {
  "Cache-Control": "public, max-age=0, s-maxage=3600",
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ taxCode: string }> },
) {
  const { taxCode: rawTaxCode } = await params;
  const taxCode = rawTaxCode.trim();
  if (!isBusinessTaxCode(taxCode)) {
    return Response.json({ code: "invalid_tax_code" }, { status: 400 });
  }

  try {
    const response = await fetch(
      `${VIETQR_BUSINESS_LOOKUP_URL}/${encodeURIComponent(taxCode)}`,
      { next: { revalidate: 3600 } },
    );
    if (!response.ok) {
      return Response.json({ code: "lookup_unavailable" }, { status: 503 });
    }

    const parsed = parseVietQrBusinessLookup(await response.json());
    if (parsed.kind === "invalid") {
      return Response.json({ code: "lookup_unavailable" }, { status: 503 });
    }

    return Response.json(
      parsed.kind === "found"
        ? { code: "00", data: parsed.business }
        : { code: "51", data: null },
      { headers: CACHE_HEADERS },
    );
  } catch {
    return Response.json({ code: "lookup_unavailable" }, { status: 503 });
  }
}
