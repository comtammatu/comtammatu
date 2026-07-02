import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "../../../../..");
const read = (path: string) => {
  const candidate = resolve(repoRoot, path);
  if (existsSync(candidate)) return readFileSync(candidate, "utf8");
  if (path.startsWith("supabase/migrations/")) {
    return readFileSync(
      resolve(
        repoRoot,
        path.replace("supabase/migrations/", "supabase/migrations/_archive/"),
      ),
      "utf8",
    );
  }
  return readFileSync(candidate, "utf8");
};

const migrationPath =
  "supabase/migrations/_archive/20260602000000_kds_print_on_completion.sql";
const cleanupMigrationPath =
  "supabase/migrations/_archive/20260602001000_drop_kds_auto_print_trigger_function.sql";
const nonKdsDispatchMigrationPath =
  "supabase/migrations/_archive/20260602002000_non_kds_dispatch_print_on_pos_send.sql";
const routePolicyMigrationPath =
  "supabase/migrations/_archive/20260701065350_pos_kitchen_print_route_policy.sql";

test("KDS ticket creation no longer auto-enqueues kitchen print jobs", () => {
  const src = `${read(migrationPath)}\n${read(cleanupMigrationPath)}`;

  assert.match(
    src,
    /DROP TRIGGER IF EXISTS trg_auto_enqueue_kitchen_print_from_ticket[\s\S]*ON public\.kds_tickets/,
    "old KDS-ticket creation trigger must be disabled",
  );
  assert.doesNotMatch(
    src,
    /CREATE CONSTRAINT TRIGGER trg_auto_enqueue_kitchen_print_from_ticket/,
    "new workflow must not recreate the auto-print trigger",
  );
  assert.match(
    src,
    /DROP FUNCTION IF EXISTS public\.auto_enqueue_kitchen_print_from_ticket\(\)/,
    "retired auto-print trigger function must be removed after the trigger is dropped",
  );
  assert.match(
    src,
    /CREATE OR REPLACE FUNCTION public\.enqueue_kitchen_print/,
    "public POS-era RPC should remain as compatibility wrapper",
  );
  assert.match(
    src,
    /'deferred_to',\s+'kds_completion'/,
    "compatibility wrapper must defer paper printing to KDS completion",
  );
});

test("KDS completion print helper is scoped to completed ticket ids", () => {
  const src = read(migrationPath);

  assert.match(
    src,
    /CREATE OR REPLACE FUNCTION private\.enqueue_kitchen_completion_print_internal/,
    "migration must add a private completion-print helper",
  );
  assert.match(
    src,
    /WHERE kt\.id = ANY\(v_ticket_ids\)[\s\S]*AND oi\.sent_to_kitchen_at IS NULL/,
    "helper must print only the completed unsent ticket items",
  );
  assert.match(
    src,
    /array_agg\(ticket_id ORDER BY order_item_id\) AS ticket_ids/,
    "helper must carry stable ticket ids for idempotency",
  );
  assert.match(
    src,
    /':kds-complete:printer:' \|\| v_route\.printer_id::TEXT[\s\S]*':tickets:' \|\| md5\(array_to_string\(v_route\.ticket_ids, ','\)\)/,
    "idempotency must dedupe retries without merging later remaining-item prints",
  );
  assert.match(
    src,
    /UPDATE public\.order_items[\s\S]*SET sent_to_kitchen_at = COALESCE\(sent_to_kitchen_at, now\(\)\)/,
    "completion print must advance the existing print cursor only for printed items",
  );
  assert.match(
    src,
    /REVOKE ALL ON FUNCTION private\.enqueue_kitchen_completion_print_internal\(BIGINT, BIGINT\[\], UUID\)[\s\S]*FROM PUBLIC/,
    "private helper must not be callable directly",
  );
});

test("complete_kds_tickets atomically queues prints for tickets it actually completed", () => {
  const src = read(migrationPath);

  assert.match(
    src,
    /CREATE OR REPLACE FUNCTION public\.complete_kds_tickets/,
    "migration must replace the KDS completion RPC",
  );
  assert.match(
    src,
    /WITH updated AS \([\s\S]*kt\.status IN \('pending', 'preparing'\)[\s\S]*RETURNING kt\.id/,
    "RPC must derive the print set from real pending/preparing -> ready transitions",
  );
  assert.match(
    src,
    /private\.enqueue_kitchen_completion_print_internal\([\s\S]*p_branch_id,[\s\S]*v_updated_ticket_ids,[\s\S]*v_uid/,
    "RPC must enqueue paper from the updated ticket ids inside the same transaction",
  );
  assert.match(
    src,
    /EXCEPTION[\s\S]*WHEN OTHERS THEN[\s\S]*v_print_warning := 'kitchen_print_enqueue_failed'/,
    "print enqueue failures must be fail-soft and surfaced as warnings",
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

test("printer-only categories print at POS dispatch without entering food KDS", () => {
  const src = read(nonKdsDispatchMigrationPath);

  assert.match(
    src,
    /CREATE OR REPLACE FUNCTION public\.route_order_to_kds/,
    "migration must override route_order_to_kds for hybrid dispatch",
  );
  assert.match(
    src,
    /v_station_id IS NULL AND v_has_printer_route[\s\S]*CONTINUE;/,
    "printer-only categories must be skipped from KDS ticket creation",
  );
  assert.match(
    src,
    /NOT EXISTS \([\s\S]*FROM public\.kds_station_categories sc[\s\S]*s\.is_active = TRUE[\s\S]*\)[\s\S]*':non-kds-dispatch:printer:'/,
    "dispatch print must be limited to categories without active KDS station mapping",
  );
  assert.match(
    src,
    /JOIN public\.printer_menu_categories pmc[\s\S]*JOIN public\.printer_print_types ppt[\s\S]*ppt\.print_type = 'kitchen_ticket'/,
    "dispatch print must still respect branch printer category routing",
  );
  assert.match(
    src,
    /UPDATE public\.order_items[\s\S]*SET sent_to_kitchen_at = COALESCE\(sent_to_kitchen_at, now\(\)\)/,
    "printer-only dispatch must advance the existing print cursor",
  );
});

test("non-KDS items use kitchen printer routing without category-type hardcode", () => {
  const migration = read(routePolicyMigrationPath);
  const printActions = read(
    "apps/web/app/(protected)/br/[branchId]/pos/print-actions.ts",
  );

  assert.match(
    migration,
    /LEFT JOIN public\.printer_menu_categories pmc[\s\S]*FROM public\.printer_menu_categories pmc_any/,
    "route function must use category-specific or default kitchen printer routing",
  );
  assert.match(
    migration,
    /v_station_id IS NULL AND v_has_printer_route[\s\S]*CONTINUE;/,
    "printer-routed items must be skipped from KDS ticket creation",
  );
  assert.match(
    migration,
    /:non-kds-dispatch:printer:/,
    "printer-routed items must enqueue kitchen-ticket print jobs at POS dispatch",
  );
  assert.doesNotMatch(
    migration,
    /category_type = 'drink'|mc\.type\s*(?:=|<>)/,
    "routing must not depend on menu category type",
  );
  assert.match(
    printActions,
    /\.select\("id, kds_tickets\(id\)"\)[\s\S]*\(item\.kds_tickets \?\? \[\]\)\.length === 0/,
    "POS partial-send warning must follow routing result instead of category type",
  );
});
