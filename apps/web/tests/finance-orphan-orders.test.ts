import assert from "node:assert/strict";
import { test } from "node:test";
import {
  queryOrphanPaidOrders,
  type OrphanQueryClient,
} from "../app/(protected)/finance/_lib/orphan-orders";

// Behavioral (executed) cover for the orphan-issue read action's include/exclude
// logic. fetchOrphanPaidOrders is a "use server" fn whose Supabase client comes
// from auth context and cannot be injected, so the two-query set-difference core
// lives in an extracted seam (mirrors invoice-queries.ts). This EXECUTES the seam
// against a tiny mock client instead of scanning source, so a regression in the
// eligible predicate (mirroring aggregate_daily_b2c_invoice) fails here. The
// mock records the filters each query applied so we can also pin the predicate.

type Row = Record<string, unknown>;
type TableResponse = { data: Row[]; error: unknown };

interface RecordedQuery {
  table: string;
  eq: Array<[string, string | number]>;
  not: Array<[string, string, string]>;
  in: Array<[string, readonly (string | number)[]]>;
}

/**
 * Purpose-built mock of the chainable surface queryOrphanPaidOrders uses
 * (`.select().eq().not().in().order().limit()` where `.limit()` is awaitable).
 * Returns a fixed response per table and records the applied filters.
 */
function mockClient(responses: Record<string, TableResponse>): {
  client: OrphanQueryClient;
  queries: RecordedQuery[];
} {
  const queries: RecordedQuery[] = [];
  const client: OrphanQueryClient = {
    from(table: string) {
      const q: RecordedQuery = { table, eq: [], not: [], in: [] };
      const builder = {
        select() {
          return builder;
        },
        eq(column: string, value: string | number) {
          q.eq.push([column, value]);
          return builder;
        },
        not(column: string, operator: string, value: string) {
          q.not.push([column, operator, value]);
          return builder;
        },
        in(column: string, values: readonly string[] | readonly number[]) {
          q.in.push([column, values]);
          return builder;
        },
        order() {
          return builder;
        },
        limit() {
          queries.push(q);
          const res = responses[table] ?? { data: [], error: null };
          return Promise.resolve({ data: res.data, error: res.error });
        },
      };
      return { select: builder.select.bind(builder) } as unknown as ReturnType<
        OrphanQueryClient["from"]
      >;
    },
  };
  return { client, queries };
}

const CANDIDATES: Row[] = [
  // paid, no invoice → INCLUDED
  {
    id: 8338,
    order_number: "TC-260705-060-PH",
    total_amount: "150000.00",
    branch_id: 7,
    created_at: "2026-07-05T03:00:00Z",
  },
  // paid, but has an active per-order invoice → EXCLUDED
  {
    id: 8001,
    order_number: "TC-260705-001-AA",
    total_amount: "90000.00",
    branch_id: 7,
    created_at: "2026-07-05T02:00:00Z",
  },
  // paid, but folded into an active summary junction → EXCLUDED
  {
    id: 8002,
    order_number: "TC-260705-002-BB",
    total_amount: "80000.00",
    branch_id: 7,
    created_at: "2026-07-05T01:00:00Z",
  },
  // paid, only a cancelled summary junction → still INCLUDED (re-eligible)
  {
    id: 8003,
    order_number: "TC-260705-003-CC",
    total_amount: "70000.00",
    branch_id: 7,
    created_at: "2026-07-05T00:30:00Z",
  },
];

function orphanClient() {
  return mockClient({
    // The candidate query already excludes unpaid + cancelled/refunded at the DB
    // via .eq/.not — the seam trusts that predicate. We assert those filters below.
    orders: { data: CANDIDATES, error: null },
    tax_invoices: {
      // active per-order invoice for order 8001 only
      data: [{ order_id: 8001 }],
      error: null,
    },
    tax_invoice_orders: {
      data: [
        // 8002 folded into an ACTIVE (issued) summary → exclude
        { order_id: 8002, tax_invoices: { status: "issued" } },
        // 8003 only in a CANCELLED summary → do NOT exclude
        { order_id: 8003, tax_invoices: { status: "cancelled" } },
      ],
      error: null,
    },
  });
}

test("includes a paid order with no active HĐĐT, excludes per-order-invoiced and summary-folded", async () => {
  const { client } = orphanClient();
  const res = await queryOrphanPaidOrders(client, 12, 7);

  assert.equal(res.success, true);
  const ids = (res.data ?? []).map((r) => r.id).sort((a, b) => a - b);
  // 8338 (no invoice) + 8003 (cancelled summary only) survive; 8001/8002 excluded.
  assert.deepEqual(ids, [8003, 8338]);
});

test("maps the returned row shape the worklist needs (order_number, order_day, total_amount, branch_id)", async () => {
  const { client } = orphanClient();
  const res = await queryOrphanPaidOrders(client, 12, 7);
  const row = (res.data ?? []).find((r) => r.id === 8338);
  assert.deepEqual(row, {
    id: 8338,
    order_number: "TC-260705-060-PH",
    order_day: "2026-07-05",
    total_amount: 150000,
    branch_id: 7,
  });
});

test("candidate query applies the exact eligible predicate (paid, not cancelled/refunded, tenant+branch scoped)", async () => {
  const { client, queries } = orphanClient();
  await queryOrphanPaidOrders(client, 12, 7);

  const ordersQuery = queries.find((q) => q.table === "orders");
  assert.ok(ordersQuery, "orders candidate query ran");
  // payment_status='paid' + tenant + branch scope on eq.
  assert.deepEqual(ordersQuery?.eq, [
    ["tenant_id", 12],
    ["payment_status", "paid"],
    ["branch_id", 7],
  ]);
  // status NOT IN (cancelled, refunded).
  assert.deepEqual(ordersQuery?.not, [
    ["status", "in", '("cancelled","refunded")'],
  ]);
});

test("per-order invoice query filters to active states only (draft/signing/submitted/issued)", async () => {
  const { client, queries } = orphanClient();
  await queryOrphanPaidOrders(client, 12, 7);

  const invoiceQuery = queries.find((q) => q.table === "tax_invoices");
  assert.ok(invoiceQuery, "per-order invoice query ran");
  const statusIn = invoiceQuery?.in.find(([col]) => col === "status");
  assert.deepEqual(statusIn?.[1], ["draft", "signing", "submitted", "issued"]);
});

test("owner branch scope (null) omits the branch_id filter on the candidate query", async () => {
  const { client, queries } = orphanClient();
  await queryOrphanPaidOrders(client, 12, null);

  const ordersQuery = queries.find((q) => q.table === "orders");
  const branchEq = ordersQuery?.eq.find(([col]) => col === "branch_id");
  assert.equal(branchEq, undefined);
});

test("no candidate paid orders short-circuits to an empty list without invoice queries", async () => {
  const { client, queries } = mockClient({
    orders: { data: [], error: null },
  });
  const res = await queryOrphanPaidOrders(client, 12, 7);
  assert.deepEqual(res, { success: true, data: [] });
  // Only the candidate query ran — no invoice lookups when there is nothing to check.
  assert.deepEqual(
    queries.map((q) => q.table),
    ["orders"],
  );
});

test("a candidate-query error returns a sanitized failure (no raw message, no silent empty)", async () => {
  const { client } = mockClient({
    orders: {
      data: [],
      error: { message: "permission denied for table orders" },
    },
  });
  const res = await queryOrphanPaidOrders(client, 12, 7);
  assert.equal(res.success, false);
  assert.equal(res.error, "Không thể tải danh sách đơn.");
});
