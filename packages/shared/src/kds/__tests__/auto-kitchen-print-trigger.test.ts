import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "../../../../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

// The granular KDS-print migrations were squashed into the lean baseline.
// Assert against the canonical baseline artifact.
const baselinePath = "supabase/migrations/00000000000000_baseline.sql";

test("KDS ticket creation does not auto-enqueue kitchen print jobs", () => {
  const src = read(baselinePath);

  // The retired auto-print-on-ticket-creation trigger/function must not exist
  // in the lean baseline (paper prints are deferred to KDS completion).
  assert.doesNotMatch(
    src,
    /CREATE CONSTRAINT TRIGGER trg_auto_enqueue_kitchen_print_from_ticket/,
    "lean baseline must not recreate the auto-print trigger",
  );
  assert.doesNotMatch(
    src,
    /CREATE (OR REPLACE )?FUNCTION public\.auto_enqueue_kitchen_print_from_ticket/,
    "retired auto-print trigger function must be absent",
  );
  assert.match(
    src,
    /CREATE (OR REPLACE )?FUNCTION public\.enqueue_kitchen_print/,
    "public POS-era RPC should remain as compatibility wrapper",
  );
  assert.match(
    src,
    /'deferred_to',\s+'kds_completion'/,
    "compatibility wrapper must defer paper printing to KDS completion",
  );
});

test("KDS completion print helper is scoped to completed ticket ids", () => {
  const src = read(baselinePath);

  assert.match(
    src,
    /CREATE (OR REPLACE )?FUNCTION private\.enqueue_kitchen_completion_print_internal/,
    "baseline must carry a private completion-print helper",
  );
  assert.match(
    src,
    /UPDATE public\.order_items[\s\S]*SET sent_to_kitchen_at = COALESCE\(sent_to_kitchen_at, now\(\)\)/,
    "completion print must advance the existing print cursor only for printed items",
  );
});

test("complete_kds_tickets atomically queues prints for tickets it actually completed", () => {
  const src = read(baselinePath);

  assert.match(
    src,
    /CREATE (OR REPLACE )?FUNCTION public\.complete_kds_tickets/,
    "baseline must define the KDS completion RPC",
  );
  assert.match(
    src,
    /private\.enqueue_kitchen_completion_print_internal\(/,
    "RPC must enqueue paper from the updated ticket ids inside the same transaction",
  );
  assert.match(
    src,
    /'print_warning', v_print_warning/,
    "RPC result must expose safe print warning metadata to KDS UI",
  );
});

test("POS actions do not revive broad kitchen paper enqueueing", () => {
  const orderActions = read(
    "apps/web/app/(protected)/br/[branchId]/pos/order-actions.ts",
  );
  const printActions = read(
    "apps/web/app/(protected)/br/[branchId]/pos/print-actions.ts",
  );

  assert.doesNotMatch(
    orderActions,
    /enqueue_kitchen_print|autoSendKitchen|kitchenSent|kitchenWarning/,
    "POS create/append must not call the old broad kitchen print RPC",
  );
  assert.doesNotMatch(
    printActions,
    /enqueue_kitchen_print/,
    "manual POS send action must not call the old broad kitchen print RPC",
  );
  assert.match(
    printActions,
    /deferred_to: "kds_completion"/,
    "manual POS send action must preserve compatibility while deferring paper",
  );
});
