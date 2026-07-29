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

    assert.equal(requestedUrl, "https://api.vietqr.io/v2/business/0312345678");
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

test("public invoice QR flow wires fail-safe lookup with stale-request protection", () => {
  const lookup = readWeb("lib/hddt/business-tax-lookup.ts");
  const serverLookup = readWeb("lib/hddt/business-tax-lookup-server.ts");
  const route = readWeb("app/api/self-order/tax-lookup/[taxCode]/route.ts");
  const invoiceBuyerForm = readWeb(
    "app/q/invoice/[token]/invoice-buyer-form.tsx",
  );

  assert.match(lookup, /\/api\/self-order\/tax-lookup/);
  assert.match(serverLookup, /https:\/\/api\.vietqr\.io\/v2\/business/);
  assert.match(serverLookup, /next: \{ revalidate: 3600 \}/);
  assert.match(route, /fetchBusinessTaxCode\(taxCode\)/);
  assert.match(route, /rateLimit\.limit/);
  assert.match(
    invoiceBuyerForm,
    /lookupBusinessTaxCode\(\s*normalized,\s*controller\.signal/,
  );
  assert.match(invoiceBuyerForm, /onBlur=\{\(\) => void handleLookup\(\)\}/);
  assert.match(invoiceBuyerForm, /setBuyerName\(business\.name\)/);
  assert.match(invoiceBuyerForm, /setBuyerAddress\(business\.address\)/);
  assert.match(invoiceBuyerForm, /role="status"/);
  assert.match(invoiceBuyerForm, /requestRef\.current\?\.abort\(\)/);
});

test("supplier list opens ingredients and reuses the guarded MST lookup", () => {
  const suppliersClient = readWeb(
    "app/(protected)/inventory/suppliers/suppliers-client.tsx",
  );
  const supplierDialog = readWeb(
    "app/(protected)/inventory/suppliers/supplier-dialog.tsx",
  );
  const supplierItemsPage = readWeb(
    "app/(protected)/inventory/suppliers/[id]/items/page.tsx",
  );
  const supplierItemsActions = readWeb(
    "app/(protected)/inventory/suppliers/[id]/items/actions.ts",
  );

  assert.match(
    suppliersClient,
    /onRowClick=\{canReadItems \? openItems : undefined\}/,
  );
  assert.match(
    suppliersClient,
    /onOpen=\{canReadItems \? openItems : undefined\}/,
  );
  assert.match(
    suppliersClient,
    /router\.push\(`\/inventory\/suppliers\/\$\{row\.id\}\/items`\)/,
  );
  assert.match(supplierDialog, /lookupBusinessTaxCode\(normalized\)/);
  assert.match(supplierDialog, /form\.setValue\("name", business\.name/);
  assert.match(supplierDialog, /form\.setValue\("address", business\.address/);
  assert.match(supplierDialog, /role="status"/);
  assert.match(
    supplierItemsPage,
    /PERMISSION_KEYS\.PROCUREMENT_PRICE_LIST_READ/,
  );
  assert.match(
    supplierItemsActions,
    /permission: PERMISSION_KEYS\.PROCUREMENT_PRICE_LIST_WRITE/,
  );
});
