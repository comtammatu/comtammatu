import type { ActionResult } from "@comtammatu/shared/types";
import { getVNDateString } from "@comtammatu/shared/time";

/**
 * "Paid orders with no active HĐĐT" query, extracted from
 * fetchOrphanPaidOrders so it can be BEHAVIORALLY tested with a mock client.
 * The public action is a "use server" fn whose Supabase client comes from auth
 * context and cannot be injected, so the client-using core lives here and takes
 * the client as a (structurally-typed) parameter (mirrors invoice-queries.ts).
 *
 * The eligible predicate mirrors the canonical batch source
 * aggregate_daily_b2c_invoice (baseline.sql, § "Eligible orders"):
 *   orders.payment_status='paid' AND orders.status NOT IN ('cancelled','refunded')
 *   MINUS active per-order tax_invoices (status IN draft/signing/submitted/issued)
 *   MINUS active summary via tax_invoice_orders junction (ti.status NOT IN cancelled/replaced)
 *
 * Implemented as TWO queries + a TypeScript set-difference on purpose: a
 * PostgREST embed join of orders × tax_invoices trips the 42702 ambiguous
 * `branch_id` trap (both tables' RLS reference a bare branch_id), which a Server
 * Action swallows into a silently empty list. The candidate fetch and the
 * two active-invoice fetches never join orders to tax_invoices.
 */

export type OrphanOrderRow = {
  id: number;
  order_number: string;
  order_day: string;
  total_amount: number;
  branch_id: number;
};

type OrphanQueryBuilder = {
  select(columns: string): OrphanQueryBuilder;
  eq(column: string, value: string | number): OrphanQueryBuilder;
  not(column: string, operator: string, value: string): OrphanQueryBuilder;
  in(
    column: string,
    values: readonly string[] | readonly number[],
  ): OrphanQueryBuilder;
  order(
    column: string,
    options: { ascending: boolean },
  ): OrphanQueryBuilder;
  limit(count: number): PromiseLike<{ data: unknown[] | null; error: unknown }>;
};

export type OrphanQueryClient = {
  from(table: string): {
    select(columns: string): OrphanQueryBuilder;
  };
};

type CandidateRow = {
  id: number;
  order_number: string | null;
  total_amount: number | string | null;
  branch_id: number;
  created_at: string;
};

type PerOrderInvoiceRow = { order_id: number | null };

type SummaryJunctionRow = {
  order_id: number | null;
  tax_invoices: { status: string | null } | { status: string | null }[] | null;
};

const ACTIVE_PER_ORDER_STATES = ["draft", "signing", "submitted", "issued"];
const INACTIVE_SUMMARY_STATES = ["cancelled", "replaced"];
const CANDIDATE_LIMIT = 200;

/**
 * Resolve the set of paid orders that still need a per-order HĐĐT, newest first.
 * `tenantId`/`branchId` scope the candidate fetch; `branchId` null = every branch
 * the caller may read (caller pre-resolves branch scope from auth).
 */
export async function queryOrphanPaidOrders(
  client: OrphanQueryClient,
  tenantId: number,
  branchId: number | null,
): Promise<ActionResult<OrphanOrderRow[]>> {
  // Query 1 — candidate paid orders (no join to tax_invoices → dodges 42702).
  let candidateQuery = client
    .from("orders")
    .select("id, order_number, total_amount, branch_id, created_at")
    .eq("tenant_id", tenantId)
    .eq("payment_status", "paid")
    .not("status", "in", '("cancelled","refunded")');
  if (branchId != null) {
    candidateQuery = candidateQuery.eq("branch_id", branchId);
  }
  const { data: candidateData, error: candidateError } = await candidateQuery
    .order("created_at", { ascending: false })
    .limit(CANDIDATE_LIMIT);

  if (candidateError) {
    return { success: false, error: "Không thể tải danh sách đơn." };
  }

  const candidates = (candidateData ?? []) as CandidateRow[];
  if (candidates.length === 0) {
    return { success: true, data: [] };
  }

  const candidateIds = candidates.map((row) => row.id);

  // Query 2a — active per-order invoices for the candidate ids.
  const { data: perOrderData, error: perOrderError } = await client
    .from("tax_invoices")
    .select("order_id")
    .eq("tenant_id", tenantId)
    .in("order_id", candidateIds)
    .in("status", ACTIVE_PER_ORDER_STATES)
    .order("order_id", { ascending: true })
    .limit(CANDIDATE_LIMIT);

  if (perOrderError) {
    return { success: false, error: "Không thể tải trạng thái hóa đơn." };
  }

  // Query 2b — active summary junction for the candidate ids. This embed is
  // tax_invoice_orders × tax_invoices (NOT orders × tax_invoices), the same
  // shape createTaxInvoice's summary guard already runs safely, so it does not
  // hit the orders/tax_invoices bare-branch_id ambiguity.
  const { data: summaryData, error: summaryError } = await client
    .from("tax_invoice_orders")
    .select("order_id, tax_invoices(status)")
    .eq("tenant_id", tenantId)
    .in("order_id", candidateIds)
    .order("order_id", { ascending: true })
    .limit(CANDIDATE_LIMIT);

  if (summaryError) {
    return { success: false, error: "Không thể tải trạng thái hóa đơn." };
  }

  const excluded = new Set<number>();
  for (const row of (perOrderData ?? []) as PerOrderInvoiceRow[]) {
    if (row.order_id != null) excluded.add(row.order_id);
  }
  for (const row of (summaryData ?? []) as SummaryJunctionRow[]) {
    if (row.order_id == null) continue;
    const embed = row.tax_invoices;
    const status = Array.isArray(embed) ? embed[0]?.status : embed?.status;
    if (status != null && !INACTIVE_SUMMARY_STATES.includes(status)) {
      excluded.add(row.order_id);
    }
  }

  const orphans = candidates
    .filter((row) => !excluded.has(row.id))
    .map((row) => ({
      id: row.id,
      order_number: row.order_number ?? `#${row.id}`,
      order_day: getVNDateString(row.created_at),
      total_amount: Number(row.total_amount ?? 0),
      branch_id: row.branch_id,
    }));

  return { success: true, data: orphans };
}
