import assert from "node:assert/strict";
import { test } from "node:test";
import type { InvoiceLineItem, InvoiceRequest } from "../invoice";
import {
  buildSinvoiceItemInfo,
  buildSinvoiceTransactionUuid,
  deriveInvoiceTypeFromTemplate,
  ViettelSinvoiceProvider,
} from "../impl/viettel-sinvoice";

function item(
  name: string,
  quantity: number,
  amount: number,
  vatRate: 0 | 5 | 8 | 10,
  discountAmount = 0,
): InvoiceLineItem {
  return {
    name,
    unit: "Phần",
    quantity,
    unitPrice: amount / quantity,
    amount,
    vatRate,
    ...(discountAmount > 0 ? { discountAmount } : {}),
  };
}

function request(items: InvoiceLineItem[]): InvoiceRequest {
  const math = buildSinvoiceItemInfo(items);
  return {
    orderId: 42,
    orderNumber: "ORD-42",
    sellerName: "Công ty Cổ phần Chén Sứ",
    sellerTaxCode: "0312345678",
    sellerAddress: "Thành phố Hồ Chí Minh",
    buyerNotGetInvoice: true,
    items,
    subtotal: math.sumLineNet - math.sumLineDiscount,
    vatAmount: math.sumLineTax,
    totalAmount: math.totalGross,
  };
}

function provider(): ViettelSinvoiceProvider {
  return new ViettelSinvoiceProvider({
    username: "user",
    password: "secret",
    taxCode: "0312345678",
    templateCode: "1/001",
    invoiceSeries: "C26TCS",
    baseUrl: "https://example.test",
  });
}

test("template and transaction identity are fail-closed", () => {
  assert.equal(deriveInvoiceTypeFromTemplate("1/001"), "1");
  assert.throws(() => deriveInvoiceTypeFromTemplate("2/001"));
  assert.equal(buildSinvoiceTransactionUuid(42).length, 32);
  assert.notEqual(
    buildSinvoiceTransactionUuid(42),
    buildSinvoiceTransactionUuid(43),
  );
});

test("mixed VAT and VAT 0 are computed per line", () => {
  const result = buildSinvoiceItemInfo([
    item("Khuyến mãi", 1, 10_000, 0),
    item("Món ăn", 1, 108_000, 8),
    item("Đồ uống", 1, 110_000, 10),
  ]);

  assert.deepEqual(
    result.itemInfo.map((line) => line.taxPercentage),
    [0, 8, 10],
  );
  assert.equal(result.sumLineTax, 18_000);
  assert.equal(result.totalGross, 228_000);
});

test("gross discount is allocated into net and VAT totals", () => {
  const result = buildSinvoiceItemInfo([item("Món ăn", 1, 108_000, 8, 10_800)]);
  assert.equal(result.sumLineNet, 100_000);
  assert.equal(result.sumLineDiscount, 10_000);
  assert.equal(result.sumLineTax, 7_200);
  assert.equal(result.totalGross, 97_200);
});

test("missing or unsupported line VAT fails", () => {
  assert.throws(() =>
    buildSinvoiceItemInfo([
      {
        ...item("Sai", 1, 10_000, 0),
        vatRate: undefined,
      } as unknown as InvoiceLineItem,
    ]),
  );
  assert.throws(() =>
    buildSinvoiceItemInfo([
      {
        ...item("Sai", 1, 10_000, 0),
        vatRate: 7,
      } as unknown as InvoiceLineItem,
    ]),
  );
});

test("total mismatch and seller mismatch make zero provider POSTs", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response();
  }) as typeof fetch;
  try {
    const mismatch = request([item("Món", 1, 108_000, 8)]);
    mismatch.totalAmount += 1;
    const totalResult = await provider().createInvoice(mismatch);
    assert.equal(totalResult.status, "failed");
    assert.equal(totalResult.providerData?.["errorCode"], "validation");

    const sellerMismatch = request([item("Món", 1, 108_000, 8)]);
    sellerMismatch.sellerTaxCode = "0399999999";
    const sellerResult = await provider().createInvoice(sellerMismatch);
    assert.equal(sellerResult.status, "failed");
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("valid request uses snapshotted profile and reconciled totals", async () => {
  const originalFetch = globalThis.fetch;
  const bodies: unknown[] = [];
  globalThis.fetch = (async (input, init) => {
    if (String(input).endsWith("/auth/login")) {
      return Response.json({ access_token: "token", expires_in: 3600 });
    }
    bodies.push(JSON.parse(String(init?.body)));
    return Response.json({
      result: { invoiceNo: "00000001", codeOfTax: "CQT-1" },
    });
  }) as typeof fetch;
  try {
    const result = await provider().createInvoice(
      request([item("Món ăn", 1, 108_000, 8), item("Đồ uống", 1, 110_000, 10)]),
    );
    assert.equal(result.status, "issued");
    const body = bodies[0] as {
      generalInvoiceInfo: Record<string, unknown>;
      summarizeInfo: Record<string, unknown>;
      taxBreakdowns: Array<Record<string, unknown>>;
    };
    assert.equal(body.generalInvoiceInfo["invoiceType"], "1");
    assert.equal(body.generalInvoiceInfo["templateCode"], "1/001");
    assert.equal(body.generalInvoiceInfo["invoiceSeries"], "C26TCS");
    assert.equal(body.summarizeInfo["totalAmountWithTax"], 218_000);
    assert.deepEqual(
      body.taxBreakdowns.map((line) => line["taxPercentage"]),
      [8, 10],
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("replacement keeps template-1 original references", async () => {
  const originalFetch = globalThis.fetch;
  let body: { generalInvoiceInfo: Record<string, unknown> } | undefined;
  globalThis.fetch = (async (input, init) => {
    if (String(input).endsWith("/auth/login")) {
      return Response.json({ access_token: "token", expires_in: 3600 });
    }
    body = JSON.parse(String(init?.body)) as typeof body;
    return Response.json({ result: { invoiceNo: "00000002" } });
  }) as typeof fetch;
  try {
    const replacement = request([item("Món", 1, 108_000, 8)]);
    replacement.replacement = {
      originalInvoiceNumber: "00000001",
      originalIssuedAt: "2026-07-27T08:00:00.000Z",
      originalInvoiceType: "1",
      originalTemplateCode: "1",
      reason: "Điều chỉnh thông tin người mua",
      agreementRef: "BB-01",
      agreementDate: "2026-07-27T09:00:00.000Z",
    };
    await provider().createInvoice(replacement);
    assert.equal(body?.generalInvoiceInfo["adjustmentType"], "3");
    assert.equal(body?.generalInvoiceInfo["originalInvoiceType"], "1");
    assert.equal(body?.generalInvoiceInfo["originalTemplateCode"], "1");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("timeout, throttling and server errors are unknown outcomes", async () => {
  const originalFetch = globalThis.fetch;
  for (const status of [408, 429, 500]) {
    let login = true;
    globalThis.fetch = (async () => {
      if (login) {
        login = false;
        return Response.json({ access_token: "token", expires_in: 3600 });
      }
      return Response.json({ description: "uncertain" }, { status });
    }) as typeof fetch;
    const result = await provider().createInvoice(
      request([item("Món", 1, 108_000, 8)]),
    );
    assert.equal(result.status, "failed");
    assert.equal(result.providerData?.["outcomeUnknown"], true);
  }
  globalThis.fetch = originalFetch;
});
