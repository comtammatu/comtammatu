import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, test } from "node:test";

import {
  insufficientStockFailure,
  mapInventoryRpcFailure,
  parseInsufficientStockIngredientId,
} from "../app/(protected)/inventory/_lib/rpc-failure";
import { applyInventoryActionError } from "../lib/inventory/apply-inventory-action-error";
import {
  INVENTORY_ERROR_CODES,
  transferShipRpcFallback,
  transferShipRpcMappings,
  wasteCreateRpcFallback,
  wasteCreateRpcMappings,
} from "../lib/messages/inventory-rpc-errors";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

describe("parseInsufficientStockIngredientId", () => {
  test("parses common inventory shortage sentinels", () => {
    assert.equal(parseInsufficientStockIngredientId("insufficient_stock:42"), 42);
    assert.equal(parseInsufficientStockIngredientId("insufficient_stock_42"), 42);
    assert.equal(
      parseInsufficientStockIngredientId("insufficient_stock_for_42"),
      42,
    );
    assert.equal(
      parseInsufficientStockIngredientId("insufficient_stock_ingredient:42"),
      42,
    );
    assert.equal(
      parseInsufficientStockIngredientId("insufficient_source_stock:42"),
      42,
    );
    assert.equal(parseInsufficientStockIngredientId("insufficient_stock"), null);
    assert.equal(parseInsufficientStockIngredientId(null), null);
  });
});

describe("mapInventoryRpcFailure", () => {
  test("attaches meta.ingredientId for shortage sentinels", () => {
    const result = mapInventoryRpcFailure(
      { message: "insufficient_stock:7", code: "P0001" },
      transferShipRpcMappings,
      transferShipRpcFallback,
      { ingredientNameById: new Map([[7, "Gạo tấm"]]) },
    );
    assert.equal(result.success, false);
    assert.equal(result.errorCode, INVENTORY_ERROR_CODES.INSUFFICIENT_STOCK);
    assert.equal(result.error, "Tồn kho không đủ: Gạo tấm.");
    assert.deepEqual(result.meta, {
      ingredientId: 7,
      field: "quantity",
    });
  });

  test("maps status failures without line meta", () => {
    const result = mapInventoryRpcFailure(
      { message: "invalid_status for transfer", code: "P0001" },
      transferShipRpcMappings,
      transferShipRpcFallback,
    );
    assert.equal(result.success, false);
    assert.equal(result.errorCode, INVENTORY_ERROR_CODES.INVALID_STATUS);
    assert.equal(result.meta, undefined);
  });

  test("maps the waste tier photo sentinel without treating permission errors as evidence", () => {
    const evidence = mapInventoryRpcFailure(
      {
        message:
          "waste photo required for tier >= 1 (reason=spoiled, value=128902.40, qty_ratio=1.0000)",
        code: "22023",
      },
      wasteCreateRpcMappings,
      wasteCreateRpcFallback,
    );
    assert.equal(
      evidence.errorCode,
      INVENTORY_ERROR_CODES.WASTE_EVIDENCE_REQUIRED,
    );

    const forbidden = mapInventoryRpcFailure(
      { message: "forbidden", code: "42501" },
      wasteCreateRpcMappings,
      wasteCreateRpcFallback,
    );
    assert.equal(forbidden.errorCode, INVENTORY_ERROR_CODES.FORBIDDEN);
  });

  test("maps the manual writeoff photo sentinel", () => {
    const evidence = mapInventoryRpcFailure(
      { message: "waste_photo_required", code: "22023" },
      wasteCreateRpcMappings,
      wasteCreateRpcFallback,
    );
    assert.equal(
      evidence.errorCode,
      INVENTORY_ERROR_CODES.WASTE_EVIDENCE_REQUIRED,
    );
  });
});

describe("insufficientStockFailure + applyInventoryActionError", () => {
  test("client helper extracts line target", () => {
    const failure = insufficientStockFailure(9, { ingredientName: "Sườn" });
    const applied = applyInventoryActionError(
      failure,
      "Không thể cập nhật phiếu.",
    );
    assert.equal(applied.toastMessage, "Tồn kho không đủ: Sườn.");
    assert.deepEqual(applied.lineTarget, {
      ingredientId: 9,
      field: "quantity",
    });
  });
});

test("inventory mutation actions import mapInventoryRpcFailure", () => {
  const files = [
    "apps/web/app/(protected)/inventory/transfer-actions.ts",
    "apps/web/app/(protected)/inventory/waste-actions.ts",
    "apps/web/app/(protected)/inventory/stocktake-actions.ts",
    "apps/web/app/(protected)/inventory/issue-actions.ts",
    "apps/web/app/(protected)/inventory/grn-actions.ts",
    "apps/web/app/(protected)/inventory/purchase-order-actions.ts",
    "apps/web/app/(protected)/inventory/production-run-actions.ts",
  ];
  for (const file of files) {
    const src = read(file);
    assert.match(
      src,
      /mapInventoryRpcFailure|from "\.\/_lib\/rpc-failure"|from "@\/_lib\/rpc-error-map"/,
      `${file} must route RPC errors through inventory mapper helpers`,
    );
  }

  const frozenYch = read(
    "apps/web/app/(protected)/inventory/stock-request-actions.ts",
  );
  assert.match(frozenYch, /ychWriteFrozen/);
  assert.doesNotMatch(frozenYch, /"save_stock_request"/);
  assert.doesNotMatch(frozenYch, /"fulfill_stock_request_lines"/);
});
