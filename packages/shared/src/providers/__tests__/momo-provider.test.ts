import assert from "node:assert/strict";
import { test } from "node:test";
import { MoMoProvider, createMoMoProviderFromEnv } from "../impl/momo";

test("createMoMoProviderFromEnv registers with core MoMo credentials only", () => {
  const provider = createMoMoProviderFromEnv({
    MOMO_PARTNER_CODE: "MOMO_TEST_PARTNER",
    MOMO_ACCESS_KEY: "MOMO_TEST_ACCESS",
    MOMO_SECRET_KEY: "MOMO_TEST_SECRET",
  });

  assert.equal(provider?.method, "momo");
});

test("createMoMoProviderFromEnv skips MoMo when a core credential is missing", () => {
  const provider = createMoMoProviderFromEnv({
    MOMO_PARTNER_CODE: "MOMO_TEST_PARTNER",
    MOMO_ACCESS_KEY: "MOMO_TEST_ACCESS",
  });

  assert.equal(provider, null);
});

const PROVIDER_CONFIG = {
  partnerCode: "MOMO_TEST_PARTNER_1234",
  accessKey: "MOMO_TEST_ACCESS",
  secretKey: "MOMO_TEST_SECRET",
  sandbox: true,
};

const REQUEST = {
  tenantId: 1,
  orderId: 42,
  orderNumber: "TC-000001",
  amount: 100_000,
};

async function withMomoEnv<T>(fn: () => Promise<T>): Promise<T> {
  const prev = {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    MOMO_ALLOW_LOCALHOST: process.env.MOMO_ALLOW_LOCALHOST,
    MOMO_SANDBOX: process.env.MOMO_SANDBOX,
  };
  process.env.NEXT_PUBLIC_APP_URL = "https://pos-test.example.com";
  process.env.MOMO_SANDBOX = "true";
  delete process.env.MOMO_ALLOW_LOCALHOST;
  try {
    return await fn();
  } finally {
    if (prev.NEXT_PUBLIC_APP_URL === undefined)
      delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = prev.NEXT_PUBLIC_APP_URL;
    if (prev.MOMO_ALLOW_LOCALHOST === undefined)
      delete process.env.MOMO_ALLOW_LOCALHOST;
    else process.env.MOMO_ALLOW_LOCALHOST = prev.MOMO_ALLOW_LOCALHOST;
    if (prev.MOMO_SANDBOX === undefined) delete process.env.MOMO_SANDBOX;
    else process.env.MOMO_SANDBOX = prev.MOMO_SANDBOX;
  }
}

type MoMoCreateRequest = { requestId: string; orderId: string };

function mockFetchOnce(
  responseBody:
    | Record<string, unknown>
    | ((request: MoMoCreateRequest) => Record<string, unknown>),
): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = (async (_input, init) => {
    const request = JSON.parse(String(init?.body)) as MoMoCreateRequest;
    const body =
      typeof responseBody === "function"
        ? responseBody(request)
        : responseBody;
    return {
      json: async () => body,
    } as unknown as Response;
  }) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

function getProviderData(
  result: Awaited<ReturnType<MoMoProvider["createPayment"]>>,
): Record<string, unknown> {
  return (result.providerData ?? {}) as Record<string, unknown>;
}

test("createPayment: uses qrCodeUrl when present (happy path)", async () => {
  await withMomoEnv(async () => {
    const restore = mockFetchOnce((request) => ({
      resultCode: 0,
      message: "Successful.",
      qrCodeUrl: "00020101021238_NATIVE_MOMO_QR",
      payUrl: "https://test-payment.momo.vn/v2/gateway/pay/abc",
      orderId: request.orderId,
      requestId: request.requestId,
    }));
    try {
      const provider = new MoMoProvider(PROVIDER_CONFIG);
      const result = await provider.createPayment(REQUEST);
      assert.equal(result.status, "pending");
      assert.equal(result.qrData, "00020101021238_NATIVE_MOMO_QR");
      const data = getProviderData(result);
      assert.equal(data.qrSource, "qrCodeUrl");
      assert.equal(data.qrCodeUrl, "00020101021238_NATIVE_MOMO_QR");
      assert.equal(
        data.payUrl,
        "https://test-payment.momo.vn/v2/gateway/pay/abc",
      );
    } finally {
      restore();
    }
  });
});

test("createPayment: rejects an unbound MoMo create response", async () => {
  await withMomoEnv(async () => {
    const restore = mockFetchOnce((request) => ({
      resultCode: 0,
      message: "Successful.",
      qrCodeUrl: "00020101021238_WRONG_TRANSACTION",
      orderId: `${request.orderId}-other`,
      requestId: `${request.requestId}-other`,
    }));
    try {
      const provider = new MoMoProvider(PROVIDER_CONFIG);
      const result = await provider.createPayment(REQUEST);
      assert.equal(result.status, "failed");
      assert.equal(result.qrData, undefined);
      const data = getProviderData(result);
      assert.equal(data.orderIdMatched, false);
      assert.equal(data.requestIdMatched, false);
      assert.match(String(data.message), /identifiers do not match/);
    } finally {
      restore();
    }
  });
});

