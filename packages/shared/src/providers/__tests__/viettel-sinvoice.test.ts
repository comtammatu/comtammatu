import assert from "node:assert/strict";
import { test } from "node:test";
import type { InvoiceLineItem } from "../invoice";
import {
  buildSinvoiceItemInfo,
  buildSinvoiceTransactionUuid,
  deriveInvoiceTypeFromTemplate,
  ViettelSinvoiceProvider,
} from "../impl/viettel-sinvoice";

const item = (name: string, qty: number, amount: number): InvoiceLineItem => ({
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
  assert.equal(
    result.totalGross,
    result.sumLineAfterDiscount + result.sumLineTax,
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
        taxPercentage: -2,
        taxAmount: 0,
      },
      {
        unitPrice: 47_000,
        quantity: 1,
        amount: 47_000,
        amountWithTax: 47_000,
        taxPercentage: -2,
        taxAmount: 0,
      },
      {
        unitPrice: 40_000,
        quantity: 2,
        amount: 80_000,
        amountWithTax: 80_000,
        taxPercentage: -2,
        taxAmount: 0,
      },
      {
        unitPrice: 5_000,
        quantity: 1,
        amount: 5_000,
        amountWithTax: 5_000,
        taxPercentage: -2,
        taxAmount: 0,
      },
    ],
  );
});

test("line discounts reduce VAT-deductible tax base", () => {
  const result = buildSinvoiceItemInfo(
    [{ ...item("Cơm tấm", 2, 216_000), discountAmount: 21_600 }],
    8,
    true,
  );

  assertValidators(result, 8);
  const [line] = result.itemInfo;
  assert.ok(line);
  assert.equal(line.itemTotalAmountWithoutTax, 200_000);
  assert.equal(line.itemDiscount, 20_000);
  assert.equal(line.discount, 20_000);
  assert.equal(line.itemTotalAmountAfterDiscount, 180_000);
  assert.equal(line.taxAmount, 14_400);
  assert.equal(result.sumLineDiscount, 20_000);
  assert.equal(result.totalGross, 194_400);
});

test("line discounts reduce direct-sales invoice totals", () => {
  const result = buildSinvoiceItemInfo(
    [{ ...item("Cơm tấm", 2, 200_000), discountAmount: 20_000 }],
    8,
    true,
    "direct_sales_gross",
  );

  const [line] = result.itemInfo;
  assert.ok(line);
  assert.equal(line.itemTotalAmountWithoutTax, 200_000);
  assert.equal(line.itemDiscount, 20_000);
  assert.equal(line.discount, 20_000);
  assert.equal(line.itemTotalAmountAfterDiscount, 180_000);
  assert.equal(line.itemTotalAmountWithTax, 180_000);
  assert.equal(line.taxPercentage, -2);
  assert.equal(result.sumLineNet, 200_000);
  assert.equal(result.sumLineDiscount, 20_000);
  assert.equal(result.sumLineAfterDiscount, 180_000);
  assert.equal(result.totalGross, 180_000);
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

    assert.equal(body.buyerInfo.buyerName, "Người mua không lấy hóa đơn");
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
    assert.equal(line.taxPercentage, -2);
    assert.equal(line.taxAmount, 0);
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

test("createInvoice: sends line discounts to direct-sales Sinvoice payload", async () => {
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

    return new Response(JSON.stringify({ result: { invoiceNo: "SBOX-3" } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
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

    await provider.createInvoice({
      orderId: 3,
      orderNumber: "SBOX-3",
      sellerName: "Com Tam Ma Tu",
      sellerTaxCode: "0100109106-509",
      sellerAddress: "Sandbox",
      buyerName: "Người mua không lấy hóa đơn",
      buyerNotGetInvoice: true,
      items: [
        { ...item("Com tam discount", 2, 200_000), discountAmount: 20_000 },
      ],
      subtotal: 180_000,
      vatRate: 8,
      vatAmount: 0,
      totalAmount: 180_000,
    });

    const createCall = calls.find((call) =>
      String(call.input).includes("/InvoiceAPI/InvoiceWS/createInvoice/"),
    );
    assert.ok(createCall, "expected createInvoice endpoint to be called");

    const body = JSON.parse(String(createCall.init.body)) as {
      itemInfo?: Array<{
        discount?: number;
        itemDiscount?: number;
        itemTotalAmountAfterDiscount?: number;
        itemTotalAmountWithTax?: number;
      }>;
      summarizeInfo?: {
        totalAmountAfterDiscount?: number;
        totalAmountWithoutTax?: number;
        totalAmountWithTax?: number;
        discountAmount?: number;
      };
      taxBreakdowns?: Array<{ taxableAmount?: number; taxAmount?: number }>;
    };

    const [line] = body.itemInfo ?? [];
    assert.ok(line);
    assert.equal(line.discount, 20_000);
    assert.equal(line.itemDiscount, 20_000);
    assert.equal(line.itemTotalAmountAfterDiscount, 180_000);
    assert.equal(line.itemTotalAmountWithTax, 180_000);
    assert.equal(body.summarizeInfo?.discountAmount, 20_000);
    assert.equal(body.summarizeInfo?.totalAmountAfterDiscount, 180_000);
    assert.equal(body.summarizeInfo?.totalAmountWithoutTax, 180_000);
    assert.equal(body.summarizeInfo?.totalAmountWithTax, 180_000);
    assert.equal(body.taxBreakdowns?.[0]?.taxableAmount, 180_000);
    assert.equal(body.taxBreakdowns?.[0]?.taxAmount, 0);
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
      buyerName: "Người mua không lấy hóa đơn",
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
