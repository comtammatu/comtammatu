import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MomoQueryError,
  type MomoQueryResponse,
} from "../lib/payments/momo-query";
import {
  MOMO_RECONCILIATION_BATCH_LIMIT,
  MomoReconciliationBatchError,
  MomoReconciliationRequestError,
  runClaimedMomoReconciliationBatch,
  runSelfOrderMomoReconciliation,
  type MomoReconciliationRpcClient,
} from "../lib/payments/momo-reconcile-core";

const claimId = "10000000-0000-4000-8000-000000000000";
const queriedAt = "2026-07-13T08:00:00.000Z";

type RpcCall = { name: string; args: Record<string, unknown> };

function claimedRequest(overrides: Record<string, unknown> = {}) {
  return {
    tenant_id: 1,
    payment_id: 21,
    payment_request_id: 31,
    provider_ref: "MOMO-ORDER-1",
    amount: 125_000,
    ...overrides,
  };
}

function queryResponse(
  requestId: string,
  overrides: Partial<MomoQueryResponse> = {},
): MomoQueryResponse {
  return {
    partnerCode: "MOMO",
    requestId,
    orderId: "MOMO-ORDER-1",
    extraData: "",
    amount: 125_000,
    transId: 4_032_041_704_001,
    payType: "qr",
    resultCode: 0,
    refundTrans: [],
    message: "Successful.",
    responseTime: 1_760_000_000_000,
    ...overrides,
  };
}

function createRpc(input: {
  claims?: unknown;
  settlement?: (name: string) => {
    data: unknown;
    error: { code?: string | null } | null;
  };
  release?: () => {
    data: unknown;
    error: { code?: string | null } | null;
  };
}) {
  const calls: RpcCall[] = [];
  const rpc: MomoReconciliationRpcClient = {
    async rpc(name, args) {
      calls.push({ name, args });
      if (name === "claim_momo_reconciliation_batch") {
        return { data: input.claims ?? [claimedRequest()], error: null };
      }
      if (name === "release_momo_reconciliation_claim") {
        return (
          input.release?.() ?? {
            data: { status: "released" },
            error: null,
          }
        );
      }
      return (
        input.settlement?.(name) ?? {
          data: {
            status: name === "confirm_momo_payment" ? "completed" : "failed",
          },
          error: null,
        }
      );
    },
  };
  return { rpc, calls };
}

test("MoMo reconciliation uses one fresh Query requestId per claimed row", async () => {
  const claims = [
    claimedRequest(),
    claimedRequest({
      payment_id: 22,
      payment_request_id: 32,
      provider_ref: "MOMO-ORDER-2",
      amount: 130_000,
    }),
  ];
  const requestIds = [
    "20000000-0000-4000-8000-000000000000",
    "30000000-0000-4000-8000-000000000000",
  ];
  const { rpc, calls } = createRpc({ claims });
  let queryIndex = 0;

  const result = await runClaimedMomoReconciliationBatch({
    rpc,
    claimId,
    makeQueryRequestId: () => requestIds[queryIndex]!,
    now: () => queriedAt,
    query: async (input) => {
      const expectedRequestId = requestIds[queryIndex]!;
      const claim = claims[queryIndex]!;
      assert.equal(input.orderId, claim.provider_ref);
      assert.equal(input.requestId, expectedRequestId);
      assert.notEqual(input.requestId, claimId);
      queryIndex += 1;
      return {
        disposition: "success",
        response: queryResponse(expectedRequestId, {
          orderId: String(claim.provider_ref),
          amount: Number(claim.amount),
        }),
      };
    },
  });

  assert.equal(result.claimed, 2);
  assert.equal(result.completed, 2);
  assert.equal(new Set(requestIds).size, requestIds.length);
  assert.deepEqual(calls[0], {
    name: "claim_momo_reconciliation_batch",
    args: {
      p_claim_id: claimId,
      p_limit: MOMO_RECONCILIATION_BATCH_LIMIT,
      p_min_age: "5 minutes",
    },
  });

  const confirmations = calls.filter(
    (call) => call.name === "confirm_momo_payment",
  );
  const releases = calls.filter(
    (call) => call.name === "release_momo_reconciliation_claim",
  );
  assert.equal(confirmations.length, 2);
  assert.equal(releases.length, 2);
  for (let index = 0; index < confirmations.length; index += 1) {
    const providerData = confirmations[index]!.args.p_provider_data as Record<
      string,
      unknown
    >;
    assert.equal(providerData.requestId, claims[index]!.provider_ref);
    assert.equal(providerData.queryRequestId, requestIds[index]);
    assert.equal(
      providerData.paymentRequestId,
      claims[index]!.payment_request_id,
    );

    const releaseData = releases[index]!.args.p_provider_data as Record<
      string,
      unknown
    >;
    assert.equal("amount" in releaseData, false);
    assert.equal(
      (releaseData.momoReconciliation as Record<string, unknown>)
        .queryRequestId,
      requestIds[index],
    );
  }
});

