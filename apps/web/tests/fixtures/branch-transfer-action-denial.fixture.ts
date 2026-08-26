import assert from "node:assert/strict";
import { mock } from "node:test";

let rpcCalls = 0;
const authModule = new URL(
  "../../app/(protected)/inventory/_lib/auth.ts",
  import.meta.url,
);
const monetaryAccessModule = new URL(
  "../../lib/inventory/monetary-access.ts",
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
      userId: "transfer-denial-user",
    }),
    getAuthContextWithPermission: async () => null,
  },
});

mock.module(monetaryAccessModule.href, {
  namedExports: {
    loadInventoryMonetaryAccess: async () => ({
      purchasePrice: false,
      valuation: false,
      systemValuation: false,
      client: null,
    }),
  },
});

const { createStockTransfer } =
  await import("../../app/(protected)/inventory/transfer-actions.ts");

const destInitiated = await createStockTransfer({
  fromBranchId: 1,
  toBranchId: 7,
  toLocationKind: "default_receive",
  lines: [{ ingredientId: 10, quantity: 1 }],
});

assert.equal(destInitiated.success, false);
assert.equal(destInitiated.error, "Điểm vận hành không hợp lệ.");
assert.equal(rpcCalls, 1);

rpcCalls = 0;
const neitherSide = await createStockTransfer({
  fromBranchId: 1,
  toBranchId: 2,
  toLocationKind: "default_receive",
  lines: [{ ingredientId: 10, quantity: 1 }],
});

assert.deepEqual(neitherSide, {
  success: false,
  error:
    "Bạn chỉ được tạo hoặc xuất Điều chuyển từ chi nhánh của mình, hoặc xin hàng về chi nhánh của mình.",
});
assert.equal(rpcCalls, 0);
