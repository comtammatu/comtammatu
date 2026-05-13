/**
 * HĐĐT reconcile cron — shared runner.
 *
 * Picks up tax_invoices stuck in `signing` or `submitted`, polls
 * provider.getStatus, drives the state machine via the service-role
 * RPC, and writes per-attempt audit rows to reconcile_run_log.
 *
 * Shared between Vercel cron route (`/api/cron/hddt-reconcile`) and
 * admin manual force-resync action. Caller passes service-role
 * Supabase client + invoice provider; auth gating belongs to caller.
 *
 * Hard-locked invariants (regression rules HDDT-RECONCILE-*):
 *   - SELECT scope = (status IN ('signing','submitted') AND
 *     provider_ref IS NOT NULL AND provider <> 'skipped' AND
 *     signing_started_at < NOW() - 60s). Never reconcile drafts or
 *     terminal states.
 *   - Always use transition_tax_invoice_state_as_system RPC. Never
 *     direct UPDATE. Catch illegal_transition (22023) as race_lost.
 *   - Provider error → no state change, log + retry next tick.
 *   - Age ≥ 24h → cancel with note='reconcile_giveup_24h'.
 *   - Junction (tax_invoice_orders) is never touched here — state
 *     machine RPC handles cancel without junction deletion.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@comtammatu/database";
import type { InvoiceProvider } from "@comtammatu/shared/providers";
import {
  pickReconcileDecision,
  RECONCILE_BATCH_LIMIT_PER_BRANCH,
  RECONCILE_CRON_BUDGET_MS,
  RECONCILE_MIN_AGE_SECONDS,
  type ReconcilableStatus,
  type ReconcileCandidate,
  type ReconcileDecision,
} from "@comtammatu/shared/hddt";

export interface ReconcileRunDeps {
  supabase: SupabaseClient<Database>;
  provider: InvoiceProvider;
  /** "cron" or "manual". Drives reconcile_run_log.trigger_source. */
  triggerSource: "cron" | "manual";
  /** Acting user.id for manual; null for cron. */
  triggeredBy: string | null;
  /** Wall clock when the run started (for budget timer). */
  startedAt: number;
  /** Optional: cap total budget in ms (default 240000 = 4 min). */
  budgetMs?: number;
}

export interface ReconcileBranchOutcome {
  branchId: number;
  candidates: number;
  transitioned: number;
  no_change: number;
  race_lost: number;
  provider_error: number;
  unknown_status: number;
  giveup_24h: number;
  budget_exceeded: boolean;
}

const GIVEUP_NOTE = "reconcile_giveup_24h";

function ageSecondsFromIso(iso: string, nowMs: number): number {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return 0;
  return Math.max(0, Math.floor((nowMs - ts) / 1000));
}

async function fetchReconcileCandidates(
  supabase: SupabaseClient<Database>,
  branchId: number,
  cutoffIso: string,
): Promise<ReconcileCandidate[]> {
  const { data, error } = await supabase
    .from("tax_invoices")
    .select(
      "id, tenant_id, branch_id, status, provider, provider_ref, signing_started_at, invoice_kind",
    )
    .eq("branch_id", branchId)
    .in("status", ["signing", "submitted"])
    .neq("provider", "skipped")
    .not("provider_ref", "is", null)
    .not("signing_started_at", "is", null)
    .lt("signing_started_at", cutoffIso)
    .order("signing_started_at", { ascending: true })
    .limit(RECONCILE_BATCH_LIMIT_PER_BRANCH);

  if (error) throw new Error(`fetch_candidates_failed: ${error.message}`);
  if (!data) return [];

  return data
    .filter(
      (r): r is typeof r & {
        provider_ref: string;
        signing_started_at: string;
        status: ReconcilableStatus;
        invoice_kind: "per_order" | "daily_summary";
      } =>
        (r.status === "signing" || r.status === "submitted") &&
        r.provider_ref != null &&
        r.signing_started_at != null &&
        (r.invoice_kind === "per_order" ||
          r.invoice_kind === "daily_summary"),
    )
    .map((r) => ({
      id: r.id,
      tenant_id: r.tenant_id,
      branch_id: r.branch_id,
      status: r.status,
      provider: r.provider,
      provider_ref: r.provider_ref,
      signing_started_at: r.signing_started_at,
      invoice_kind: r.invoice_kind,
    }));
}

