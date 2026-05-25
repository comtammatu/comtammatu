import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "../../../../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

test("KDS ticket batching auto-enqueues kitchen print jobs fail-soft", () => {
  const triggerSrc = read(
    "supabase/migrations/20260601910000_auto_enqueue_kitchen_print_from_kds_ticket.sql",
  );
  const fixSrc = read(
    "supabase/migrations/20260601920000_fix_kitchen_print_enqueue_trigger_path.sql",
  );

  assert.match(
    triggerSrc,
    /CREATE OR REPLACE FUNCTION public\.auto_enqueue_kitchen_print_from_ticket/,
    "migration must install the KDS-ticket print enqueue trigger function",
  );
  assert.match(
    triggerSrc,
    /NEW\.kitchen_send_batch_id IS NULL[\s\S]*RETURN NULL/,
    "tickets without a kitchen batch must not enqueue paper jobs",
  );
  assert.match(
    fixSrc,
    /CREATE OR REPLACE FUNCTION private\.enqueue_kitchen_print_internal/,
    "follow-up migration must install an ungranted internal enqueue helper",
  );
  assert.match(
    fixSrc,
    /EXCEPTION[\s\S]*WHEN OTHERS THEN[\s\S]*RETURN NULL/,
    "print enqueue failures must not roll back order or KDS creation",
  );
  assert.match(
    triggerSrc,
    /CREATE CONSTRAINT TRIGGER trg_auto_enqueue_kitchen_print_from_ticket[\s\S]*DEFERRABLE INITIALLY DEFERRED/,
    "trigger must run after all KDS ticket rows in the transaction are visible",
  );
  assert.match(
    triggerSrc,
    /AFTER INSERT OR UPDATE OF kitchen_send_batch_id[\s\S]*ON public\.kds_tickets/,
    "trigger must cover both newly routed tickets and tickets assigned to a batch later",
  );
  assert.match(
    fixSrc,
    /PERFORM private\.enqueue_kitchen_print_internal\(NEW\.order_id, NULL, FALSE\)/,
    "trigger must call the internal helper, not the public auth-gated wrapper",
  );
  assert.doesNotMatch(
    fixSrc,
    /PERFORM public\.enqueue_kitchen_print\(NEW\.order_id\)/,
    "trigger must not call the public auth-gated wrapper",
  );
  assert.match(
    fixSrc,
    /REVOKE ALL ON FUNCTION private\.enqueue_kitchen_print_internal\(BIGINT, UUID, BOOLEAN\)[\s\S]*FROM PUBLIC/,
    "internal helper must not be directly executable by public callers",
  );
  assert.match(
    fixSrc,
    /GRANT EXECUTE ON FUNCTION public\.enqueue_kitchen_print\(BIGINT\) TO authenticated/,
    "public wrapper remains the authenticated POS/Web RPC",
  );
  assert.match(
    fixSrc,
    /WITH routed_items AS[\s\S]*grouped_routes AS[\s\S]*sent_kt\.kitchen_send_batch_id = gr\.batch_id/,
    "route aggregation must materialize batch_id before checking append state",
  );
  assert.doesNotMatch(
    fixSrc,
    /sent_kt\.kitchen_send_batch_id = COALESCE\(ksb\.id, v_fallback_batch_id\)/,
    "append-state check must not reference grouped ksb.id directly",
  );
  assert.match(
    fixSrc,
    /REVOKE ALL ON FUNCTION public\.auto_enqueue_kitchen_print_from_ticket\(\)[\s\S]*FROM PUBLIC/,
    "trigger helper must not be directly executable by public callers",
  );
});
