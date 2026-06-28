import type { ActionResult } from "@comtammatu/shared/types";

/**
 * Active per-order tax-invoice query, extracted from resolveExistingInvoiceForOrder
 * so it can be BEHAVIORALLY tested with a mock client. The public
 * resolveExistingInvoiceForOrder is a "use server" action whose Supabase client
 * comes from auth context and cannot be injected, so the client-using core lives
 * here and takes the client as a (structurally-typed) parameter. The real
 * `ctx.supabase` and the test mock both satisfy InvoiceQueryClient.
 *
 * The filter mirrors createTaxInvoice's existing-invoice check exactly
 * (cancelled/replaced/not_required excluded) — keep them in lockstep.
 */

export type ActiveInvoiceRow = {
  id: number;
  invoice_number: string | null;
  status: string | null;
};

type InvoiceQueryBuilder = {
  eq(column: string, value: string | number): InvoiceQueryBuilder;
  not(column: string, operator: string, value: string): InvoiceQueryBuilder;
  maybeSingle(): PromiseLike<{
    data: ActiveInvoiceRow | null;
    error: unknown;
  }>;
};

export type InvoiceQueryClient = {
  from(table: string): { select(columns: string): InvoiceQueryBuilder };
};

export async function queryActiveInvoiceForOrder(
  client: InvoiceQueryClient,
  tenantId: number,
  orderId: number,
): Promise<ActionResult<ActiveInvoiceRow | null>> {
  const { data, error } = await client
    .from("tax_invoices")
    .select("id, status, invoice_number")
    .eq("order_id", orderId)
    .eq("tenant_id", tenantId)
    .not("status", "in", '("cancelled","replaced","not_required")')
    .maybeSingle();

  if (error) {
    return { success: false, error: "Không thể kiểm tra hóa đơn." };
  }
  return { success: true, data: data ?? null };
}
