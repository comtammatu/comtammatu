import assert from "node:assert/strict";
import { test } from "node:test";
import type { InvoiceLineItem } from "../invoice";
import {
  buildSinvoiceItemInfo,
  buildSinvoiceTransactionUuid,
  deriveInvoiceTypeFromTemplate,
} from "../impl/viettel-sinvoice";

const item = (
  name: string,
  qty: number,
  amount: number,
): InvoiceLineItem => ({
  name,
  unit: "Phần",
  quantity: qty,
  unitPrice: qty > 0 ? amount / qty : 0,
  amount,
});

/**
 * Sinvoice strict validators (HDSD Tích hợp API HĐĐT, error doc v1).
 * Each must hold for every itemInfo row + summarizeInfo.
 */
function assertValidators(
  result: ReturnType<typeof buildSinvoiceItemInfo>,
  vatRate: number,
): void {
  for (const li of result.itemInfo) {
    // 43: qty × unitPrice ≈ itemTotalAmountWithoutTax  (strict < 1)
    const diff43 = Math.abs(
      li.quantity * li.unitPrice - li.itemTotalAmountWithoutTax,
    );
    assert.ok(
      diff43 < 1,
      `validator 43 failed for "${li.itemName}": qty=${li.quantity} unitPrice=${li.unitPrice} lineNet=${li.itemTotalAmountWithoutTax} diff=${diff43}`,
    );
    // 44: (lineNet − discount) × taxPct/100 ≈ taxAmount  (strict < 1)
    const diff44 = Math.abs(
      ((li.itemTotalAmountWithoutTax - li.itemDiscount) * li.taxPercentage) /
        100 -
        li.taxAmount,
    );
    assert.ok(
      diff44 < 1,
      `validator 44 failed for "${li.itemName}": expected=${(li.itemTotalAmountWithoutTax * vatRate) / 100} actual=${li.taxAmount} diff=${diff44}`,
    );
  }
  // 87: sumOfTotalLineAmountWithoutTax == Σ items.itemTotalAmountWithoutTax
  const sumNetCheck = result.itemInfo.reduce(
    (s, l) => s + l.itemTotalAmountWithoutTax,
    0,
  );
  assert.equal(
    result.sumLineNet,
    sumNetCheck,
    `validator 87: sumLineNet mismatch`,
  );
  // 49: totalTaxAmount == Σ items.taxAmount
  const sumTaxCheck = result.itemInfo.reduce((s, l) => s + l.taxAmount, 0);
  assert.equal(
    result.sumLineTax,
    sumTaxCheck,
    `validator 49: sumLineTax mismatch`,
  );
  // totalGross consistency
  assert.equal(result.totalGross, result.sumLineNet + result.sumLineTax);
}

test("validator 43 regression: qty=7 lineGross=100 vatRate=8 (old impl rejected)", () => {
  // Old impl: lineNet = round(100/1.08) = 93, netUnitPrice = round(93/7) = 13
  //          diff = |7*13 − 93| = 2 → Sinvoice reject.
  const result = buildSinvoiceItemInfo(
    [item("Cơm tấm", 7, 100)],
    8,
    /*callerPassesGross=*/ true,
  );
  assertValidators(result, 8);
});

test("validators pass for typical single-item B2B sale (qty=1, gross=109k, VAT 8%)", () => {
  const result = buildSinvoiceItemInfo(
    [item("Cơm tấm sườn", 1, 109_000)],
    8,
    true,
  );
  assertValidators(result, 8);
  const [line] = result.itemInfo;
  assert.ok(line);
  assert.equal(line.quantity, 1);
  // 109_000 / 1.08 ≈ 100_926 — round to nearest đồng.
  assert.equal(line.unitPrice, 100_926);
  assert.equal(line.itemTotalAmountWithoutTax, 100_926);
});

test("validators pass for awkward qty divisions across multiple items", () => {
  const result = buildSinvoiceItemInfo(
    [
      item("Cơm tấm", 3, 117_000),
      item("Trà đá", 11, 55_000),
      item("Canh chua", 4, 80_000),
      item("Bia Tiger", 7, 100_000),
    ],
    8,
    true,
  );
  assertValidators(result, 8);
});

test("validators pass when callerPassesGross=false (NET input)", () => {
  // B2C batch path: _compute_vat_breakdown returns NET amounts per line.
  const result = buildSinvoiceItemInfo(
    [item("Cơm tấm", 3, 92_592), item("Trà đá", 11, 50_926)],
    8,
    false,
  );
  assertValidators(result, 8);
});

