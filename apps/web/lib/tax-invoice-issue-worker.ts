import { createServiceClient } from "@comtammatu/database/supabase/service";
import { issuePreparedTaxInvoice } from "@lib/hddt-per-order";

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

const MAX_JOBS_PER_RUN = 20;
const WORKER_CONCURRENCY = 4;

function workerErrorCode(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code.slice(0, 64);
  }
  return (error instanceof Error ? error.name : "worker_exception").slice(
    0,
    64,
  );
}

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
  taxInvoiceId: number,
): Promise<"draft" | "signing" | "submitted" | "issued" | null> {
  const { data, error } = await service
    .from("tax_invoices")
    .select("status")
    .eq("id", taxInvoiceId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) {
    console.error("[tax-invoice-worker] invoice lookup failed", {
      tenantId,
      taxInvoiceId,
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
  if (job.tax_invoice_id === null) {
    await finishJob(rpc, job.id, "blocked", "invoice_draft_missing");
    return "blocked";
  }
  const taxInvoiceId = job.tax_invoice_id;

  const existingStatus = await latestInvoiceStatus(
    service,
    job.tenant_id,
    taxInvoiceId,
  );
  if (existingStatus === "issued") {
    await finishJob(rpc, job.id, "completed");
    return "completed";
  }
  if (existingStatus === "signing" || existingStatus === "submitted") {
    await finishJob(
      rpc,
      job.id,
      "reconcile_required",
      "provider_state_unknown",
    );
    return "reconcile_required";
  }

  const invoicePayload =
    job.invoice_payload !== null && typeof job.invoice_payload === "object"
      ? {
          ...(job.invoice_payload as Record<string, unknown>),
          orderId: job.order_id,
        }
      : null;
  if (!invoicePayload) {
    await finishJob(rpc, job.id, "blocked", "invoice_payload_invalid");
    return "blocked";
  }

  const result = await issuePreparedTaxInvoice({
    supabase: service,
    jobId: job.id,
    taxInvoiceId,
    input: invoicePayload,
    logPrefix: "tax-invoice-worker",
  });

  const finalStatus = result.success
    ? result.data?.status
    : await latestInvoiceStatus(service, job.tenant_id, taxInvoiceId);

  if (finalStatus === "issued") {
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
  const summary = {
    claimed: 0,
    completed: 0,
    blocked: 0,
    reconcile_required: 0,
  };

  async function handle(job: ClaimedTaxInvoiceJob): Promise<void> {
    summary.claimed += 1;
    try {
      const status = await processJob(service, rpc, job);
      summary[status] += 1;
    } catch (error) {
      console.error("[tax-invoice-worker] job failed", {
        jobId: job.id,
        tenantId: job.tenant_id,
        branchId: job.branch_id,
        orderId: job.order_id,
        attemptCount: job.attempt_count,
        code: workerErrorCode(error),
      });
      await finishJob(rpc, job.id, "reconcile_required", "worker_exception");
      summary.reconcile_required += 1;
    }
  }

  if (jobId !== undefined) {
    const { data, error } = await rpc.rpc<ClaimedTaxInvoiceJob[]>(
      "claim_tax_invoice_issue_job",
      { p_job_id: jobId, p_lease_seconds: 300 },
    );
    if (error) throw new Error("claim_failed");
    await Promise.all((data ?? []).map(handle));
    return summary;
  }

  let claimSlots = MAX_JOBS_PER_RUN;
  let claimFailed = false;
  await Promise.all(
    Array.from({ length: WORKER_CONCURRENCY }, async () => {
      while (claimSlots > 0) {
        claimSlots -= 1;
        const { data, error } = await rpc.rpc<ClaimedTaxInvoiceJob[]>(
          "claim_tax_invoice_issue_jobs",
          { p_limit: 1, p_lease_seconds: 300 },
        );
        if (error) {
          claimFailed = true;
          return;
        }
        const job = data?.[0];
        if (!job) return;
        await handle(job);
      }
    }),
  );
  if (claimFailed) throw new Error("claim_failed");
  return summary;
}
