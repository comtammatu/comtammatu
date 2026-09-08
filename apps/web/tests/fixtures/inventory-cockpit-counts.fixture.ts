import assert from "node:assert/strict";
import { mock } from "node:test";

let allowed = true;
let response: { data?: unknown; count?: number | null; error: unknown } = {
  count: 0,
  error: null,
};
const calls: unknown[][] = [];
const query = Object.fromEntries(
  ["select", "eq", "gt", "in", "limit"].map((method) => [
    method,
    (...args: unknown[]) => {
      calls.push([method, ...args]);
      return query;
    },
  ]),
) as Record<string, unknown> & PromiseLike<typeof response>;
query.then = (resolve, reject) =>
  Promise.resolve(response).then(resolve, reject);
const context = {
  claims: { tenant_id: 29, branch_id: 73, user_role: "central_supply_ops" },
  supabase: {
    from: (table: string) => {
      calls.push(["from", table]);
      return query;
    },
    rpc: (name: string, args: unknown) => {
      calls.push(["rpc", name, args]);
      return Promise.resolve(response);
    },
  },
};
mock.module(
  new URL("../../app/(protected)/inventory/_lib/auth.ts", import.meta.url).href,
  {
    namedExports: {
      getAuthContextWithPermission: async () => (allowed ? context : null),
      getAuthContextWithAnyPermission: async () => (allowed ? context : null),
    },
  },
);
const {
  countOpenGrns,
  countGrnsAwaitingUnitPrice,
  countPendingWasteApprovals,
  countOpenStockTransfers,
} = await import("../../app/(protected)/inventory/_lib/receiving-counts.ts");
const loaders = [
  countOpenGrns,
  countGrnsAwaitingUnitPrice,
  countPendingWasteApprovals,
  countOpenStockTransfers,
];
for (const load of loaders) {
  response = {
    count: 0,
    data: load === countOpenStockTransfers ? 0 : [],
    error: null,
  };
  calls.length = 0;
  assert.deepEqual(await load(73), { status: "ready", count: 0 });
  if (load === countOpenStockTransfers) {
    assert.deepEqual(calls, [
      ["rpc", "count_open_stock_transfers", { p_branch_id: 73 }],
    ]);
  } else {
    assert.ok(
      calls.some(
        (call) => call[0] === "eq" && call[1] === "tenant_id" && call[2] === 29,
      ),
    );
    assert.ok(
      calls.some(
        (call) =>
          call[0] === "eq" &&
          String(call[1]).endsWith("branch_id") &&
          call[2] === 73,
      ),
    );
  }
  response = {
    data: null,
    count: null,
    error: { message: "private database failure" },
  };
  assert.deepEqual(await load(73), { status: "unavailable" });
  response = { data: null, count: null, error: null };
  assert.deepEqual(await load(73), { status: "unavailable" });
  allowed = false;
  calls.length = 0;
  assert.deepEqual(await load(73), { status: "forbidden" });
  assert.equal(calls.length, 0);
  allowed = true;
}
const line = { grn_id: 97, unit_cost: null, unit_cost_unit_id: null };
response = {
  data: [line, line, { grn_id: 98, unit_cost: 15, unit_cost_unit_id: 4 }],
  count: 3,
  error: null,
};
assert.deepEqual(await countGrnsAwaitingUnitPrice(73), {
  status: "ready",
  count: 1,
});
response = { data: [line], count: 1200, error: null };
assert.deepEqual(await countGrnsAwaitingUnitPrice(73), {
  status: "unavailable",
});
