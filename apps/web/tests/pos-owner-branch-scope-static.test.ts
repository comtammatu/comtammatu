import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

function readSource(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function listSourceFiles(dir: string): string[] {
  const root = join(process.cwd(), dir);
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return listSourceFiles(path);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

test("POS branch-scope helper admits owner across branch IDs", () => {
  const authSource = readSource(
    "app/(protected)/br/[branchId]/pos/_lib/auth.ts",
  );

  assert.match(
    authSource,
    /export function isPosBranchInScope\([\s\S]*?return claims\.user_role === "owner" \|\| claims\.branch_id === branchId;/,
  );
});

test("POS server code does not reintroduce raw branch-claim rejects", () => {
  const files = listSourceFiles("app/(protected)/br/[branchId]/pos");

  for (const file of files) {
    assert.doesNotMatch(
      readSource(file),
      /\b(?:ctx\.)?claims\.branch_id\s*!==/,
      `${file} must route POS branch checks through isPosBranchInScope`,
    );
  }
});

test("POS cash payment uses route branch scope instead of rejecting owner null-branch claims", () => {
  const actionSource = readSource(
    "app/(protected)/br/[branchId]/pos/payment-actions.ts",
  );
  const schemaSource = readSource(
    "app/(protected)/br/[branchId]/pos/_lib/payment-schemas.ts",
  );
  const billSource = readSource(
    "app/(protected)/br/[branchId]/pos/_components/bill/bill-receipt-sheet.tsx",
  );

  assert.match(schemaSource, /branchId: z\.coerce\s*\.number\(\)/);

  const cashActionBlock = actionSource.slice(
    actionSource.indexOf("export const confirmCashPayment"),
    actionSource.indexOf("/* ─── Cash payment + mandatory HĐĐT issuance"),
  );
  assert.match(
    cashActionBlock,
    /argsToInput: \(branchId: number, orderId: number, cashReceived: number\) => \(\{/,
  );
  assert.match(cashActionBlock, /if \(!isPosBranchInScope\(claims, branchId\)\)/);
  assert.doesNotMatch(cashActionBlock, /claims\.branch_id\s*===\s*null/);

  assert.match(
    actionSource,
    /export async function confirmCashPaymentWithInvoice\(\s*branchId: number,/,
  );
  assert.match(
    actionSource,
    /confirmCashPayment\(branchId, orderId, cashReceived\)/,
  );
  assert.match(
    billSource,
    /confirmCashPaymentWithInvoice\(\s*branchId,\s*orderId,\s*cashReceived,/,
  );
});
