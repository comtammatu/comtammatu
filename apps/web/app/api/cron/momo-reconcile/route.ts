import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createServiceClient } from "@comtammatu/database/supabase/service";
import { getPaymentProvider } from "@comtammatu/shared/providers";
import { getCronSecret } from "@comtammatu/shared/runtime";
import { issueTaxInvoiceForPaidOrder } from "@lib/hddt-per-order";
import { ensurePaymentProvidersRegistered } from "@lib/payment-providers-init";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function timingSafeEquals(left: string, right: string): boolean {
  const maxLength = 256;
  const leftBuffer = Buffer.alloc(maxLength);
  const rightBuffer = Buffer.alloc(maxLength);
  leftBuffer.write(left.slice(0, maxLength), "utf8");
  rightBuffer.write(right.slice(0, maxLength), "utf8");
  return (
    timingSafeEqual(leftBuffer, rightBuffer) && left.length === right.length
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

type MomoReconcileRpcClient = {
  rpc: <T>(
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: T | null; error: { code?: string } | null }>;
};

type MomoReconcileCandidate = {
  tenant_id: number;
  payment_id: number;
  payment_request_id: number;
  provider_ref: string;
  amount: number;
};

export async function POST(request: Request) {
  const expected = getCronSecret();
  const authorization = request.headers.get("authorization");
  const supplied = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : null;
  if (!expected || !supplied || !timingSafeEquals(supplied, expected)) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 },
    );
  }
  if (process.env.MOMO_RECONCILE_ENABLED !== "true") {
    return NextResponse.json({ ok: true, skipped: "feature_flag_off" });
  }

  ensurePaymentProvidersRegistered();
  const provider = getPaymentProvider("momo");
  if (!provider?.checkStatus) {
    return NextResponse.json(
      { ok: false, error: "momo_provider_not_configured" },
      { status: 503 },
    );
  }

  const supabase = createServiceClient();
  const momoRpc = supabase as unknown as MomoReconcileRpcClient;
  const claimId = crypto.randomUUID();
  const { data: candidates, error: claimError } = await momoRpc.rpc<
    MomoReconcileCandidate[]
  >("self_order_claim_momo_reconciliation_batch", {
    p_claim_id: claimId,
    p_limit: 20,
    p_min_age: "2 minutes",
  });
  if (claimError) {
    console.error("[cron/momo-reconcile] claim failed", claimError.code);
    return NextResponse.json(
      { ok: false, error: "claim_failed" },
      { status: 500 },
    );
  }

  const totals = { claimed: 0, pending: 0, completed: 0, failed: 0, errors: 0 };
  for (const candidate of candidates ?? []) {
    totals.claimed += 1;
    const tenantId = Number(candidate.tenant_id);
    const paymentRequestId = Number(candidate.payment_request_id);
    const providerRef = candidate.provider_ref;
    if (
      !Number.isInteger(tenantId) ||
      !Number.isInteger(paymentRequestId) ||
      !providerRef
    ) {
      totals.errors += 1;
      continue;
    }

    try {
      const query = await provider.checkStatus(providerRef);
      if (!query.providerData) throw new Error("momo_query_payload_missing");
      const { data, error } = await momoRpc.rpc<Record<string, unknown>>(
        "self_order_apply_momo_query_result",
        {
          p_tenant_id: tenantId,
          p_payment_request_id: paymentRequestId,
          p_claim_id: claimId,
          p_payload: query.providerData,
        },
      );
      if (error) throw error;
      const result = isRecord(data) ? data : {};
      const status = typeof result.status === "string" ? result.status : "";
      if (status === "pending") totals.pending += 1;
      else if (status === "failed") totals.failed += 1;
      else if (status === "completed" || status === "already_completed") {
        totals.completed += 1;
        const orderId = Number(result.orderId);
        if (Number.isInteger(orderId) && orderId > 0) {
          const invoice = await issueTaxInvoiceForPaidOrder({
            supabase,
            tenantId,
            input: { orderId },
            actorId: null,
            logPrefix: "momo-reconcile",
          });
          if (
            !invoice.success &&
            invoice.errorCode !== "invoice_exists" &&
            invoice.errorCode !== "summary_invoice_exists"
          ) {
            console.error(
              "[cron/momo-reconcile] invoice attempt failed",
              invoice.errorCode,
            );
          }
        }
      }
    } catch (error) {
      totals.errors += 1;
      console.error("[cron/momo-reconcile] candidate failed", {
        tenantId,
        paymentRequestId,
        error: error instanceof Error ? error.message : "unknown",
      });
      const { error: releaseError } = await momoRpc.rpc<
        Record<string, unknown>
      >("self_order_release_momo_reconciliation_claim", {
        p_tenant_id: tenantId,
        p_payment_request_id: paymentRequestId,
        p_claim_id: claimId,
      });
      if (releaseError) {
        console.error(
          "[cron/momo-reconcile] claim release failed",
          releaseError.code,
        );
      }
    }
  }

  return NextResponse.json({ ok: true, totals });
}

export const GET = POST;
