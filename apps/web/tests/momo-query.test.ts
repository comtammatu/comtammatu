import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MOMO_QUERY_TIMEOUT_MS,
  MomoQueryError,
  buildMomoQuerySignatureSource,
  classifyMomoQueryResultCode,
  parseMomoQueryResponse,
  queryMomoTransaction,
  signMomoQueryRequest,
  type MomoQueryConfig,
} from "../lib/payments/momo-query";

const config: MomoQueryConfig = {
  partnerCode: "MOMO",
  accessKey: "access-key",
  secretKey: "secret-key",
  baseUrl: "https://test-payment.momo.vn",
};

const input = {
  orderId: "ORDER-123",
  requestId: "QUERY-456",
  expectedAmount: 125_000,
};

function queryResponse(overrides: Record<string, unknown> = {}) {
  return {
    partnerCode: config.partnerCode,
    requestId: input.requestId,
    orderId: input.orderId,
    extraData: "",
    amount: input.expectedAmount,
    transId: 4_032_041_704_001,
    payType: "qr",
    resultCode: 0,
    refundTrans: [],
    message: "Successful.",
    responseTime: 1_760_000_000_000,
    paymentOption: "momo",
    promotionInfo: null,
    ...overrides,
  };
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("MoMo query signature source follows the provider field order", () => {
  const signatureInput = {
    orderId: input.orderId,
    partnerCode: config.partnerCode,
    requestId: input.requestId,
  };
  assert.equal(
    buildMomoQuerySignatureSource(signatureInput, config.accessKey),
    "accessKey=access-key&orderId=ORDER-123&partnerCode=MOMO&requestId=QUERY-456",
  );
  assert.equal(
    signMomoQueryRequest(signatureInput, config.accessKey, config.secretKey),
    "ebc7a2dcb50347d828f4d8e99257d22e1a3cfd58b1675e50d3d16f47cf1dc279",
  );
});

test("MoMo query sends the signed request with the documented minimum timeout", async () => {
  let requestedUrl = "";
  let requestedInit: RequestInit | undefined;
  const fetchImpl: typeof fetch = async (url, init) => {
    requestedUrl = String(url);
    requestedInit = init;
    return jsonResponse(queryResponse());
  };

  const result = await queryMomoTransaction(input, config, fetchImpl);

  assert.equal(result.disposition, "success");
  assert.equal(
    requestedUrl,
    "https://test-payment.momo.vn/v2/gateway/api/query",
  );
  assert.equal(requestedInit?.method, "POST");
  assert.ok(requestedInit?.signal);
  assert.equal(MOMO_QUERY_TIMEOUT_MS, 30_000);
  assert.deepEqual(JSON.parse(String(requestedInit?.body)), {
    orderId: input.orderId,
    requestId: input.requestId,
    partnerCode: config.partnerCode,
    lang: "vi",
    signature:
      "ebc7a2dcb50347d828f4d8e99257d22e1a3cfd58b1675e50d3d16f47cf1dc279",
  });
});

test("MoMo query validates required fields and tolerates provider-added fields", () => {
  assert.ok(parseMomoQueryResponse(queryResponse()));
  assert.ok(
    parseMomoQueryResponse(
      queryResponse({
        lastUpdated: 1_684_743_466_951,
        payType: "pos",
        promotionInfo: "",
      }),
    ),
  );
  assert.equal(
    parseMomoQueryResponse(queryResponse({ amount: "125000" })),
    null,
  );
  assert.ok(parseMomoQueryResponse(queryResponse({ unexpected: true })));
  const { partnerCode: _partnerCode, ...missingPartner } = queryResponse();
  assert.equal(parseMomoQueryResponse(missingPartner), null);
  assert.equal(
    parseMomoQueryResponse(queryResponse({ promotionInfo: [{}] })),
    null,
  );
});

test("MoMo query classifies success, final failure, and unresolved states", () => {
  for (const code of [0, 9000]) {
    assert.equal(classifyMomoQueryResultCode(code), "success");
  }
  for (const code of [98, 99, 1001, 1003, 4100]) {
    assert.equal(classifyMomoQueryResultCode(code), "final_failure");
  }
  for (const code of [10, 42, 43, 1000, 7000, 7002, 9999]) {
    assert.equal(classifyMomoQueryResultCode(code), "pending");
  }
});

test("MoMo query keeps provider timeout distinct from payment status", async () => {
  const fetchImpl: typeof fetch = async () => {
    throw new DOMException("timed out", "TimeoutError");
  };

  assert.deepEqual(await queryMomoTransaction(input, config, fetchImpl), {
    disposition: "transport_timeout",
  });
});

test("MoMo query refuses mismatched identity or amount on success", async () => {
  for (const response of [
    queryResponse({ orderId: "OTHER-ORDER" }),
    queryResponse({ requestId: "OTHER-REQUEST" }),
    queryResponse({ partnerCode: "OTHER-PARTNER" }),
    queryResponse({ amount: input.expectedAmount + 1 }),
    queryResponse({ transId: 0 }),
  ]) {
    await assert.rejects(
      queryMomoTransaction(input, config, async () => jsonResponse(response)),
      (error: unknown) =>
        error instanceof MomoQueryError &&
        error.code === "momo_query_response_invalid",
    );
  }
});

test("MoMo query does not classify non-2xx or malformed payloads as payment results", async () => {
  await assert.rejects(
    queryMomoTransaction(input, config, async () =>
      jsonResponse(queryResponse(), 503),
    ),
    (error: unknown) =>
      error instanceof MomoQueryError &&
      error.code === "momo_query_http_failed",
  );
  await assert.rejects(
    queryMomoTransaction(input, config, async () =>
      jsonResponse({ resultCode: 0 }),
    ),
    (error: unknown) =>
      error instanceof MomoQueryError &&
      error.code === "momo_query_response_invalid",
  );
});
