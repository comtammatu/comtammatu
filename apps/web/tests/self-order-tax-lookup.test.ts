import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  isBusinessTaxCode,
  parseVietQrBusinessLookup,
} from "../lib/self-order/business-tax-lookup";

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

test("customer HĐĐT form wires fail-soft lookup with stale-request protection", () => {
  const panel = readWeb("app/q/[token]/self-order/payment-panel.tsx");
  const lookup = readWeb("lib/self-order/business-tax-lookup.ts");
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
  assert.match(lookup, /https:\/\/api\.vietqr\.io\/v2\/business/);
  assert.match(lookup, /credentials: "omit"/);
  assert.match(messages, /buyerTaxLookupUnavailable/);
  assert.match(messages, /Bạn vẫn có thể nhập tên và địa chỉ/);
});
