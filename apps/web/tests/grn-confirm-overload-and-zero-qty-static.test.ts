import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { mapRpcError } from "../app/_lib/rpc-error-map";
import {
  grnConfirmRpcMappings,
  INVENTORY_ERROR_CODES,
} from "../lib/messages/inventory-rpc-errors";

const root = process.cwd().replaceAll("\\", "/").includes("apps/web")
  ? join(process.cwd(), "../..")
  : process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

const migration = read(
  "supabase/migrations/20260822140500_fix_confirm_grn_overload_and_zero_qty_valuation.sql",
);

test("migration explicitly drops legacy 1-arg confirm_goods_receipt_note(bigint)", () => {
  assert.match(
    migration,
    /DROP FUNCTION IF EXISTS public\.confirm_goods_receipt_note\(bigint\);/,
  );
});

test("migration patches post_stock_movement_valuation with zero quantity guard", () => {
  assert.match(migration, /COALESCE\(NEW\.quantity_change, 0\) = 0/);
  assert.match(migration, /RETURN NEW;/);
});

test("migration defines confirm_goods_receipt_note(bigint, bigint) with accepted base check", () => {
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.confirm_goods_receipt_note\(\s*p_grn_id bigint,\s*p_supplier_id bigint DEFAULT NULL\s*\)/,
  );
  assert.match(migration, /IF v_accepted_base > 0 THEN/);
});

test("grnConfirmRpcMappings maps inventory_valuation_insufficient_quantity cleanly", () => {
  const result = mapRpcError(
    {
      code: "23514",
      message: "inventory_valuation_insufficient_quantity",
      details: null,
      hint: null,
    },
    grnConfirmRpcMappings,
    {
      userMessage: "Chốt phiếu nhập thất bại",
      errorCode: INVENTORY_ERROR_CODES.GRN_CONFIRM_FAILED,
    },
  );

  assert.equal(result.success, false);
  assert.equal(result.error, "Tồn kho hoặc giá vốn của nguyên liệu chưa đủ điều kiện hạch toán. Kiểm tra lại số lượng và đơn giá.");
  assert.equal(result.errorCode, INVENTORY_ERROR_CODES.INVALID_STATUS);
});