async function writeReconcileLog(
  supabase: SupabaseClient<Database>,
  row: {
    tenantId: number;
    branchId: number;
    taxInvoiceId: number;
    triggerSource: "cron" | "manual";
    triggeredBy: string | null;
    beforeStatus: ReconcilableStatus;
    afterStatus: string | null;
    providerReturned: string | null;
    outcome:
      | "transitioned"
      | "no_change"
      | "race_lost"
      | "provider_error"
      | "unknown_status"
      | "giveup_24h";
    error: string | null;
    ageSeconds: number;
  },
): Promise<void> {
  await supabase.from("reconcile_run_log").insert({
    tenant_id: row.tenantId,
    branch_id: row.branchId,
    tax_invoice_id: row.taxInvoiceId,
    trigger_source: row.triggerSource,
    triggered_by: row.triggeredBy,
    before_status: row.beforeStatus,
    after_status: row.afterStatus,
    provider_returned: row.providerReturned,
    outcome: row.outcome,
    error: row.error,
    attempt_age_seconds: row.ageSeconds,
  });
}

/**
 * Reconcile single-invoice outcome. Superset of ReconcileDecision["kind"]
 * — adds `race_lost` which only emerges at the RPC boundary (state
 * machine rejected the transition because the row changed under us).
 */
export type ReconcileOutcomeKind =
  | ReconcileDecision["kind"]
  | "race_lost";

/**
 * Reconcile a single invoice. Catches state-machine race (22023) as
 * race_lost; provider exceptions surface as provider_error. Always
 * writes exactly one reconcile_run_log row.
 */
export async function reconcileSingleInvoice(
  supabase: SupabaseClient<Database>,
  provider: InvoiceProvider,
  candidate: ReconcileCandidate,
  triggerSource: "cron" | "manual",
  triggeredBy: string | null,
  nowMs: number,
): Promise<ReconcileOutcomeKind> {
  const ageSeconds = ageSecondsFromIso(candidate.signing_started_at, nowMs);
  const providerStatus = await provider.getStatus(candidate.provider_ref);
  const decision = pickReconcileDecision(
    candidate.status,
    providerStatus,
    ageSeconds,
  );
  const providerReturned = providerStatus.error
    ? "error"
    : providerStatus.status;

  if (decision.kind === "no_change") {
    await writeReconcileLog(supabase, {
      tenantId: candidate.tenant_id,
      branchId: candidate.branch_id,
      taxInvoiceId: candidate.id,
      triggerSource,
      triggeredBy,
      beforeStatus: candidate.status,
      afterStatus: null,
      providerReturned,
      outcome: "no_change",
      error: null,
      ageSeconds,
    });
    return "no_change";
  }

  if (decision.kind === "provider_error" || decision.kind === "unknown_status") {
    await writeReconcileLog(supabase, {
      tenantId: candidate.tenant_id,
      branchId: candidate.branch_id,
      taxInvoiceId: candidate.id,
      triggerSource,
      triggeredBy,
      beforeStatus: candidate.status,
      afterStatus: null,
      providerReturned,
      outcome: decision.kind,
      error: decision.reason,
      ageSeconds,
    });
    return decision.kind;
  }

  // transition | giveup_24h — both call the RPC
  const toStatus =
    decision.kind === "giveup_24h" ? "cancelled" : decision.toStatus;
  const note =
    decision.kind === "giveup_24h" ? GIVEUP_NOTE : "reconcile_cron";

  const payload: Record<string, unknown> = {
    reconcile: {
      trigger_source: triggerSource,
      provider_status: providerStatus.status,
      provider_error: providerStatus.error ?? null,
      age_seconds: ageSeconds,
      decision: decision.kind,
      decision_reason: decision.reason,
    },
  };

  const { error: rpcErr } = await supabase.rpc(
    "transition_tax_invoice_state_as_system",
    {
      p_tax_invoice_id: candidate.id,
      p_to_status: toStatus,
      p_payload: payload as never,
      p_note: note,
    },
  );

  if (rpcErr) {
    // 22023 = illegal_transition — row state changed under us
    // (e.g., cashier cancelled mid-poll). Treat as race_lost.
    const isRace = rpcErr.code === "22023";
    await writeReconcileLog(supabase, {
      tenantId: candidate.tenant_id,
      branchId: candidate.branch_id,
      taxInvoiceId: candidate.id,
      triggerSource,
      triggeredBy,
      beforeStatus: candidate.status,
      afterStatus: null,
      providerReturned,
      outcome: isRace ? "race_lost" : "provider_error",
      error: rpcErr.message ?? "rpc_failed",
      ageSeconds,
    });
    return isRace ? "race_lost" : "provider_error";
  }

  // Persist invoice_number when provider returned one (issued path).
  if (
    decision.kind === "transition" &&
    decision.toStatus === "issued" &&
    providerStatus.invoiceNumber
  ) {
    await supabase
      .from("tax_invoices")
      .update({ invoice_number: providerStatus.invoiceNumber })
      .eq("id", candidate.id);
  }

  await writeReconcileLog(supabase, {
    tenantId: candidate.tenant_id,
    branchId: candidate.branch_id,
    taxInvoiceId: candidate.id,
    triggerSource,
    triggeredBy,
    beforeStatus: candidate.status,
    afterStatus: toStatus,
    providerReturned,
    outcome: decision.kind === "giveup_24h" ? "giveup_24h" : "transitioned",
    error: decision.kind === "giveup_24h" ? decision.reason : null,
    ageSeconds,
  });

  return decision.kind;
}