test("createPayment: concurrent requests use distinct webhook idempotency keys", async () => {
  await withMomoEnv(async () => {
    const original = globalThis.fetch;
    const requestIds: string[] = [];
    globalThis.fetch = (async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as {
        requestId: string;
        orderId: string;
      };
      requestIds.push(body.requestId);
      return {
        json: async () => ({
          resultCode: 0,
          message: "Successful.",
          qrCodeUrl: `QR-${body.orderId}`,
          orderId: body.orderId,
          requestId: body.requestId,
        }),
      } as Response;
    }) as typeof fetch;

    try {
      const provider = new MoMoProvider(PROVIDER_CONFIG);
      await Promise.all([
        provider.createPayment(REQUEST),
        provider.createPayment(REQUEST),
      ]);
      assert.equal(requestIds.length, 2);
      assert.notEqual(requestIds[0], requestIds[1]);
    } finally {
      globalThis.fetch = original;
    }
  });
});

test("createPayment: fails when qrCodeUrl is absent even if deeplink is returned", async () => {
  await withMomoEnv(async () => {
    const restore = mockFetchOnce((request) => ({
      resultCode: 0,
      message: "Successful.",
      payUrl: "https://test-payment.momo.vn/v2/gateway/pay/xyz",
      deeplink: "momo://app/payment/xyz",
      orderId: request.orderId,
      requestId: request.requestId,
    }));
    try {
      const provider = new MoMoProvider(PROVIDER_CONFIG);
      const result = await provider.createPayment(REQUEST);
      assert.equal(result.status, "failed");
      const data = getProviderData(result);
      assert.equal(data.qrCodeUrlReturned, false);
      assert.equal(data.deeplinkReturned, true);
      assert.equal(data.payUrlReturned, true);
      assert.match(String(data.message), /qrCodeUrl/);
    } finally {
      restore();
    }
  });
});

test("createPayment: fails when only payUrl is returned", async () => {
  await withMomoEnv(async () => {
    const restore = mockFetchOnce((request) => ({
      resultCode: 0,
      message: "Successful.",
      payUrl: "https://test-payment.momo.vn/v2/gateway/pay/xyz",
      orderId: request.orderId,
      requestId: request.requestId,
    }));
    try {
      const provider = new MoMoProvider(PROVIDER_CONFIG);
      const result = await provider.createPayment(REQUEST);
      assert.equal(result.status, "failed");
      const data = getProviderData(result);
      assert.equal(data.qrCodeUrlReturned, false);
      assert.equal(data.deeplinkReturned, false);
      assert.equal(data.payUrlReturned, true);
      assert.match(String(data.message), /qrCodeUrl/);
    } finally {
      restore();
    }
  });
});

test("createPayment: prefers qrCodeUrl over payUrl when both present", async () => {
  await withMomoEnv(async () => {
    const restore = mockFetchOnce((request) => ({
      resultCode: 0,
      message: "Successful.",
      qrCodeUrl: "00020101021238_NATIVE",
      payUrl: "https://test-payment.momo.vn/v2/gateway/pay/abc",
      orderId: request.orderId,
      requestId: request.requestId,
    }));
    try {
      const provider = new MoMoProvider(PROVIDER_CONFIG);
      const result = await provider.createPayment(REQUEST);
      assert.equal(result.qrData, "00020101021238_NATIVE");
      assert.equal(getProviderData(result).qrSource, "qrCodeUrl");
    } finally {
      restore();
    }
  });
});

test("createPayment: fails when qrCodeUrl, deeplink, and payUrl all missing", async () => {
  await withMomoEnv(async () => {
    const restore = mockFetchOnce((request) => ({
      resultCode: 0,
      message: "Successful.",
      orderId: request.orderId,
      requestId: request.requestId,
    }));
    try {
      const provider = new MoMoProvider(PROVIDER_CONFIG);
      const result = await provider.createPayment(REQUEST);
      assert.equal(result.status, "failed");
      const data = getProviderData(result);
      assert.equal(data.qrCodeUrlReturned, false);
      assert.equal(data.deeplinkReturned, false);
      assert.equal(data.payUrlReturned, false);
      assert.match(String(data.message), /qrCodeUrl/);
    } finally {
      restore();
    }
  });
});

test("createPayment: fails when MoMo returns non-zero resultCode (regression)", async () => {
  await withMomoEnv(async () => {
    const restore = mockFetchOnce({
      resultCode: 11,
      message: "Access denied",
      payUrl: "https://test-payment.momo.vn/v2/gateway/pay/abc",
      qrCodeUrl: "00020101021238_NATIVE",
      orderId: "MOMO-42-deadbeef",
    });
    try {
      const provider = new MoMoProvider(PROVIDER_CONFIG);
      const result = await provider.createPayment(REQUEST);
      assert.equal(result.status, "failed");
      const data = getProviderData(result);
      assert.equal(data.resultCode, 11);
      assert.equal(data.message, "Access denied");
    } finally {
      restore();
    }
  });
});
