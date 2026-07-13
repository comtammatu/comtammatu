import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "../../../../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

test("edit pending quantity migration enqueues kitchen-visible print deltas", () => {
  const src = read(
    "supabase/migration-archive/20260601790000_edit_pending_quantity_print.sql",
  );

  assert.match(
    src,
    /CREATE OR REPLACE FUNCTION public\.enqueue_edit_pending_order_item_quantity_print/,
    "missing edit-quantity print enqueue RPC",
  );
  assert.match(
    src,
    /p_new_quantity > p_old_quantity[\s\S]*'kitchen_ticket'/,
    "quantity increases must use kitchen_ticket",
  );
  assert.match(
    src,
    /'send_kind',\s+'append'/,
    "quantity increases must render as GỌI THÊM via send_kind=append",
  );
  assert.match(
    src,
    /v_delta := abs\(p_new_quantity - p_old_quantity\)/,
    "print payload must use delta quantity, not full new quantity",
  );
  assert.match(
    src,
    /p_new_quantity < p_old_quantity[\s\S]*'cancel_ticket'/,
    "quantity decreases must use cancel_ticket",
  );
  assert.match(
    src,
    /GIAM SL[\s\S]*p_old_quantity[\s\S]*p_new_quantity/,
    "decrease ticket must include old -> new quantity context",
  );
  assert.match(
    src,
    /TANG SL[\s\S]*p_old_quantity[\s\S]*p_new_quantity/,
    "increase ticket must include old -> new quantity context",
  );
  assert.match(
    src,
    /FROM public\.printer_menu_categories[\s\S]*JOIN public\.printer_print_types/,
    "print routing must use branch printer category/type routing",
  );
  assert.match(
    src,
    /v_item\.sent_to_kitchen_at IS NULL[\s\S]*'not_sent'/,
    "unsent items must not enqueue stale-paper correction tickets",
  );
  assert.match(
    src,
    /v_item\.updated_at[\s\S]*v_event_token[\s\S]*v_idempotency/,
    "idempotency must include the edited row version to allow later same-delta edits",
  );
});

test("POS edit action calls quantity print RPC and returns safe warnings", () => {
  const src = read(
    "apps/web/app/(protected)/br/[branchId]/pos/order-void-actions.ts",
  );

  assert.match(
    src,
    /wasSentToKitchen && quantityChanged[\s\S]*enqueue_edit_pending_order_item_quantity_print/,
    "editPendingOrderItem must enqueue print deltas for sent quantity edits",
  );
  assert.match(
    src,
    /quantityPrintQueued: boolean/,
    "server action result must tell UI when the kitchen notice was queued",
  );
  assert.match(
    src,
    /printWarning\?: string/,
    "server action result must surface non-fatal print failures safely",
  );
  assert.doesNotMatch(
    src,
    /return \{ success: false, error: String\(printError\.message/,
    "raw print RPC errors must not be returned to clients",
  );
});
