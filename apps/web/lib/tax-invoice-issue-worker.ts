import { createServiceClient } from "@comtammatu/database/supabase/service";
import { issueTaxInvoiceForPaidOrder } from "@lib/hddt-per-order";

type ClaimedTaxInvoiceJob = {
  id: number;
  tenant_id: number;
  branch_id: number;
  order_id: number;
  payment_id: number | null;
  invoice_payload: unknown;
  tax_invoice_id: number | null;
  attempt_count: number;
};

type IssueJobStatus = "completed" | "blocked" | "reconcile_required";

type WorkerRpcClient = {
  rpc: <T>(
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: T | null; error: { code?: string | null } | null }>;
};

async function finishJob(
  rpc: WorkerRpcClient,
  jobId: number,
  status: IssueJobStatus,
  error?: string,
): Promise<void> {
  const { error: finishError } = await rpc.rpc(
    "finish_tax_invoice_issue_job_as_system",
    {
      p_job_id: jobId,
      p_status: status,
      p_last_error: error ?? null,
    },
  );
  if (finishError) {
    console.error("[tax-invoice-worker] finish job failed", {
      jobId,
      status,
      code: finishError.code,
    });
  }
}

async function latestInvoiceStatus(
  service: ReturnType<typeof createServiceClient>,
  tenantId: number,
  orderId: number,
): Promise<"draft" | "signing" | "submitted" | "issued" | null> {
  const { data, error } = await service
    .from("tax_invoices")
    .select("status")
    .eq("tenant_id", tenantId)
    .eq("order_id", orderId)
    .not("status", "in", '("cancelled","replaced","not_required")')
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[tax-invoice-worker] invoice lookup failed", {
      tenantId,
      orderId,
      code: error.code,
    });
    return null;
  }

  if (
    data?.status === "draft" ||
    data?.status === "signing" ||
    data?.status === "submitted" ||
    data?.status === "issued"
  ) {
    return data.status;
  }
  return null;
}

async function processJob(
  service: ReturnType<typeof createServiceClient>,
  rpc: WorkerRpcClient,
  job: ClaimedTaxInvoiceJob,
): Promise<IssueJobStatus> {
  const existingStatus = await latestInvoiceStatus(
    service,
    job.tenant_id,
    job.order_id,
  );
  if (existingStatus === "issued") {
    await finishJob(rpc, job.id, "completed");
    return "completed";
  }
  if (existingStatus === "signing" || existingStatus === "submitted") {
    await finishJob(rpc, job.id, "reconcile_required", "provider_state_unknown");
    return "reconcile_required";
  }

  const invoicePayload =
    job.invoice_payload !== null && typeof job.invoice_payload === "object"
      ? { ...(job.invoice_payload as Record<string, unknown>), orderId: job.order_id }
      : null;
  if (!invoicePayload) {
    await finishJob(rpc, job.id, "blocked", "invoice_payload_invalid");
    return "blocked";
  }

  const result = await issueTaxInvoiceForPaidOrder({
    supabase: service,
    tenantId: job.tenant_id,
    input: invoicePayload,
    logPrefix: "tax-invoice-worker",
  });

  const finalStatus = result.success
    ? result.data?.status
    : await latestInvoiceStatus(service, job.tenant_id, job.order_id);

  if (finalStatus === "issued") {
    await finishJob(rpc, job.id, "completed");
    return "completed";
  }
  if (finalStatus === "signing" || finalStatus === "submitted") {
    await finishJob(
      rpc,
      job.id,
      "reconcile_required",
      result.success ? "provider_state_unknown" : result.errorCode,
    );
    return "reconcile_required";
  }

  await finishJob(
    rpc,
    job.id,
    "blocked",
    result.success ? "provider_rejected" : result.errorCode,
  );
  return "blocked";
}

export async function runTaxInvoiceIssueWorker(jobId?: number): Promise<{
  claimed: number;
  completed: number;
  blocked: number;
  reconcile_required: number;
}> {
  if (jobId !== undefined && (!Number.isSafeInteger(jobId) || jobId <= 0)) {
    throw new Error("invalid_job_id");
  }

  const service = createServiceClient();
  const rpc = service as unknown as WorkerRpcClient;
  const { data, error } = await rpc.rpc<ClaimedTaxInvoiceJob[]>(
    jobId === undefined
      ? "claim_tax_invoice_issue_jobs"
      : "claim_tax_invoice_issue_job",
    jobId === undefined
      ? { p_limit: 20, p_lease_seconds: 300 }
      : { p_job_id: jobId, p_lease_seconds: 300 },
  );
  if (error) {
    throw new Error("claim_failed");
  }

  const summary = {
    claimed: data?.length ?? 0,
    completed: 0,
    blocked: 0,
    reconcile_required: 0,
  };
  for (const job of data ?? []) {
    try {
      const status = await processJob(service, rpc, job);
      summary[status] += 1;
    } catch {
      await finishJob(rpc, job.id, "reconcile_required", "worker_exception");
      summary.reconcile_required += 1;
    }
  }
  return summary;
}
