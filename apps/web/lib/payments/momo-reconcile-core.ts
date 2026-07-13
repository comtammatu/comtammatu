import { z } from "zod";
import {
  MomoQueryError,
  type MomoQueryInput,
  type MomoQueryResponse,
  type MomoQueryResult,
} from "./momo-query";

export const MOMO_RECONCILIATION_BATCH_LIMIT = 5;

const claimedRequestSchema = z
  .object({
    tenant_id: z.coerce.number().int().positive().safe(),
    payment_id: z.coerce.number().int().positive().safe(),
    payment_request_id: z.coerce.number().int().positive().safe(),
    provider_ref: z.string().regex(/^[0-9a-zA-Z]([-_.]*[0-9a-zA-Z]+)*$/),
    amount: z.coerce.number().int().positive().safe(),
  })
  .strict();

const claimedRequestsSchema = z.array(claimedRequestSchema);

const claimedRequestResponseSchema = z
  .object({
    status: z.literal("claimed"),
    tenantId: z.coerce.number().int().positive().safe(),
    paymentId: z.coerce.number().int().positive().safe(),
    paymentRequestId: z.coerce.number().int().positive().safe(),
    providerRef: z.string().regex(/^[0-9a-zA-Z]([-_.]*[0-9a-zA-Z]+)*$/),
    amount: z.coerce.number().int().positive().safe(),
  })
  .strict();

type ClaimedRequestRow = z.infer<typeof claimedRequestSchema>;

export type MomoReconciliationOutcome =
  | "completed"
  | "already_completed"
  | "failed"
  | "pending"
  | "transport_timeout"
  | "review_required"
  | "settlement_rejected"
  | "settlement_error"
  | "query_error"
  | "release_failed";

export type MomoReconciliationSummary = {
  claimed: number;
} & Record<MomoReconciliationOutcome, number>;

export type MomoReconciliationRpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{
    data: unknown;
    error: { code?: string | null } | null;
  }>;
};

type QueryMomo = (input: MomoQueryInput) => Promise<MomoQueryResult>;

export class MomoReconciliationBatchError extends Error {
  constructor(readonly code: "claim_failed" | "claim_response_invalid") {
    super(code);
    this.name = "MomoReconciliationBatchError";
  }
}

export class MomoReconciliationRequestError extends Error {
  constructor(readonly code: "claim_failed" | "claim_response_invalid") {
    super(code);
    this.name = "MomoReconciliationRequestError";
  }
}

function rpcStatus(data: unknown): string {
  if (!data || typeof data !== "object" || Array.isArray(data)) return "";
  const status = (data as Record<string, unknown>).status;
  return typeof status === "string" ? status : "";
}

function providerData(
  claim: ClaimedRequestRow,
  response: MomoQueryResponse,
): Record<string, unknown> {
  return {
    orderId: response.orderId,
    requestId: claim.provider_ref,
    queryRequestId: response.requestId,
    paymentRequestId: claim.payment_request_id,
    amount: response.amount,
    transactionId: String(response.transId),
    resultCode: response.resultCode,
    responseTime: response.responseTime,
    payType: response.payType,
  };
}

function reconciliationEvidence(
  disposition: string,
  queriedAt: string,
  queryRequestId?: string,
  response?: MomoQueryResponse,
  errorCode?: string,
  settlementStatus?: string,
): Record<string, unknown> {
  return {
    momoReconciliation: {
      source: "query",
      disposition,
      queriedAt,
      ...(queryRequestId ? { queryRequestId } : {}),
      ...(response
        ? {
            amount: response.amount,
            resultCode: response.resultCode,
            transactionId: String(response.transId),
            responseTime: response.responseTime,
          }
        : {}),
      ...(errorCode ? { errorCode } : {}),
      ...(settlementStatus ? { settlementStatus } : {}),
    },
  };
}

function settlementOutcome(
  disposition: "success" | "final_failure",
  status: string,
): MomoReconciliationOutcome {
  if (status === "already_completed") return "already_completed";
  if (disposition === "success" && status === "completed") return "completed";
  if (disposition === "final_failure" && status === "failed") return "failed";
  if (
    status === "overpayment_needs_review" ||
    status === "payment_state_conflict_needs_review"
  ) {
    return "review_required";
  }
  return "settlement_rejected";
}

async function releaseClaim(
  rpc: MomoReconciliationRpcClient,
  claim: ClaimedRequestRow,
  claimId: string,
  evidence: Record<string, unknown>,
): Promise<boolean> {
  try {
    const { data, error } = await rpc.rpc("release_momo_reconciliation_claim", {
      p_tenant_id: claim.tenant_id,
      p_payment_request_id: claim.payment_request_id,
      p_claim_id: claimId,
      p_provider_data: evidence,
    });
    if (error) return false;
    const status = rpcStatus(data);
    return status === "released" || status === "already_released";
  } catch {
    return false;
  }
}

