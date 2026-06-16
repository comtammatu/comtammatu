/**
 * HĐĐT reconcile cron — pure state-mapping logic.
 *
 * Shared between cron route + admin manual trigger. No Supabase, no
 * fetch — kept pure for unit-testability. Orchestration lives in
 * apps/web/lib/hddt-reconcile.ts which composes this with provider
 * + Supabase RPC calls.
 */
import type { InvoiceStatus } from "../providers/invoice";

/**
 * tax_invoices.status values that are pollable. Terminal states
 * (cancelled, replaced, issued, not_required) and pre-submission
 * (draft) are explicitly excluded — see regression rule
 * HDDT-RECONCILE-SCOPED-TO-SIGNING-SUBMITTED.
 */
export type ReconcilableStatus = "signing" | "submitted";

/**
 * Target state the reconcile cron asks the state-machine RPC to set,
 * OR a non-transition outcome the caller should log without an RPC
 * call.
 */
export type ReconcileDecision =
  | { kind: "transition"; toStatus: "issued" | "cancelled"; reason: string }
  | { kind: "no_change"; reason: string }
  | { kind: "unknown_status"; reason: string }
  | { kind: "provider_error"; reason: string }
  | { kind: "giveup_24h"; reason: string };

const GIVEUP_SECONDS = 24 * 60 * 60;

/**
 * Map (current DB status, provider getStatus return, age) to a
 * reconcile decision.
 *
 * Rules:
 *   - Provider `error` field set → provider_error (no state change,
 *     retry next tick). Never trust the bundled status field when
 *     error is present — see InvoiceStatus.error doc.
 *   - Provider `issued`: always transition → issued. State machine
 *     allows signing→issued and submitted→issued.
 *   - Provider `cancelled`: always transition → cancelled (provider
 *     is the CQT-side source of truth). Per regression rule
 *     HDDT-SUMMARY-CANCEL-PRESERVES-JUNCTION the RPC preserves
 *     junction rows; reconcile MUST NOT touch tax_invoice_orders.
 *   - Provider `replaced`: matrix doesn't allow signing/submitted →
 *     replaced; alert only (Path C handles replace flow).
 *   - Provider `submitted` from `submitted`: no_change (waiting for
 *     CQT code).
 *   - Provider `submitted` from `signing`: no_change here — caller's
 *     UPDATE of invoice_number is enough; transition would be
 *     signing→submitted which is allowed but adds churn for nothing.
 *     Returning no_change lets the next tick pick it up at submitted
 *     state if still pending.
 *   - Provider `draft`/anything-else: unknown_status. Provider may
 *     have lost the submission; do not transition.
 *   - Age ≥ 86400s (24h): override to giveup_24h regardless of
 *     provider response — caller transitions cancelled with note
 *     'reconcile_giveup_24h'. State machine allows both
 *     signing→cancelled and submitted→cancelled. Owner can re-issue
 *     manually via Path C replace flow when it ships.
 */
export function pickReconcileDecision(
  currentStatus: ReconcilableStatus,
  providerStatus: InvoiceStatus,
  ageSeconds: number,
): ReconcileDecision {
  if (providerStatus.error) {
    if (ageSeconds >= GIVEUP_SECONDS) {
      return {
        kind: "giveup_24h",
        reason: `provider_error_after_${ageSeconds}s: ${providerStatus.error}`,
      };
    }
    return { kind: "provider_error", reason: providerStatus.error };
  }

  switch (providerStatus.status) {
    case "issued":
      return {
        kind: "transition",
        toStatus: "issued",
        reason: "provider_issued",
      };
    case "cancelled":
      return {
        kind: "transition",
        toStatus: "cancelled",
        reason: "provider_cancelled_externally",
      };
    case "replaced":
      return {
        kind: "unknown_status",
        reason: "provider_replaced_needs_manual_review",
      };
    case "submitted":
      if (ageSeconds >= GIVEUP_SECONDS) {
        return {
          kind: "giveup_24h",
          reason: `cqt_timeout_${ageSeconds}s`,
        };
      }
      return { kind: "no_change", reason: "awaiting_cqt_code" };
    case "draft":
    case "signing":
    default:
      if (ageSeconds >= GIVEUP_SECONDS) {
        return {
          kind: "giveup_24h",
          reason: `unknown_status_after_${ageSeconds}s`,
        };
      }
      return {
        kind: "unknown_status",
        reason: `provider_returned_${providerStatus.status}`,
      };
  }
}

/**
 * Reconcile candidate row shape — minimal projection of tax_invoices
 * needed by the reconcile loop. Kept here so the helper signature is
 * decoupled from Supabase Database types (which need migration
 * apply + regen).
 */
export interface ReconcileCandidate {
  id: number;
  tenant_id: number;
  branch_id: number;
  status: ReconcilableStatus;
  provider: string;
  provider_ref: string;
  signing_started_at: string;
  invoice_kind: "per_order" | "daily_summary";
}

export const RECONCILE_GIVEUP_SECONDS = GIVEUP_SECONDS;
export const RECONCILE_MIN_AGE_SECONDS = 60;
export const RECONCILE_BATCH_LIMIT_PER_BRANCH = 25;
export const RECONCILE_CRON_BUDGET_MS = 240_000;