/**
 * Reconcile one branch — fetches candidates and processes them
 * oldest-first with a per-run budget timer. Returns per-outcome
 * counters. Throws only on fetch failure; per-row errors are caught
 * and logged.
 */
export async function executeReconcileRunForBranch(
  deps: ReconcileRunDeps,
  branchId: number,
): Promise<ReconcileBranchOutcome> {
  const { supabase, provider, triggerSource, triggeredBy, startedAt } = deps;
  const budgetMs = deps.budgetMs ?? RECONCILE_CRON_BUDGET_MS;

  const nowMs = Date.now();
  const cutoff = new Date(nowMs - RECONCILE_MIN_AGE_SECONDS * 1000);
  const candidates = await fetchReconcileCandidates(
    supabase,
    branchId,
    cutoff.toISOString(),
  );

  const counters: ReconcileBranchOutcome = {
    branchId,
    candidates: candidates.length,
    transitioned: 0,
    no_change: 0,
    race_lost: 0,
    provider_error: 0,
    unknown_status: 0,
    giveup_24h: 0,
    budget_exceeded: false,
  };

  for (const candidate of candidates) {
    if (Date.now() - startedAt > budgetMs) {
      counters.budget_exceeded = true;
      break;
    }
    try {
      const outcome = await reconcileSingleInvoice(
        supabase,
        provider,
        candidate,
        triggerSource,
        triggeredBy,
        Date.now(),
      );
      switch (outcome) {
        case "transition":
          counters.transitioned += 1;
          break;
        case "no_change":
          counters.no_change += 1;
          break;
        case "race_lost":
          counters.race_lost += 1;
          break;
        case "provider_error":
          counters.provider_error += 1;
          break;
        case "unknown_status":
          counters.unknown_status += 1;
          break;
        case "giveup_24h":
          counters.giveup_24h += 1;
          break;
      }
    } catch (e) {
      counters.provider_error += 1;
      await writeReconcileLog(supabase, {
        tenantId: candidate.tenant_id,
        branchId: candidate.branch_id,
        taxInvoiceId: candidate.id,
        triggerSource,
        triggeredBy,
        beforeStatus: candidate.status,
        afterStatus: null,
        providerReturned: null,
        outcome: "provider_error",
        error: e instanceof Error ? e.message : "reconcile_exception",
        ageSeconds: ageSecondsFromIso(candidate.signing_started_at, Date.now()),
      });
    }
  }

  return counters;
}
