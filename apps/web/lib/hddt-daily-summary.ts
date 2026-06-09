/**
 * HĐĐT daily B2C summary runner — shared between Vercel cron route and admin
 * manual trigger server action. Both call this with a service-role Supabase
 * client; permission is gated at the caller (Bearer secret for cron, action
 * permission check for manual).
 *
 * Flow per (branch, summary_date):
 *   1. RPC aggregate_daily_b2c_invoice → creates draft tax_invoices row +
 *      tax_invoice_orders junction OR returns { skipped: true } when no
 *      eligible orders / already exists.
 *   2. RPC transition_tax_invoice_state_as_system(.., 'signing') — sets
 *      signing_started_at for reconcile cron pickup.
 *   3. provider.createInvoice(line_items_for_provider).
 *   4. Map provider result → next state + RPC transition signing →
 *      issued/submitted/draft. 'signing' result = stay (provider async,
 *      reconcile cron resolves later).
 *   5. UPDATE tax_invoices.{invoice_number, provider_ref}.
 *   6. UPDATE summary_run_queue with final status + tax_invoice_id.
 *
 * Caller MUST INSERT the summary_run_queue row before calling this and pass
 * its id as queueId. This separation is intentional: cron + manual record
 * different trigger_source/triggered_by values, but the post-insert flow is
 * identical.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@comtammatu/database";
import {
  BUYER_NOT_GET_INVOICE_NAME,
  type InvoiceProvider,
} from "@comtammatu/shared/providers";

interface BatchLineItem {
  name: string;
  unit: string;
  quantity: number;
  unit_price: number;
  amount: number;
  vat_rate: number;
  vat_amount: number;
}

interface AggregateResult {
  skipped?: boolean;
  reason?: string;
  tax_invoice_id?: number;
  order_count?: number;
  subtotal?: number;
  vat_amount?: number;
  total_amount?: number;
  header_vat_rate?: number;
  line_items_for_provider?: BatchLineItem[];
}

export interface SummaryRunDeps {
  supabase: SupabaseClient<Database>;
  provider: InvoiceProvider;
  branchId: number;
  summaryDate: string;
  queueId: number;
}

export interface SummaryRunOutcome {
  outcome: "issued" | "submitted" | "failed" | "skipped";
  taxInvoiceId: number | null;
  /** Internal reason / provider error code for queue.last_error and logs. */
  error: string | null;
}

