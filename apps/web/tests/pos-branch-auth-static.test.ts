import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

function readAppFile(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const schemasSource = readAppFile(
  "app/(protected)/br/[branchId]/pos/_lib/schemas.ts",
);
const lifecycleSource = readAppFile(
  "app/(protected)/br/[branchId]/pos/order-lifecycle.ts",
);
const adjustActionsSource = readAppFile(
  "app/(protected)/br/[branchId]/pos/order-adjust-actions.ts",
);
const detailSheetSource = readAppFile(
  "app/(protected)/br/[branchId]/pos/order-detail-sheet.tsx",
);

test("POS ID-only lifecycle actions carry branchId into custom auth", () => {
  assert.match(
    schemasSource,
    /export const transferTableSchema = z\.object\(\{[\s\S]*?branchId: z\.coerce[\s\S]*?orderId:/,
  );
  assert.match(
    schemasSource,
    /export const markOrderItemServedSchema = z\.object\(\{[\s\S]*?branchId: z\.coerce[\s\S]*?itemId:/,
  );
  assert.match(
    adjustActionsSource,
    /argsToInput: \(\s*branchId: number,\s*orderId: number,\s*newTableId: number,\s*idempotencyKey\?: string,\s*\) => \(\{ branchId, orderId, newTableId, idempotencyKey \}\)/,
  );
  assert.match(
    lifecycleSource,
    /argsToInput: \(branchId: number, itemId: number\) => \(\{ branchId, itemId \}\)/,
  );
  assert.match(
    detailSheetSource,
    /transferOrderTable\(\s*branchId,\s*orderId,\s*tid,\s*idempotencyKey,\s*\)/,
  );
  assert.match(
    detailSheetSource,
    /markOrderItemServed\(branchId, itemId\)/,
  );
});
