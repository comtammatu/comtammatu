import assert from "node:assert/strict";
import { test } from "node:test";
import { BUYER_NOT_GET_INVOICE_NAME, type InvoiceLineItem } from "../invoice";
import {
  buildSinvoiceItemInfo,
  buildSinvoiceTransactionUuid,
  deriveInvoiceTypeFromTemplate,
  ViettelSinvoiceProvider,
} from "../impl/viettel-sinvoice";
import { strToU8, zipSync } from "fflate";

const item = (
  name: string,
  qty: number,
  amount: number,
  discountAmount = 0,
): InvoiceLineItem => ({
  name,
  unit: "Phần",
  quantity: qty,
  unitPrice: qty > 0 ? amount / qty : 0,
  amount,
  ...(discountAmount > 0 ? { discountAmount } : {}),
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
      ((li.itemTotalAmountWithoutTax - li.itemDiscount) *
        (li.taxPercentage ?? 0)) /
        100 -
        (li.taxAmount ?? 0),
    );
    assert.ok(
      diff44 < 1,
      `validator 44 failed for "${li.itemName}": expected=${((li.itemTotalAmountWithoutTax - li.itemDiscount) * vatRate) / 100} actual=${li.taxAmount} diff=${diff44}`,
    );
    // discount is a RATE % in [0,100], never the amount (Viettel DISCOUNT_INVALID).
    assert.ok(
      li.discount >= 0 && li.discount <= 100,
      `discount must be a rate in [0,100], got ${li.discount} for "${li.itemName}"`,
    );
    // Rate must carry ≤2 decimals or Viettel rejects with
    // BAD_REQUEST_INVALID_DECIMAL_POINT_DISCOUNT.
    assert.equal(
      Math.round(li.discount * 100) / 100,
      li.discount,
      `discount rate must have ≤2 decimals, got ${li.discount} for "${li.itemName}"`,
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
  const sumDiscountCheck = result.itemInfo.reduce(
    (s, l) => s + l.itemDiscount,
    0,
  );
  assert.equal(
    result.sumLineDiscount,
    sumDiscountCheck,
    `sumLineDiscount mismatch`,
  );
  // 49: totalTaxAmount == Σ items.taxAmount
  const sumTaxCheck = result.itemInfo.reduce((s, l) => s + (l.taxAmount ?? 0), 0);
  assert.equal(
    result.sumLineTax,
    sumTaxCheck,
    `validator 49: sumLineTax mismatch`,
  );
  // totalGross consistency
  assert.equal(
    result.totalGross,
    result.sumLineNet - result.sumLineDiscount + result.sumLineTax,
  );
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

test("discount rate rounded to ≤2dp — mẫu-2 (BAD_REQUEST_INVALID_DECIMAL_POINT_DISCOUNT repro)", () => {
  // Prod bug: 10_000 discount on a 30_000 line → rate 33.3333…% un-rounded →
  // Viettel rejects, invoice stuck draft. Rounded rate (33.33) is accepted.
  const result = buildSinvoiceItemInfo(
    [item("Cơm sườn", 1, 30_000, 10_000)],
    8,
    true,
    "direct_sales_gross",
  );
  assertValidators(result, 8);
  const [line] = result.itemInfo;
  assert.ok(line);
  assert.equal(line.itemDiscount, 10_000); // amount (đồng) unchanged — authoritative
  assert.equal(line.discount, 33.33); // rate rounded to 2dp
});

test("discount rate rounded to ≤2dp — mẫu-1 net path", () => {
  const result = buildSinvoiceItemInfo(
    [item("Cơm sườn", 1, 30_000, 10_000)],
    8,
    true,
  );
  assertValidators(result, 8); // now enforces the ≤2-decimal rate invariant
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

test("template 2 direct-sales mode keeps VAT-inclusive menu prices", () => {
  const result = buildSinvoiceItemInfo(
    [
      item("Sườn Cốt Lết", 1, 47_000),
      item("Sườn Cốt Lết", 1, 47_000),
      item("Sườn Cốt Lết", 2, 80_000),
      item("Cơm Thêm", 1, 5_000),
    ],
    8,
    true,
    "direct_sales_gross",
  );

  assert.equal(result.sumLineNet, 179_000);
  assert.equal(result.sumLineTax, 0);
  assert.equal(result.totalGross, 179_000);
  assert.deepEqual(
    result.itemInfo.map((line) => ({
      unitPrice: line.unitPrice,
      quantity: line.quantity,
      amount: line.itemTotalAmountWithoutTax,
      amountWithTax: line.itemTotalAmountWithTax,
      taxPercentage: line.taxPercentage,
      taxAmount: line.taxAmount,
    })),
    [
      {
        unitPrice: 47_000,
        quantity: 1,
        amount: 47_000,
        amountWithTax: 47_000,
        taxPercentage: undefined,
        taxAmount: undefined,
      },
      {
        unitPrice: 47_000,
        quantity: 1,
        amount: 47_000,
        amountWithTax: 47_000,
        taxPercentage: undefined,
        taxAmount: undefined,
      },
      {
        unitPrice: 40_000,
        quantity: 2,
        amount: 80_000,
        amountWithTax: 80_000,
        taxPercentage: undefined,
        taxAmount: undefined,
      },
      {
        unitPrice: 5_000,
        quantity: 1,
        amount: 5_000,
        amountWithTax: 5_000,
        taxPercentage: undefined,
        taxAmount: undefined,
      },
    ],
  );
});

test("direct-sales mode subtracts allocated line discounts from Sinvoice totals", () => {
  const result = buildSinvoiceItemInfo(
    [item("Cơm tấm khuyến mãi", 1, 100_000, 10_000)],
    8,
    true,
    "direct_sales_gross",
  );

  assert.equal(result.sumLineNet, 100_000);
  assert.equal(result.sumLineDiscount, 10_000);
  assert.equal(result.sumLineTax, 0);
  assert.equal(result.totalGross, 90_000);

  const [line] = result.itemInfo;
  assert.ok(line);
  assert.equal(line.itemTotalAmountWithoutTax, 100_000);
  assert.equal(line.itemTotalAmountAfterDiscount, 90_000);
  assert.equal(line.itemTotalAmountWithTax, 90_000);
  assert.equal(line.discount, 10); // rate %, not the 10_000₫ amount
  assert.equal(line.itemDiscount, 10_000);
  assert.equal(line.taxPercentage, undefined);
  assert.equal(line.taxAmount, undefined);
});

test("direct-sales discount serializes as a RATE %, not the amount", () => {
  // Regression: a fixed-amount line discount must be a RATE in [0,100], not the
  // amount — Viettel rejects an amount-as-rate with DISCOUNT_INVALID.
  const result = buildSinvoiceItemInfo(
    [item("Nước ngọt KM", 1, 15_000, 5_000)],
    8,
    true,
    "direct_sales_gross",
  );
  const [line] = result.itemInfo;
  assert.ok(line);
  assert.equal(line.itemDiscount, 5_000);
  assert.ok(
    line.discount >= 0 && line.discount <= 100,
    `discount must be a rate, got ${line.discount}`,
  );
  // 5_000/15_000 = 33.3333…% → rounded to 2dp (Viettel rejects >2 decimals).
  assert.equal(line.discount, 33.33);
  assert.equal(line.itemTotalAmountAfterDiscount, 10_000);
});

test("direct-sales 100% free item: rate = 100, itemDiscount = full amount", () => {
  // Fully-discounted promo line (e.g. a free drink): rate caps at 100.
  const result = buildSinvoiceItemInfo(
    [item("Phần nước miễn phí", 1, 10_000, 10_000)],
    8,
    true,
    "direct_sales_gross",
  );
  const [line] = result.itemInfo;
  assert.ok(line);
  assert.equal(line.discount, 100);
  assert.equal(line.itemDiscount, 10_000);
  assert.equal(line.itemTotalAmountAfterDiscount, 0);
});

test("VAT mode converts gross line discounts to net itemDiscount", () => {
  const result = buildSinvoiceItemInfo(
    [item("Cơm tấm VAT", 1, 108_000, 10_800)],
    8,
    true,
  );

  assertValidators(result, 8);
  assert.equal(result.sumLineNet, 100_000);
  assert.equal(result.sumLineDiscount, 10_000);
  assert.equal(result.sumLineTax, 7_200);
  assert.equal(result.totalGross, 97_200);

  const [line] = result.itemInfo;
  assert.ok(line);
  assert.equal(line.itemTotalAmountWithoutTax, 100_000);
  assert.equal(line.itemTotalAmountAfterDiscount, 90_000);
  assert.equal(line.itemTotalAmountWithTax, 97_200);
  assert.equal(line.discount, 10); // rate %, not the 10_000₫ amount
  assert.equal(line.itemDiscount, 10_000);
  assert.equal(line.taxAmount, 7_200);
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

test("createInvoice: login request uses JSON credentials body", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{
    input: Parameters<typeof fetch>[0];
    init: NonNullable<Parameters<typeof fetch>[1]>;
  }> = [];

  globalThis.fetch = (async (input, init) => {
    const requestInit = init ?? {};
    calls.push({ input, init: requestInit });

    if (String(input).endsWith("/auth/login")) {
      return new Response(
        JSON.stringify({ access_token: "test-token", expires_in: 3600 }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        result: {
          invoiceNo: "SBOX-1",
          supplierTaxCode: "0100109106-509",
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;

  try {
    const provider = new ViettelSinvoiceProvider({
      username: "0100109106-509",
      password: "test-password",
      taxCode: "0100109106-509",
      templateCode: "2/001",
      invoiceSeries: "C22TYY",
      baseUrl: "https://example.test",
    });

    const result = await provider.createInvoice({
      orderId: 1,
      orderNumber: "SBOX-1",
      sellerName: "Com Tam Ma Tu",
      sellerTaxCode: "0100109106-509",
      sellerAddress: "Sandbox",
      buyerName: "Khach le sandbox",
      items: [item("Com tam sandbox", 1, 100_000)],
      subtotal: 92_593,
      vatRate: 8,
      vatAmount: 7_407,
      totalAmount: 100_000,
    });

    assert.equal(result.status, "submitted");

    const loginCall = calls.find((call) =>
      String(call.input).endsWith("/auth/login"),
    );
    assert.ok(loginCall, "expected /auth/login to be called");
    const headers = new Headers(loginCall.init.headers);
    assert.equal(headers.get("Content-Type"), "application/json");
    assert.equal(headers.has("Authorization"), false);
    assert.equal(
      loginCall.init.body,
      JSON.stringify({
        username: "0100109106-509",
        password: "test-password",
      }),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

const instantIssueReq = (orderId: number) => ({
  orderId,
  orderNumber: `ORD-${orderId}`,
  sellerName: "",
  sellerTaxCode: "0100109106-509",
  sellerAddress: "",
  buyerName: "Khach le",
  items: [item("Com tam", 1, 100_000)],
  subtotal: 100_000,
  vatRate: 2.4,
  vatAmount: 0,
  totalAmount: 100_000,
});

const instantIssueProvider = () =>
  new ViettelSinvoiceProvider({
    username: "0100109106-509",
    password: "test-password",
    taxCode: "0100109106-509",
    templateCode: "2/001",
    invoiceSeries: "C26MAA",
    baseUrl: "https://example.test",
  });

const createMock =
  (body: Record<string, unknown>) =>
  (async (input: Parameters<typeof fetch>[0]) => {
    if (String(input).endsWith("/auth/login")) {
      return new Response(
        JSON.stringify({ access_token: "test-token", expires_in: 3600 }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    return new Response(JSON.stringify({ result: body }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

test("createInvoice: synchronous codeOfTax marks MTT mẫu-2 invoice issued", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = createMock({
    invoiceNo: "C26MAA42",
    codeOfTax: "MA-CQT-MTT-1",
    supplierTaxCode: "0100109106-509",
  });
  try {
    const result = await instantIssueProvider().createInvoice(
      instantIssueReq(42),
    );
    assert.equal(result.status, "issued");
    assert.equal(result.codeOfTax, "MA-CQT-MTT-1");
    assert.equal(result.invoiceNumber, "C26MAA42");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("createInvoice: empty or whitespace codeOfTax stays submitted (no false issue)", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = createMock({ invoiceNo: "C26MAA7", codeOfTax: "" });
    assert.equal(
      (await instantIssueProvider().createInvoice(instantIssueReq(7))).status,
      "submitted",
    );
    globalThis.fetch = createMock({ invoiceNo: "C26MAA7", codeOfTax: "   " });
    assert.equal(
      (await instantIssueProvider().createInvoice(instantIssueReq(7))).status,
      "submitted",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("createInvoice: no invoiceNo stays signing", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = createMock({});
  try {
    const result = await instantIssueProvider().createInvoice(
      instantIssueReq(8),
    );
    assert.equal(result.status, "signing");
    assert.equal(result.invoiceNumber, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("createInvoice: sends buyerNotGetInvoice flag for no-buyer-info sales", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{
    input: Parameters<typeof fetch>[0];
    init: NonNullable<Parameters<typeof fetch>[1]>;
  }> = [];

  globalThis.fetch = (async (input, init) => {
    const requestInit = init ?? {};
    calls.push({ input, init: requestInit });

    if (String(input).endsWith("/auth/login")) {
      return new Response(
        JSON.stringify({ access_token: "test-token", expires_in: 3600 }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        result: {
          invoiceNo: "SBOX-2",
          supplierTaxCode: "0100109106-509",
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;

  try {
    const provider = new ViettelSinvoiceProvider({
      username: "0100109106-509",
      password: "test-password",
      taxCode: "0100109106-509",
      templateCode: "2/001",
      invoiceSeries: "C22TYY",
      baseUrl: "https://example.test",
    });

    const result = await provider.createInvoice({
      orderId: 2,
      orderNumber: "SBOX-2",
      sellerName: "Com Tam Ma Tu",
      sellerTaxCode: "0100109106-509",
      sellerAddress: "Sandbox",
      // Stale POS client bundle shipping the pre-NĐ254 phrase — server must
      // override it with the current constant, not forward the client value.
      buyerName: "Người mua không lấy hóa đơn",
      buyerNotGetInvoice: true,
      items: [item("Com tam sandbox", 1, 100_000)],
      subtotal: 92_593,
      vatRate: 8,
      vatAmount: 7_407,
      totalAmount: 100_000,
    });

    assert.equal(result.status, "submitted");

    const createCall = calls.find((call) =>
      String(call.input).includes("/InvoiceAPI/InvoiceWS/createInvoice/"),
    );
    assert.ok(createCall, "expected createInvoice endpoint to be called");

    const body = JSON.parse(String(createCall.init.body)) as {
      buyerInfo: {
        buyerName?: string;
        buyerLegalName?: string | null;
        buyerTaxCode?: string | null;
        buyerNotGetInvoice?: string;
      };
      payments?: Array<{ paymentMethod?: string; paymentMethodName?: string }>;
      sellerInfo?: unknown;
      itemInfo?: Array<{
        selection?: number;
        unitPrice?: number;
        itemTotalAmountWithoutTax?: number;
        itemTotalAmountAfterDiscount?: number;
        itemTotalAmountWithTax?: number;
        discount?: number;
        itemDiscount?: number;
        taxPercentage?: number;
        taxAmount?: number;
      }>;
      summarizeInfo?: {
        totalAmountAfterDiscount?: number;
        totalAmountWithoutTax?: number;
        totalTaxAmount?: number;
        totalAmountWithTax?: number;
      };
    };

    // Server-controlled: the stale client value is replaced by the constant.
    assert.equal(body.buyerInfo.buyerName, BUYER_NOT_GET_INVOICE_NAME);
    assert.equal(body.buyerInfo.buyerLegalName, null);
    assert.equal(body.buyerInfo.buyerTaxCode, null);
    assert.equal(body.buyerInfo.buyerNotGetInvoice, "1");
    assert.deepEqual(body.payments, [
      { paymentMethod: "3", paymentMethodName: "TM/CK" },
    ]);
    assert.equal(body.sellerInfo, undefined);

    const [line] = body.itemInfo ?? [];
    assert.ok(line);
    assert.equal(line.selection, 1);
    assert.equal(line.unitPrice, 100_000);
    assert.equal(line.itemTotalAmountWithoutTax, 100_000);
    assert.equal(line.itemTotalAmountAfterDiscount, 100_000);
    assert.equal(line.itemTotalAmountWithTax, 100_000);
    assert.equal(line.taxPercentage, undefined);
    assert.equal(line.taxAmount, undefined);
    assert.equal(line.discount, 0);
    assert.equal(line.itemDiscount, 0);
    assert.equal(body.summarizeInfo?.totalAmountAfterDiscount, 100_000);
    assert.equal(body.summarizeInfo?.totalAmountWithoutTax, 100_000);
    assert.equal(body.summarizeInfo?.totalTaxAmount, 0);
    assert.equal(body.summarizeInfo?.totalAmountWithTax, 100_000);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("createInvoice: sends direct-sales line discount and discounted summary", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{
    input: Parameters<typeof fetch>[0];
    init: NonNullable<Parameters<typeof fetch>[1]>;
  }> = [];

  globalThis.fetch = (async (input, init) => {
    const requestInit = init ?? {};
    calls.push({ input, init: requestInit });

    if (String(input).endsWith("/auth/login")) {
      return new Response(
        JSON.stringify({ access_token: "test-token", expires_in: 3600 }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        result: {
          invoiceNo: "SBOX-DISCOUNT",
          supplierTaxCode: "0100109106-509",
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;

  try {
    const provider = new ViettelSinvoiceProvider({
      username: "0100109106-509",
      password: "test-password",
      taxCode: "0100109106-509",
      templateCode: "2/001",
      invoiceSeries: "C22TYY",
      baseUrl: "https://example.test",
    });

    const result = await provider.createInvoice({
      orderId: 22,
      orderNumber: "SBOX-DISCOUNT",
      sellerName: "Com Tam Ma Tu",
      sellerTaxCode: "0100109106-509",
      sellerAddress: "Sandbox",
      buyerName: "Bán cho người tiêu dùng",
      buyerNotGetInvoice: true,
      items: [item("Com tam discount", 1, 100_000, 10_000)],
      subtotal: 83_333,
      vatRate: 8,
      vatAmount: 6_667,
      totalAmount: 90_000,
    });

    assert.equal(result.status, "submitted");

    const createCall = calls.find((call) =>
      String(call.input).includes("/InvoiceAPI/InvoiceWS/createInvoice/"),
    );
    assert.ok(createCall, "expected createInvoice endpoint to be called");

    const body = JSON.parse(String(createCall.init.body)) as {
      itemInfo?: Array<{
        itemTotalAmountWithoutTax?: number;
        itemTotalAmountAfterDiscount?: number;
        itemTotalAmountWithTax?: number;
        discount?: number;
        itemDiscount?: number;
      }>;
      summarizeInfo?: {
        totalAmountAfterDiscount?: number;
        totalAmountWithoutTax?: number;
        totalTaxAmount?: number;
        totalAmountWithTax?: number;
        discountAmount?: number;
      };
      taxBreakdowns?: Array<{ taxableAmount?: number; taxAmount?: number }>;
    };

    const [line] = body.itemInfo ?? [];
    assert.ok(line);
    assert.equal(line.itemTotalAmountWithoutTax, 100_000);
    assert.equal(line.itemTotalAmountAfterDiscount, 90_000);
    assert.equal(line.itemTotalAmountWithTax, 90_000);
    assert.equal(line.discount, 10); // rate %, not the 10_000₫ amount
    assert.equal(line.itemDiscount, 10_000);
    assert.equal(body.summarizeInfo?.discountAmount, 10_000);
    assert.equal(body.summarizeInfo?.totalAmountAfterDiscount, 90_000);
    assert.equal(body.summarizeInfo?.totalAmountWithoutTax, 90_000);
    assert.equal(body.summarizeInfo?.totalTaxAmount, 0);
    assert.equal(body.summarizeInfo?.totalAmountWithTax, 90_000);
    // mẫu-2 sales invoice: no tax breakdown (taxPercentage turned off).
    assert.deepEqual(body.taxBreakdowns, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("createInvoice: preserves Viettel 400 message for operator follow-up", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input) => {
    if (String(input).endsWith("/auth/login")) {
      return new Response(
        JSON.stringify({ access_token: "test-token", expires_in: 3600 }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        message: "Mẫu hóa đơn hoặc ký hiệu hóa đơn không tồn tại",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;

  try {
    const provider = new ViettelSinvoiceProvider({
      username: "0100109106-509",
      password: "test-password",
      taxCode: "0100109106-509",
      templateCode: "2/001",
      invoiceSeries: "C22TYY",
      baseUrl: "https://example.test",
    });

    const result = await provider.createInvoice({
      orderId: 3,
      orderNumber: "SBOX-3",
      sellerName: "Com Tam Ma Tu",
      sellerTaxCode: "0100109106-509",
      sellerAddress: "Sandbox",
      buyerName: "Bán cho người tiêu dùng",
      buyerNotGetInvoice: true,
      items: [item("Com tam sandbox", 1, 100_000)],
      subtotal: 92_593,
      vatRate: 8,
      vatAmount: 7_407,
      totalAmount: 100_000,
    });

    assert.equal(result.status, "failed");
    assert.equal(result.providerData?.["httpStatus"], 400);
    assert.equal(
      result.providerData?.["description"],
      "Mẫu hóa đơn hoặc ký hiệu hóa đơn không tồn tại",
    );
    assert.deepEqual(result.providerData?.["response"], {
      message: "Mẫu hóa đơn hoặc ký hiệu hóa đơn không tồn tại",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("getStatus: searches by transactionUuid with form body", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{
    input: Parameters<typeof fetch>[0];
    init: NonNullable<Parameters<typeof fetch>[1]>;
  }> = [];

  globalThis.fetch = (async (input, init) => {
    const requestInit = init ?? {};
    calls.push({ input, init: requestInit });

    if (String(input).endsWith("/auth/login")) {
      return new Response(
        JSON.stringify({ access_token: "test-token", expires_in: 3600 }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        errorCode: null,
        description: null,
        transactionUuid: "HDDT0000000000000000000000000001",
        result: [
          {
            invoiceNo: "C26TYY308",
            exchangeStatus: "INVOICE_HAS_CODE_APPROVED",
            codeOfTax: "ABC123",
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;

  try {
    const provider = new ViettelSinvoiceProvider({
      username: "0100109106-509",
      password: "test-password",
      taxCode: "0100109106-509",
      templateCode: "2/001",
      invoiceSeries: "C22TYY",
      baseUrl: "https://example.test",
    });

    const status = await provider.getStatus("HDDT0000000000000000000000000001");

    assert.deepEqual(status, {
      status: "issued",
      invoiceNumber: "C26TYY308",
      codeOfTax: "ABC123",
      error: null,
    });

    const statusCall = calls.find((call) =>
      String(call.input).endsWith(
        "/InvoiceAPI/InvoiceWS/searchInvoiceByTransactionUuid",
      ),
    );
    assert.ok(statusCall, "expected searchInvoiceByTransactionUuid call");
    const headers = new Headers(statusCall.init.headers);
    assert.equal(
      headers.get("Content-Type"),
      "application/x-www-form-urlencoded",
    );
    assert.ok(statusCall.init.body instanceof URLSearchParams);
    assert.equal(
      statusCall.init.body.toString(),
      "supplierTaxCode=0100109106-509&transactionUuid=HDDT0000000000000000000000000001",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("getStatus: APPROVED without codeOfTax still maps to issued, codeOfTax null", async () => {
  // Template-2 (HĐ bán hàng từ MTT) reaches issued on exchangeStatus~APPROVED
  // even when the status lookup carries no codeOfTax. Issuance MUST NOT be
  // coupled to codeOfTax; codeOfTax surfaces as null in that case.
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input) => {
    if (String(input).endsWith("/auth/login")) {
      return new Response(
        JSON.stringify({ access_token: "test-token", expires_in: 3600 }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    return new Response(
      JSON.stringify({
        errorCode: null,
        description: null,
        result: [{ invoiceNo: "C26TYY309", exchangeStatus: "APPROVED" }],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;

  try {
    const provider = new ViettelSinvoiceProvider({
      username: "0100109106-509",
      password: "test-password",
      taxCode: "0100109106-509",
      templateCode: "2/001",
      invoiceSeries: "C22TYY",
      baseUrl: "https://example.test",
    });

    const status = await provider.getStatus(
      "HDDT0000000000000000000000000002",
    );

    assert.deepEqual(status, {
      status: "issued",
      invoiceNumber: "C26TYY309",
      codeOfTax: null,
      error: null,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("downloadInvoice: PDF from fileType=PDF + XML from the ZIP (errorCode 200 = success)", async () => {
  // getInvoiceRepresentationFile is a flat envelope and returns errorCode 200
  // on success; the PDF comes back directly (fileType=PDF) while the signed XML
  // ships only inside the ZIP (fileType=ZIP) for the MTT template.
  const originalFetch = globalThis.fetch;
  const pdfB64 = Buffer.from(strToU8("%PDF-1.4\n%mock\n")).toString("base64");
  const zipB64 = Buffer.from(
    zipSync({ "077200004194-INV1.xml": strToU8('<?xml version="1.0"?><I/>') }),
  ).toString("base64");

  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    if (url.endsWith("/auth/login")) {
      return new Response(
        JSON.stringify({ access_token: "t", expires_in: 3600 }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    if (
      url.includes("/InvoiceAPI/InvoiceUtilsWS/getInvoiceRepresentationFile")
    ) {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        fileType?: string;
      };
      const fileToBytes = body.fileType === "PDF" ? pdfB64 : zipB64;
      return new Response(
        JSON.stringify({
          errorCode: 200,
          description: null,
          fileName: `f.${(body.fileType ?? "").toLowerCase()}`,
          fileToBytes,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    return new Response("{}", { status: 200 });
  }) as typeof fetch;

  try {
    const provider = new ViettelSinvoiceProvider({
      username: "u",
      password: "p",
      taxCode: "077200004194",
      templateCode: "2/001",
      invoiceSeries: "C26MAA",
      baseUrl: "https://example.test",
    });
    const archive = await provider.downloadInvoice({
      providerRef: "HDDT0000000000000000000000000001",
      invoiceNumber: "C26MAA1",
    });
    assert.equal(archive.error, null);
    assert.ok(archive.pdf, "expected pdf artifact");
    assert.equal(
      Buffer.from(archive.pdf.bytes.slice(0, 4)).toString("utf8"),
      "%PDF",
    );
    assert.ok(archive.xml, "expected xml artifact");
    assert.ok(
      Buffer.from(archive.xml.bytes.slice(0, 5))
        .toString("utf8")
        .startsWith("<?xml"),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
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

test("deriveInvoiceTypeFromTemplate: throws on invalid shape (TT32 trước 2026)", () => {
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

const batchProviderConfig = {
  username: "0100109106-509",
  password: "test-password",
  taxCode: "0100109106-509",
  templateCode: "2/001",
  invoiceSeries: "C22TYY",
  baseUrl: "https://example.test",
} as const;

const batchRequest = (orderId: number) => ({
  orderId,
  orderNumber: `B-${orderId}`,
  sellerName: "Com Tam Ma Tu",
  sellerTaxCode: "0100109106-509",
  sellerAddress: "Sandbox",
  buyerName: "Khach le",
  items: [item("Com tam", 1, 100_000)],
  subtotal: 100_000,
  vatRate: 8,
  vatAmount: 0,
  totalAmount: 100_000,
});

const batchInputUuids = (init: NonNullable<Parameters<typeof fetch>[1]>) => {
  const parsed = JSON.parse(String(init.body ?? "{}")) as {
    commonInvoiceInputs?: Array<{
      generalInvoiceInfo?: { transactionUuid?: string };
    }>;
  };
  return (parsed.commonInvoiceInputs ?? []).map(
    (b) => b.generalInvoiceInfo?.transactionUuid ?? "",
  );
};

test("createBatchInvoice: wraps commonInvoiceInputs and maps outputs by transactionUuid", async () => {
  const originalFetch = globalThis.fetch;
  let inputsLen = -1;

  globalThis.fetch = (async (input, init) => {
    if (String(input).endsWith("/auth/login")) {
      return new Response(
        JSON.stringify({ access_token: "test-token", expires_in: 3600 }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    if (String(input).includes("/createBatchInvoice/")) {
      const uuids = batchInputUuids(init ?? {});
      inputsLen = uuids.length;
      return new Response(
        JSON.stringify({
          // returned out of order to prove uuid mapping (not positional)
          createInvoiceOutputs: [
            {
              transactionUuid: uuids[1],
              errorCode: 200,
              result: { invoiceNo: "K2" },
            },
            {
              transactionUuid: uuids[0],
              errorCode: 200,
              result: { invoiceNo: "K1", codeOfTax: "MA-CQT-1" },
            },
          ],
          lstMapError: [],
          totalSuccess: 2,
          totalFail: 0,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    return new Response("{}", { status: 200 });
  }) as typeof fetch;

  try {
    const provider = new ViettelSinvoiceProvider(batchProviderConfig);
    const results = await provider.createBatchInvoice([
      batchRequest(1),
      batchRequest(2),
    ]);

    assert.equal(inputsLen, 2, "request must wrap both in commonInvoiceInputs");
    assert.equal(results.length, 2);

    // order 1: codeOfTax present → issued (MTT got CQT code back)
    assert.equal(results[0]?.transactionUuid, buildSinvoiceTransactionUuid(1));
    assert.equal(results[0]?.status, "issued");
    assert.equal(results[0]?.invoiceNumber, "K1");
    assert.equal(results[0]?.codeOfTax, "MA-CQT-1");

    // order 2: no codeOfTax → submitted (awaiting CQT)
    assert.equal(results[1]?.transactionUuid, buildSinvoiceTransactionUuid(2));
    assert.equal(results[1]?.status, "submitted");
    assert.equal(results[1]?.invoiceNumber, "K2");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("createBatchInvoice: marks an item failed without failing the whole batch", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input, init) => {
    if (String(input).endsWith("/auth/login")) {
      return new Response(
        JSON.stringify({ access_token: "test-token", expires_in: 3600 }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    if (String(input).includes("/createBatchInvoice/")) {
      const uuids = batchInputUuids(init ?? {});
      // only the first invoice succeeds; second is reported in lstMapError
      return new Response(
        JSON.stringify({
          createInvoiceOutputs: [
            {
              transactionUuid: uuids[0],
              errorCode: 200,
              result: { invoiceNo: "K1" },
            },
          ],
          lstMapError: [
            {
              msg: "Tên hàng hóa bắt buộc nhập",
              errorCode: "INVOICE_VALID_INPUT_REQUIRED_ITEMNAME_ITEM",
            },
          ],
          totalSuccess: 1,
          totalFail: 1,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    return new Response("{}", { status: 200 });
  }) as typeof fetch;

  try {
    const provider = new ViettelSinvoiceProvider(batchProviderConfig);
    const results = await provider.createBatchInvoice([
      batchRequest(1),
      batchRequest(2),
    ]);

    assert.equal(results.length, 2);
    assert.equal(results[0]?.status, "submitted");
    assert.equal(results[0]?.invoiceNumber, "K1");
    assert.equal(results[1]?.status, "failed");
    assert.equal(results[1]?.invoiceNumber, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("createBatchInvoice: splits requests into chunks of 50", async () => {
  const originalFetch = globalThis.fetch;
  const chunkSizes: number[] = [];

  globalThis.fetch = (async (input, init) => {
    if (String(input).endsWith("/auth/login")) {
      return new Response(
        JSON.stringify({ access_token: "test-token", expires_in: 3600 }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    if (String(input).includes("/createBatchInvoice/")) {
      const uuids = batchInputUuids(init ?? {});
      chunkSizes.push(uuids.length);
      return new Response(
        JSON.stringify({
          createInvoiceOutputs: uuids.map((u, i) => ({
            transactionUuid: u,
            errorCode: 200,
            result: { invoiceNo: `K${i}` },
          })),
          lstMapError: [],
          totalSuccess: uuids.length,
          totalFail: 0,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    return new Response("{}", { status: 200 });
  }) as typeof fetch;

  try {
    const provider = new ViettelSinvoiceProvider(batchProviderConfig);
    const requests = Array.from({ length: 120 }, (_, i) => batchRequest(i + 1));
    const results = await provider.createBatchInvoice(requests);

    assert.equal(results.length, 120);
    assert.deepEqual(chunkSizes, [50, 50, 20]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