test("MoMo reconciliation sends exact failure evidence to fail_momo_payment", async () => {
  const requestId = "40000000-0000-4000-8000-000000000000";
  const { rpc, calls } = createRpc({});

  const result = await runClaimedMomoReconciliationBatch({
    rpc,
    claimId,
    makeQueryRequestId: () => requestId,
    now: () => queriedAt,
    query: async () => ({
      disposition: "final_failure",
      response: queryResponse(requestId, { resultCode: 1001 }),
    }),
  });

  assert.equal(result.failed, 1);
  assert.equal(
    calls.some((call) => call.name === "confirm_momo_payment"),
    false,
  );
  const failure = calls.find((call) => call.name === "fail_momo_payment")!;
  assert.deepEqual(failure.args, {
    p_tenant_id: 1,
    p_payment_id: 21,
    p_provider_ref: "MOMO-ORDER-1",
    p_provider_data: {
      orderId: "MOMO-ORDER-1",
      requestId: "MOMO-ORDER-1",
      queryRequestId: requestId,
      paymentRequestId: 31,
      amount: 125_000,
      transactionId: "4032041704001",
      resultCode: 1001,
      responseTime: 1_760_000_000_000,
      payType: "qr",
    },
  });
});

test("MoMo reconciliation releases pending and Query API error claims", async () => {
  const claims = [
    claimedRequest(),
    claimedRequest({
      payment_id: 22,
      payment_request_id: 32,
      provider_ref: "MOMO-ORDER-2",
    }),
  ];
  const requestIds = [
    "50000000-0000-4000-8000-000000000000",
    "60000000-0000-4000-8000-000000000000",
  ];
  const { rpc, calls } = createRpc({ claims });
  let index = 0;

  const result = await runClaimedMomoReconciliationBatch({
    rpc,
    claimId,
    makeQueryRequestId: () => requestIds[index]!,
    now: () => queriedAt,
    query: async (input) => {
      const current = index;
      index += 1;
      if (current === 1) {
        throw new MomoQueryError("momo_query_http_failed");
      }
      return {
        disposition: "pending",
        response: queryResponse(input.requestId, { resultCode: 1000 }),
      };
    },
  });

  assert.equal(result.pending, 1);
  assert.equal(result.query_error, 1);
  assert.equal(
    calls.filter((call) => call.name === "release_momo_reconciliation_claim")
      .length,
    2,
  );
  assert.equal(
    calls.some(
      (call) =>
        call.name === "confirm_momo_payment" ||
        call.name === "fail_momo_payment",
    ),
    false,
  );
});

test("MoMo reconciliation releases transport and settlement errors", async () => {
  const claims = [
    claimedRequest(),
    claimedRequest({
      payment_id: 22,
      payment_request_id: 32,
      provider_ref: "MOMO-ORDER-2",
    }),
  ];
  const requestIds = [
    "70000000-0000-4000-8000-000000000000",
    "80000000-0000-4000-8000-000000000000",
  ];
  const { rpc, calls } = createRpc({
    claims,
    settlement: () => ({ data: null, error: { code: "PGRST202" } }),
  });
  let index = 0;

  const result = await runClaimedMomoReconciliationBatch({
    rpc,
    claimId,
    makeQueryRequestId: () => requestIds[index]!,
    now: () => queriedAt,
    query: async (input) => {
      const current = index;
      const claim = claims[current]!;
      index += 1;
      if (current === 0) return { disposition: "transport_timeout" };
      return {
        disposition: "success",
        response: queryResponse(input.requestId, {
          orderId: String(claim.provider_ref),
        }),
      };
    },
  });

  assert.equal(result.transport_timeout, 1);
  assert.equal(result.settlement_error, 1);
  assert.equal(
    calls.filter((call) => call.name === "release_momo_reconciliation_claim")
      .length,
    2,
  );
});

