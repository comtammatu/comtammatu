import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { MoMoGateway, type MoMoIpnPayload } from "../lib/momo";

const config = {
  partnerCode: "PARTNER",
  accessKey: "ACCESS",
  secretKey: "SECRET",
  appUrl: "https://preview.example.com",
  redirectUrl: "https://preview.example.com/payment-result",
  sandbox: true,
};

test("MoMo create keeps the exact provider deeplink and deterministic IDs", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_url, init) => {
    const request = JSON.parse(String(init?.body)) as Record<string, unknown>;
    assert.equal(request.requestId, "request-1");
    assert.equal(request.orderId, "MOMO-1-42-request1");
    return new Response(
      JSON.stringify({
        resultCode: 0,
        orderId: request.orderId,
        requestId: request.requestId,
        deeplink: "momo://provider-returned/deeplink",
        payUrl: "https://test-payment.momo.vn/pay/1",
      }),
      { status: 200 },
    );
  }) as typeof fetch;
  try {
    const result = await new MoMoGateway(config).createPayment({
      tenantId: 1,
      orderId: 42,
      orderNumber: "PH-42",
      amount: 100_000,
      requestId: "request-1",
      providerOrderId: "MOMO-1-42-request1",
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(
        result.providerData.deeplink,
        "momo://provider-returned/deeplink",
      );
      assert.equal(
        result.providerData.payUrl,
        "https://test-payment.momo.vn/pay/1",
      );
      assert.equal("qrCodeUrl" in result.providerData, false);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("MoMo query validates the exact merchant order and amount", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_url, init) => {
    const request = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(
      JSON.stringify({
        partnerCode: "PARTNER",
        requestId: request.requestId,
        orderId: request.orderId,
        amount: 100_000,
        resultCode: 0,
        transId: 123,
        message: "Successful.",
        payType: "qr",
        responseTime: 1,
        paymentOption: "momo",
      }),
      { status: 200 },
    );
  }) as typeof fetch;
  try {
    const result = await new MoMoGateway(config).queryPayment({
      requestId: "query-1",
      providerOrderId: "MOMO-1-42-request1",
      amount: 100_000,
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.providerData.resultCode, 0);
      assert.equal(result.providerData.momoOrderId, "MOMO-1-42-request1");
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("MoMo IPN rejects a changed signed amount", () => {
  const payload: MoMoIpnPayload = {
    partnerCode: "PARTNER",
    orderId: "MOMO-1-42-request1",
    requestId: "request-1",
    amount: 100_000,
    orderInfo: "Thanh toan don hang PH-42",
    orderType: "momo_wallet",
    transId: 123,
    resultCode: 0,
    message: "Successful.",
    payType: "qr",
    responseTime: 1,
    extraData: "e30=",
    signature: "",
  };
  const raw = [
    "accessKey=ACCESS",
    `amount=${payload.amount}`,
    `extraData=${payload.extraData}`,
    `message=${payload.message}`,
    `orderId=${payload.orderId}`,
    `orderInfo=${payload.orderInfo}`,
    `orderType=${payload.orderType}`,
    `partnerCode=${payload.partnerCode}`,
    `payType=${payload.payType}`,
    `requestId=${payload.requestId}`,
    `responseTime=${payload.responseTime}`,
    `resultCode=${payload.resultCode}`,
    `transId=${payload.transId}`,
  ].join("&");
  payload.signature = createHmac("sha256", "SECRET").update(raw).digest("hex");

  const gateway = new MoMoGateway(config);
  assert.equal(gateway.verifyIpn(payload), true);
  assert.equal(gateway.verifyIpn({ ...payload, amount: 99_000 }), false);
});
