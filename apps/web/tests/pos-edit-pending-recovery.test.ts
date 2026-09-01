import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { mapRpcError } from "../app/_lib/rpc-error-map";
import {
  editRpcFallback,
  editRpcMappings,
} from "../app/(protected)/br/[branchId]/pos/_lib/messages";
import { POS_ERROR_CODES } from "../app/(protected)/br/[branchId]/pos/_utils/error-codes";

function readRepo(path: string): string {
  return readFileSync(join(process.cwd(), "../..", path), "utf8");
}

test("stale pending-item edits map to a dedicated recovery error", () => {
  const result = mapRpcError(
    { message: "item not editable", code: "22023" },
    editRpcMappings,
    editRpcFallback,
  );

  assert.equal(result.success, false);
  assert.equal(result.errorCode, POS_ERROR_CODES.ITEM_NOT_EDITABLE);
  assert.equal(
    result.error,
    "Món đã được bếp xử lý. Hãy kiểm tra lại đơn trước khi thao tác tiếp.",
  );
});

test("paid-order errors do not false-match the ready item sentinel", () => {
  const result = mapRpcError(
    { message: "order already paid", code: "22023" },
    editRpcMappings,
    editRpcFallback,
  );

  assert.equal(result.success, false);
  assert.equal(result.errorCode, POS_ERROR_CODES.RPC_GENERIC);
  assert.equal(result.error, "Đơn đã thanh toán, không thể sửa món.");
});

test("POS closes the stale editor and refreshes the reopened order detail", () => {
  const source = readRepo(
    "apps/web/app/(protected)/br/[branchId]/pos/pos-desktop-inner.tsx",
  );
  const recoveryStart = source.indexOf(
    "r.errorCode === POS_ERROR_CODES.ITEM_NOT_EDITABLE",
  );
  const recoveryEnd = source.indexOf("} else {", recoveryStart);

  assert.ok(recoveryStart >= 0, "stale-edit recovery branch must exist");
  assert.ok(recoveryEnd > recoveryStart, "recovery branch must be bounded");

  const recovery = source.slice(recoveryStart, recoveryEnd);
  assert.match(recovery, /void refreshOperational\(\);/);
  assert.match(recovery, /closeCustomizerAndMaybeReopenDetail\(\);/);
});
