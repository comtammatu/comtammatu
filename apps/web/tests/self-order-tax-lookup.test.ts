import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  isBusinessTaxCode,
  parseVietQrBusinessLookup,
} from "../lib/hddt/business-tax-lookup";
import { GET as getBusinessTaxLookup } from "../app/api/self-order/tax-lookup/[taxCode]/route";

function readWeb(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("business tax lookup accepts the HĐĐT tax code formats", () => {
  assert.equal(isBusinessTaxCode("0312345678"), true);
  assert.equal(isBusinessTaxCode("0312345678-001"), true);
  assert.equal(isBusinessTaxCode("031234567"), false);
  assert.equal(isBusinessTaxCode("0312345678-01"), false);
});

test("business tax lookup keeps only bounded name and address fields", () => {
  assert.deepEqual(
    parseVietQrBusinessLookup({
      code: "00",
      data: {
        name: "  CÔNG TY TNHH MÁ TƯ  ",
        address: "  123 Nguyễn Văn Cừ, TP. Hồ Chí Minh  ",
        status: "Đang hoạt động",
      },
    }),
    {
      kind: "found",
      business: {
        name: "CÔNG TY TNHH MÁ TƯ",
        address: "123 Nguyễn Văn Cừ, TP. Hồ Chí Minh",
      },
    },
  );

  assert.deepEqual(parseVietQrBusinessLookup({ code: "51", data: null }), {
    kind: "not-found",
  });
  assert.deepEqual(parseVietQrBusinessLookup({ code: "99", data: null }), {
    kind: "invalid",
  });
  assert.deepEqual(
    parseVietQrBusinessLookup({ code: "00", data: { name: "Thiếu địa chỉ" } }),
    { kind: "invalid" },
  );
});

test("business tax lookup route normalizes the upstream response", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    requestedUrl = String(input);
    return Response.json({
      code: "00",
      data: {
        name: "  CÔNG TY TNHH MÁ TƯ  ",
        address: "  123 Nguyễn Văn Cừ, TP. Hồ Chí Minh  ",
      },
    });
  }) as typeof fetch;

  try {
    const response = await getBusinessTaxLookup(
      new Request("http://localhost/api/self-order/tax-lookup/0312345678"),
      { params: Promise.resolve({ taxCode: "0312345678" }) },
    );

    assert.equal(
      requestedUrl,
      "https://api.vietqr.io/v2/business/0312345678",
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      code: "00",
      data: {
        name: "CÔNG TY TNHH MÁ TƯ",
        address: "123 Nguyễn Văn Cừ, TP. Hồ Chí Minh",
      },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("POS and Self-Order wire fail-soft lookup with stale-request protection", () => {
  const panel = readWeb("app/q/[token]/self-order/payment-panel.tsx");
  const lookup = readWeb("lib/hddt/business-tax-lookup.ts");
  const route = readWeb("app/api/self-order/tax-lookup/[taxCode]/route.ts");
  const posInvoiceForm = readWeb(
    "app/(protected)/br/[branchId]/pos/_components/bill/invoice-form-section.tsx",
  );
  const messages = readFileSync(
    join(process.cwd(), "../../packages/shared/src/messages/self-order.ts"),
    "utf8",
  );

  assert.match(panel, /lookupBusinessTaxCode\(taxCode, controller\.signal\)/);
  assert.match(panel, /buyerTaxCodeValueRef\.current\.trim\(\) !== taxCode/);
  assert.match(panel, /onBlur=\{\(\) => void handleBuyerTaxCodeBlur\(\)\}/);
  assert.match(panel, /buyerTaxLookupAbortRef\.current\?\.abort\(\)/);
  assert.match(panel, /onBuyerNameChange\(business\.name\)/);
  assert.match(panel, /onBuyerAddressChange\(business\.address\)/);
  assert.ok(
    panel.indexOf('name="buyerTaxCode"') <
      panel.indexOf('id="self-order-buyer-not-get-invoice"'),
  );
  assert.equal(panel.match(/readOnly=\{!canEditBuyerDetails\}/g)?.length, 2);
  assert.match(
    panel,
    /buyerTaxLookupStatus === "not-found"[\s\S]*buyerTaxLookupStatus === "unavailable"/,
  );
  assert.match(lookup, /\/api\/self-order\/tax-lookup/);
  assert.match(route, /https:\/\/api\.vietqr\.io\/v2\/business/);
  assert.match(route, /next: \{ revalidate: 3600 \}/);
  assert.match(posInvoiceForm, /lookupBusinessTaxCode\(taxCode\)/);
  assert.match(posInvoiceForm, /onBlur=\{\(\) => void handleTaxCodeBlur\(\)\}/);
  assert.match(posInvoiceForm, /buyerName: business\.name/);
  assert.match(posInvoiceForm, /buyerAddress: business\.address/);
  assert.match(posInvoiceForm, /role="status"/);
  assert.match(messages, /buyerTaxLookupUnavailable/);
  assert.match(messages, /Bạn vẫn có thể nhập tên và địa chỉ/);
});