export async function executeSummaryRun(
  deps: SummaryRunDeps,
): Promise<SummaryRunOutcome> {
  const { supabase, provider, branchId, summaryDate, queueId } = deps;

  const updateQueue = async (
    status: "issued" | "failed" | "skipped",
    fields: {
      taxInvoiceId?: number | null;
      error?: string | null;
    } = {},
  ): Promise<void> => {
    await supabase
      .from("summary_run_queue")
      .update({
        status,
        last_error: fields.error ?? null,
        tax_invoice_id: fields.taxInvoiceId ?? null,
        finished_at: new Date().toISOString(),
      })
      .eq("id", queueId);
  };

  try {
    const { data: aggData, error: aggErr } = await supabase.rpc(
      "aggregate_daily_b2c_invoice",
      { p_branch_id: branchId, p_summary_date: summaryDate },
    );

    if (aggErr) {
      const msg = aggErr.message ?? "aggregate_rpc_error";
      await updateQueue("failed", { error: msg });
      return { outcome: "failed", taxInvoiceId: null, error: msg };
    }

    const result = (aggData ?? {}) as AggregateResult;

    if (result.skipped) {
      const reason = result.reason ?? null;
      const taxInvoiceId = result.tax_invoice_id ?? null;
      await updateQueue("skipped", { taxInvoiceId, error: reason });
      return { outcome: "skipped", taxInvoiceId, error: reason };
    }

    const invoiceId = result.tax_invoice_id;
    const lineItems = result.line_items_for_provider ?? [];

    if (!invoiceId || lineItems.length === 0) {
      const msg = "rpc_returned_invalid_payload";
      await updateQueue("failed", { error: msg });
      return { outcome: "failed", taxInvoiceId: null, error: msg };
    }

    // Transition draft → signing
    const { error: signErr } = await supabase.rpc(
      "transition_tax_invoice_state_as_system",
      {
        p_tax_invoice_id: invoiceId,
        p_to_status: "signing",
        p_payload: { provider: provider.name },
      },
    );
    if (signErr) {
      const msg = signErr.message ?? "transition_signing_failed";
      await updateQueue("failed", { taxInvoiceId: invoiceId, error: msg });
      return { outcome: "failed", taxInvoiceId: invoiceId, error: msg };
    }

    // Call Viettel S-invoice provider
    const providerResult = await provider.createInvoice({
      orderId: invoiceId,
      orderNumber: `SUMMARY-${branchId}-${summaryDate}`,
      sellerName: "",
      sellerTaxCode: process.env["COMPANY_TAX_CODE"] ?? "",
      sellerAddress: "",
      buyerName: BUYER_NOT_GET_INVOICE_NAME,
      buyerNotGetInvoice: true,
      buyerTaxCode: undefined,
      buyerAddress: undefined,
      items: lineItems.map((li) => ({
        name: li.name,
        unit: li.unit,
        quantity: li.quantity,
        unitPrice: li.unit_price,
        amount: li.amount,
      })),
      subtotal: result.subtotal ?? 0,
      vatRate: result.header_vat_rate ?? 8,
      vatAmount: result.vat_amount ?? 0,
      totalAmount: result.total_amount ?? 0,
    });

    const isFailure = providerResult.status === "failed";
    const nextStatus: "issued" | "submitted" | "draft" | null =
      providerResult.status === "issued"
        ? "issued"
        : providerResult.status === "submitted"
          ? "submitted"
          : providerResult.status === "signing"
            ? null
            : "draft";

    // JSON round-trip returns `any` which matches Supabase's Json type for
    // RPC payload — explicit narrowing to Record breaks the Json union.
    const providerDataPayload = providerResult.providerData
      ? JSON.parse(JSON.stringify(providerResult.providerData))
      : null;

    if (nextStatus !== null) {
      const { error: finalErr } = await supabase.rpc(
        "transition_tax_invoice_state_as_system",
        isFailure
          ? {
              p_tax_invoice_id: invoiceId,
              p_to_status: nextStatus,
              p_payload: providerDataPayload,
              p_note: "Provider call failed",
            }
          : {
              p_tax_invoice_id: invoiceId,
              p_to_status: nextStatus,
              p_payload: providerDataPayload,
            },
      );
      if (finalErr) {
        const msg = finalErr.message ?? "transition_final_failed";
        await updateQueue("failed", {
          taxInvoiceId: invoiceId,
          error: msg,
        });
        return { outcome: "failed", taxInvoiceId: invoiceId, error: msg };
      }
    }

    if (providerResult.invoiceNumber || providerResult.providerRef) {
      await supabase
        .from("tax_invoices")
        .update({
          invoice_number: providerResult.invoiceNumber,
          provider_ref: providerResult.providerRef,
        })
        .eq("id", invoiceId);
    }

    if (isFailure) {
      await updateQueue("failed", {
        taxInvoiceId: invoiceId,
        error: "provider_call_failed",
      });
      return {
        outcome: "failed",
        taxInvoiceId: invoiceId,
        error: "provider_call_failed",
      };
    }

    const finalStatus = nextStatus ?? "signing";
    await updateQueue("issued", { taxInvoiceId: invoiceId });
    return {
      outcome: finalStatus === "submitted" ? "submitted" : "issued",
      taxInvoiceId: invoiceId,
      error: null,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown_error";
    await updateQueue("failed", { error: msg });
    return { outcome: "failed", taxInvoiceId: null, error: msg };
  }
}
