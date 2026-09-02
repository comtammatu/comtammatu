import { readSql } from "./_lib/active-sql.ts";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const read = (path: string) =>
  String(path).includes("supabase/migrations/")
    ? readSql(process.cwd(), String(path).replace(/^.*?(supabase\/)/, "supabase/"))
    : readFileSync(join(process.cwd(), path), "utf8");

test("long notes stay contained across self-order, POS, and KDS", () => {
  const selfOrderSummary = read("app/q/[token]/self-order/order-summary.tsx");
  const posLineItem = read(
    "app/(protected)/br/[branchId]/pos/_components/pos-line-item-compact.tsx",
  );
  const selfOrderApproval = read(
    "app/(protected)/br/[branchId]/pos/_components/self-order-approval-sheet.tsx",
  );
  const kdsOrderNote = read(
    "app/(protected)/br/[branchId]/kds/_components/order-note.tsx",
  );
  const kdsItemMeta = read(
    "app/(protected)/br/[branchId]/kds/_components/ticket-row-meta.tsx",
  );

  assert.match(selfOrderSummary, /max-h-20 overflow-y-auto break-words pr-1/);
  assert.match(
    posLineItem,
    /max-h-20 min-w-0 overflow-y-auto break-words pr-1 text-sm italic/,
  );
  assert.doesNotMatch(posLineItem, /title=\{note\}|line-clamp/);
  assert.match(selfOrderApproval, /max-h-16 overflow-y-auto break-words pr-1/);
  assert.match(selfOrderApproval, /max-h-24 overflow-y-auto break-words pr-1/);
  assert.match(kdsOrderNote, /overflow-y-auto break-words pr-1/);
  assert.match(kdsOrderNote, /max-h-20 text-sm/);
  assert.match(kdsOrderNote, /max-h-32 text-base/);
  assert.match(kdsItemMeta, /max-h-16 min-w-0 overflow-y-auto break-words pr-1/);
  assert.match(kdsItemMeta, /max-h-20 min-w-0 overflow-y-auto break-words pr-1/);
  assert.doesNotMatch(kdsOrderNote, /line-clamp|overflow-hidden/);
});
