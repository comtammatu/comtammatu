import assert from "node:assert/strict";
import { mock } from "node:test";

let rpcCalls = 0;
const authModule = new URL(
  "../../app/(protected)/inventory/_lib/auth.ts",
  import.meta.url,
);

mock.module(authModule.href, {
  namedExports: {
    getAuthContext: async () => ({
      claims: {
        tenant_id: 1,
        branch_id: 7,
        user_role: "branch_manager",
      },
      supabase: {
        rpc: async () => {
          rpcCalls += 1;
          return { data: null, error: null };
        },
      },
      user: {},
    }),
    getAuthContextWithPermission: async () => null,
  },
});

const { createStockTransfer } =
  await import("../../app/(protected)/inventory/transfer-actions.ts");
const result = await createStockTransfer({
  fromBranchId: 1,
  toBranchId: 7,
  toLocationKind: "default_receive",
  lines: [{ ingredientId: 10, quantity: 1 }],
});

assert.deepEqual(result, {
  success: false,
  error: "Quản lý chi nhánh chỉ được nhận phiếu chuyển về chi nhánh.",
});
assert.equal(rpcCalls, 0);