test("validators pass for VAT 0% (exempt items)", () => {
  const result = buildSinvoiceItemInfo(
    [item("Quà tặng KH", 1, 0), item("Hàng khuyến mãi", 2, 50_000)],
    0,
    true,
  );
  assertValidators(result, 0);
  for (const li of result.itemInfo) {
    assert.equal(li.taxAmount, 0);
  }
  assert.equal(result.sumLineTax, 0);
});

test("validators pass for VAT 10% mixed inventory", () => {
  const result = buildSinvoiceItemInfo(
    [item("Bia Sài Gòn", 5, 165_000), item("Rượu", 2, 220_000)],
    10,
    true,
  );
  assertValidators(result, 10);
});

test("qty=0 edge case does not crash", () => {
  const result = buildSinvoiceItemInfo([item("Ghost line", 0, 0)], 8, true);
  const [line] = result.itemInfo;
  assert.ok(line);
  assert.equal(line.unitPrice, 0);
  assert.equal(line.itemTotalAmountWithoutTax, 0);
  assert.equal(line.taxAmount, 0);
});

test("empty items list returns zero sums", () => {
  const result = buildSinvoiceItemInfo([], 8, true);
  assert.deepEqual(result.itemInfo, []);
  assert.equal(result.sumLineNet, 0);
  assert.equal(result.sumLineTax, 0);
  assert.equal(result.totalGross, 0);
});

test("buildSinvoiceTransactionUuid: 32-char fixed length", () => {
  assert.equal(buildSinvoiceTransactionUuid(1).length, 32);
  assert.equal(buildSinvoiceTransactionUuid(123456789).length, 32);
  // Idempotent for same id
  assert.equal(
    buildSinvoiceTransactionUuid(42),
    buildSinvoiceTransactionUuid(42),
  );
  // Different ids → different uuids
  assert.notEqual(
    buildSinvoiceTransactionUuid(42),
    buildSinvoiceTransactionUuid(43),
  );
});

test("buildSinvoiceTransactionUuid: handles huge ids by truncating", () => {
  const huge = Number.MAX_SAFE_INTEGER;
  const uuid = buildSinvoiceTransactionUuid(huge);
  assert.equal(uuid.length, 32);
  assert.ok(uuid.startsWith("HDDT"));
});

test("deriveInvoiceTypeFromTemplate: TT78 '1/001' → '1' (HĐ GTGT)", () => {
  assert.equal(deriveInvoiceTypeFromTemplate("1/001"), "1");
});

test("deriveInvoiceTypeFromTemplate: TT78 '2/001' → '2' (HĐ bán hàng từ MTT)", () => {
  assert.equal(deriveInvoiceTypeFromTemplate("2/001"), "2");
});

test("deriveInvoiceTypeFromTemplate: TT78 with multi-digit suffix '2/123' → '2'", () => {
  assert.equal(deriveInvoiceTypeFromTemplate("2/123"), "2");
});

test("deriveInvoiceTypeFromTemplate: supports all 6 TT78 kinds", () => {
  for (const kind of ["1", "2", "3", "4", "5", "6"]) {
    assert.equal(deriveInvoiceTypeFromTemplate(`${kind}/001`), kind);
  }
});

test("deriveInvoiceTypeFromTemplate: throws on invalid shape (legacy TT32)", () => {
  assert.throws(
    () => deriveInvoiceTypeFromTemplate("01GTKT0/001"),
    /Invalid SINVOICE_TEMPLATE_CODE/,
  );
});

test("deriveInvoiceTypeFromTemplate: throws on empty string", () => {
  assert.throws(
    () => deriveInvoiceTypeFromTemplate(""),
    /Invalid SINVOICE_TEMPLATE_CODE/,
  );
});

test("deriveInvoiceTypeFromTemplate: throws on out-of-range kind (7+)", () => {
  assert.throws(
    () => deriveInvoiceTypeFromTemplate("7/001"),
    /Invalid SINVOICE_TEMPLATE_CODE/,
  );
});

test("randomised: validators hold across 200 random (qty, gross, vatRate) trios", () => {
  const rng = (seed: number) => {
    let s = seed;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 0xffffffff;
    };
  };
  const rand = rng(0xc0ffee);
  const vatRates = [0, 5, 8, 10];
  for (let i = 0; i < 200; i++) {
    const qty = Math.floor(rand() * 20) + 1;
    const gross = Math.floor(rand() * 1_000_000) + 1;
    const vatRate = vatRates[Math.floor(rand() * vatRates.length)] ?? 8;
    const result = buildSinvoiceItemInfo(
      [item(`row-${i}`, qty, gross)],
      vatRate,
      true,
    );
    assertValidators(result, vatRate);
  }
});
