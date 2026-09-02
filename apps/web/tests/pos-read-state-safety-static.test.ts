import { readSql } from "./_lib/active-sql.ts";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const read = (path: string) =>
  String(path).includes("supabase/migrations/")
    ? readSql(process.cwd(), String(path).replace(/^.*?(supabase\/)/, "supabase/"))
    : readFileSync(join(process.cwd(), path), "utf8");

test("POS fails closed when the table snapshot is unavailable", () => {
  const source = read("app/(protected)/br/[branchId]/pos/page.tsx");
  const failureGuard = source.indexOf(
    "if (!tablesResult.success || !tablesResult.data)",
  );
  const tableDerivation = source.indexOf(
    "const tablesList = tablesResult.data as BranchTable[]",
  );

  assert.ok(failureGuard >= 0);
  assert.ok(tableDerivation > failureGuard);
  assert.match(source, /title=\{POS_VI\.shellTablesErrorTitle\}/);
  assert.match(source, /description=\{POS_VI\.shellTablesErrorFallback\}/);
  assert.doesNotMatch(source, /description=\{tablesResult\.error/);
  assert.match(source, /label: POS_VI\.shellTablesErrorBadge/);
});

test("POS streams the shell while the first active-order snapshot loads", () => {
  const source = read(
    "app/(protected)/br/[branchId]/pos/_providers/pos-desktop-provider.tsx",
  );
  const shell = read("app/(protected)/br/[branchId]/pos/pos-desktop-shell.tsx");

  assert.match(
    source,
    /type OrdersBootstrapState = "loading" \| "ready" \| "error"/,
  );
  assert.match(
    source,
    /initialOrdersLoadStartedRef\.current = true;\s*void loadOrders\(\)/,
  );
  assert.match(
    source,
    /ordersReadyRef\.current = true;[\s\S]*setOrdersBootstrapState\("ready"\)/,
  );
  assert.match(source, /catch \{\s*markOrdersLoadFailure\(\);\s*\}/);
  // The shell renders immediately on cold-load (orders start empty and hydrate);
  // only the error state gates the shell behind a retry panel.
  assert.match(
    source,
    /ordersBootstrapState === "error" \? \([\s\S]*ACTIONS_VI\.retry/,
  );
  assert.match(source, /skipFirstSubscribedRefresh: true/);
  assert.match(
    shell,
    /key=\{`\$\{String\(props\.branchId\)\}:\$\{String\(props\.session\.id\)\}`\}/,
  );
});

test("self-order rejected requests surface errors and always clear payment pending", () => {
  const source = read("app/q/[token]/self-order-client.tsx");

  assert.match(
    source,
    /startSubmit\(async \(\) => \{\s*try \{[\s\S]*catch \{\s*setSubmitError\(SELF_ORDER_VI\.submitFailed\)/,
  );
  assert.match(
    source,
    /startPayment\(async \(\) => \{\s*try \{[\s\S]*catch \{\s*setPaymentError\(SELF_ORDER_VI\.paymentFailed\);\s*\} finally \{\s*setPendingPaymentMethod\(null\)/,
  );
  assert.equal(source.match(/setPendingPaymentMethod\(null\)/g)?.length, 1);
});