test("MoMo reconciliation reports release failure and rejects malformed claims", async () => {
  const failedRelease = createRpc({
    release: () => ({ data: null, error: { code: "08006" } }),
  });
  const result = await runClaimedMomoReconciliationBatch({
    rpc: failedRelease.rpc,
    claimId,
    makeQueryRequestId: () => "90000000-0000-4000-8000-000000000000",
    query: async () => ({ disposition: "transport_timeout" }),
  });
  assert.equal(result.release_failed, 1);

  const terminalRelease = createRpc({
    release: () => ({ data: { status: "already_released" }, error: null }),
  });
  const terminalResult = await runClaimedMomoReconciliationBatch({
    rpc: terminalRelease.rpc,
    claimId,
    makeQueryRequestId: () => "91000000-0000-4000-8000-000000000000",
    query: async () => ({ disposition: "transport_timeout" }),
  });
  assert.equal(terminalResult.transport_timeout, 1);

  const lostClaim = createRpc({
    release: () => ({ data: { status: "claim_lost" }, error: null }),
  });
  const lostClaimResult = await runClaimedMomoReconciliationBatch({
    rpc: lostClaim.rpc,
    claimId,
    makeQueryRequestId: () => "92000000-0000-4000-8000-000000000000",
    query: async () => ({ disposition: "transport_timeout" }),
  });
  assert.equal(lostClaimResult.release_failed, 1);

  const malformed = createRpc({
    claims: [claimedRequest({ amount: 125_000.5 })],
  });
  await assert.rejects(
    runClaimedMomoReconciliationBatch({
      rpc: malformed.rpc,
      claimId,
      makeQueryRequestId: () => "a0000000-0000-4000-8000-000000000000",
      query: async () => ({ disposition: "transport_timeout" }),
    }),
    (error: unknown) =>
      error instanceof MomoReconciliationBatchError &&
      error.code === "claim_response_invalid",
  );
});

test("Self-Order polling claims and reconciles only its exact MoMo request", async () => {
  const queryRequestId = "b0000000-0000-4000-8000-000000000000";
  const calls: RpcCall[] = [];
  const rpc: MomoReconciliationRpcClient = {
    async rpc(name, args) {
      calls.push({ name, args });
      if (name === "claim_momo_reconciliation_by_token") {
        return {
          data: {
            status: "claimed",
            tenantId: 1,
            paymentId: 21,
            paymentRequestId: 31,
            providerRef: "MOMO-ORDER-1",
            amount: 125_000,
          },
          error: null,
        };
      }
      if (name === "release_momo_reconciliation_claim") {
        return { data: { status: "released" }, error: null };
      }
      return { data: { status: "completed" }, error: null };
    },
  };

  const result = await runSelfOrderMomoReconciliation({
    rpc,
    token: "table-token",
    clientOpId: "c0000000-0000-4000-8000-000000000000",
    claimId,
    makeQueryRequestId: () => queryRequestId,
    now: () => queriedAt,
    query: async (input) => ({
      disposition: "success",
      response: queryResponse(input.requestId),
    }),
  });

  assert.deepEqual(result, { claimStatus: "claimed", outcome: "completed" });
  assert.deepEqual(calls[0], {
    name: "claim_momo_reconciliation_by_token",
    args: {
      p_token: "table-token",
      p_client_op_id: "c0000000-0000-4000-8000-000000000000",
      p_claim_id: claimId,
    },
  });
  assert.equal(
    calls.filter((call) => call.name === "confirm_momo_payment").length,
    1,
  );
  assert.equal(
    calls.filter((call) => call.name === "release_momo_reconciliation_claim")
      .length,
    1,
  );
});

test("Self-Order polling skips Query API when the exact claim is not due", async () => {
  let queried = false;
  const result = await runSelfOrderMomoReconciliation({
    rpc: {
      async rpc() {
        return { data: { status: "not_due" }, error: null };
      },
    },
    token: "table-token",
    clientOpId: "d0000000-0000-4000-8000-000000000000",
    claimId,
    makeQueryRequestId: () => "e0000000-0000-4000-8000-000000000000",
    query: async () => {
      queried = true;
      return { disposition: "transport_timeout" };
    },
  });

  assert.deepEqual(result, { claimStatus: "not_due", outcome: null });
  assert.equal(queried, false);
});

test("Self-Order polling rejects malformed claimed identities", async () => {
  await assert.rejects(
    runSelfOrderMomoReconciliation({
      rpc: {
        async rpc() {
          return {
            data: {
              status: "claimed",
              tenantId: 1,
              paymentId: 21,
              paymentRequestId: 31,
              providerRef: "MOMO-ORDER-1",
            },
            error: null,
          };
        },
      },
      token: "table-token",
      clientOpId: "f0000000-0000-4000-8000-000000000000",
      claimId,
      makeQueryRequestId: () => "f1000000-0000-4000-8000-000000000000",
      query: async () => ({ disposition: "transport_timeout" }),
    }),
    (error: unknown) =>
      error instanceof MomoReconciliationRequestError &&
      error.code === "claim_response_invalid",
  );
});