async function reconcileClaim(input: {
  rpc: MomoReconciliationRpcClient;
  query: QueryMomo;
  claim: ClaimedRequestRow;
  claimId: string;
  makeQueryRequestId: () => string;
  now: () => string;
}): Promise<MomoReconciliationOutcome> {
  const { rpc, query, claim, claimId, makeQueryRequestId, now } = input;
  let outcome: MomoReconciliationOutcome = "query_error";
  let evidence = reconciliationEvidence(
    "query_error",
    now(),
    undefined,
    undefined,
    "momo_reconcile_runtime_error",
  );
  let result: MomoQueryResult | null = null;
  let queryRequestId: string | undefined;

  try {
    queryRequestId = z.uuid().parse(makeQueryRequestId());
    result = await query({
      orderId: claim.provider_ref,
      requestId: queryRequestId,
      expectedAmount: claim.amount,
    });
  } catch (error) {
    evidence = reconciliationEvidence(
      "query_error",
      now(),
      queryRequestId,
      undefined,
      error instanceof MomoQueryError
        ? error.code
        : "momo_reconcile_runtime_error",
    );
  }

  if (result?.disposition === "transport_timeout") {
    outcome = "transport_timeout";
    evidence = reconciliationEvidence(
      "transport_timeout",
      now(),
      queryRequestId,
    );
  } else if (result) {
    const { disposition, response } = result;
    evidence = reconciliationEvidence(
      disposition,
      now(),
      queryRequestId,
      response,
    );

    if (disposition === "pending") {
      outcome = "pending";
    } else {
      const data = providerData(claim, response);
      const rpcName =
        disposition === "success"
          ? "confirm_momo_payment"
          : "fail_momo_payment";
      const args =
        disposition === "success"
          ? {
              p_tenant_id: claim.tenant_id,
              p_payment_id: claim.payment_id,
              p_provider_ref: claim.provider_ref,
              p_transaction_id: String(response.transId),
              p_amount: response.amount,
              p_provider_data: data,
            }
          : {
              p_tenant_id: claim.tenant_id,
              p_payment_id: claim.payment_id,
              p_provider_ref: claim.provider_ref,
              p_provider_data: data,
            };

      try {
        const settlement = await rpc.rpc(rpcName, args);
        if (settlement.error) {
          outcome = "settlement_error";
          evidence = reconciliationEvidence(
            disposition,
            now(),
            queryRequestId,
            response,
            "settlement_rpc_failed",
          );
        } else {
          const status = rpcStatus(settlement.data);
          outcome = settlementOutcome(disposition, status);
          evidence = reconciliationEvidence(
            disposition,
            now(),
            queryRequestId,
            response,
            undefined,
            status || "invalid_response",
          );
        }
      } catch {
        outcome = "settlement_error";
        evidence = reconciliationEvidence(
          disposition,
          now(),
          queryRequestId,
          response,
          "settlement_rpc_failed",
        );
      }
    }
  }

  return (await releaseClaim(rpc, claim, claimId, evidence))
    ? outcome
    : "release_failed";
}

function emptySummary(claimed: number): MomoReconciliationSummary {
  return {
    claimed,
    completed: 0,
    already_completed: 0,
    failed: 0,
    pending: 0,
    transport_timeout: 0,
    review_required: 0,
    settlement_rejected: 0,
    settlement_error: 0,
    query_error: 0,
    release_failed: 0,
  };
}

export async function runClaimedMomoReconciliationBatch(input: {
  rpc: MomoReconciliationRpcClient;
  claimId: string;
  query: QueryMomo;
  makeQueryRequestId: () => string;
  now?: () => string;
}): Promise<MomoReconciliationSummary> {
  const { data, error } = await input.rpc.rpc(
    "claim_momo_reconciliation_batch",
    {
      p_claim_id: input.claimId,
      p_limit: MOMO_RECONCILIATION_BATCH_LIMIT,
      p_min_age: "5 minutes",
    },
  );
  if (error) throw new MomoReconciliationBatchError("claim_failed");

  const parsed = claimedRequestsSchema.safeParse(data ?? []);
  if (!parsed.success) {
    throw new MomoReconciliationBatchError("claim_response_invalid");
  }

  const summary = emptySummary(parsed.data.length);
  const now = input.now ?? (() => new Date().toISOString());
  for (const claim of parsed.data) {
    const outcome = await reconcileClaim({
      rpc: input.rpc,
      query: input.query,
      claim,
      claimId: input.claimId,
      makeQueryRequestId: input.makeQueryRequestId,
      now,
    });
    summary[outcome] += 1;
  }
  return summary;
}

export async function runSelfOrderMomoReconciliation(input: {
  rpc: MomoReconciliationRpcClient;
  token: string;
  clientOpId: string;
  claimId: string;
  query: QueryMomo;
  makeQueryRequestId: () => string;
  now?: () => string;
}): Promise<{
  claimStatus: string;
  outcome: MomoReconciliationOutcome | null;
}> {
  const { data, error } = await input.rpc.rpc(
    "claim_momo_reconciliation_by_token",
    {
      p_token: input.token,
      p_client_op_id: input.clientOpId,
      p_claim_id: input.claimId,
    },
  );
  if (error) throw new MomoReconciliationRequestError("claim_failed");

  const claimStatus = rpcStatus(data);
  if (!claimStatus) {
    throw new MomoReconciliationRequestError("claim_response_invalid");
  }
  if (claimStatus !== "claimed") {
    return { claimStatus, outcome: null };
  }

  const parsed = claimedRequestResponseSchema.safeParse(data);
  if (!parsed.success) {
    throw new MomoReconciliationRequestError("claim_response_invalid");
  }
  const claim: ClaimedRequestRow = {
    tenant_id: parsed.data.tenantId,
    payment_id: parsed.data.paymentId,
    payment_request_id: parsed.data.paymentRequestId,
    provider_ref: parsed.data.providerRef,
    amount: parsed.data.amount,
  };
  const outcome = await reconcileClaim({
    rpc: input.rpc,
    query: input.query,
    claim,
    claimId: input.claimId,
    makeQueryRequestId: input.makeQueryRequestId,
    now: input.now ?? (() => new Date().toISOString()),
  });
  return { claimStatus, outcome };
}
