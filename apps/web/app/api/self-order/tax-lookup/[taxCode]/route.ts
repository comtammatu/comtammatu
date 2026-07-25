import { isBusinessTaxCode } from "@lib/hddt/business-tax-lookup";
import { fetchBusinessTaxCode } from "@lib/hddt/business-tax-lookup-server";
import { rateLimit } from "@comtammatu/security";

const CACHE_HEADERS = {
  "Cache-Control": "public, max-age=0, s-maxage=3600",
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ taxCode: string }> },
) {
  const { taxCode: rawTaxCode } = await params;
  const taxCode = rawTaxCode.trim();
  if (!isBusinessTaxCode(taxCode)) {
    return Response.json({ code: "invalid_tax_code" }, { status: 400 });
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  try {
    const { success: allowed } = await rateLimit.limit(`tax-lookup:${ip}`);
    if (!allowed) {
      return Response.json({ code: "rate_limited" }, { status: 429 });
    }
  } catch {
    return Response.json({ code: "lookup_unavailable" }, { status: 503 });
  }

  try {
    const business = await fetchBusinessTaxCode(taxCode);
    return Response.json(
      business ? { code: "00", data: business } : { code: "51", data: null },
      { headers: CACHE_HEADERS },
    );
  } catch {
    return Response.json({ code: "lookup_unavailable" }, { status: 503 });
  }
}
