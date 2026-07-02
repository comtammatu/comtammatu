import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";

const repoRoot = new URL("../../../../../", import.meta.url);

function readRepoFile(path: string): string {
  const candidate = new URL(path, repoRoot);
  if (existsSync(candidate)) return readFileSync(candidate, "utf8");
  if (path.startsWith("supabase/migrations/")) {
    return readFileSync(
      new URL(
        path.replace("supabase/migrations/", "supabase/migrations/_archive/"),
        repoRoot,
      ),
      "utf8",
    );
  }
  return readFileSync(candidate, "utf8");
}

function readForwardMigrations(): Array<{ path: string; source: string }> {
  const dir = new URL("supabase/migrations/", repoRoot);
  return readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .filter((name) => name !== "00000000000000_baseline.sql")
    .sort()
    .map((name) => {
      const path = `supabase/migrations/${name}`;
      return { path, source: readRepoFile(path) };
    });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const definerFunctionPattern =
  /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?([a-zA-Z_][\w]*)\s*\([\s\S]*?\)[\s\S]*?SECURITY\s+DEFINER[\s\S]*?AS\s+(\$[A-Za-z0-9_]*\$)([\s\S]*?)\2\s*;/gi;

const authzPrimitivePattern =
  /\bpublic\.(?:has_permission|has_permission_any|auth_tenant_id|auth_is_owner)\s*\(|\bauth\.(?:uid|role)\s*\(/i;

function browserGrantPattern(functionName: string): RegExp {
  return new RegExp(
    `GRANT\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+(?:public\\.)?${escapeRegExp(functionName)}\\s*\\([^;]*?\\)\\s+TO\\s+[^;]*(?:anon|authenticated)`,
    "i",
  );
}

function browserRevokePattern(functionName: string, role: string): RegExp {
  return new RegExp(
    `REVOKE\\s+(?:ALL|EXECUTE)\\s+ON\\s+FUNCTION\\s+(?:public\\.)?${escapeRegExp(functionName)}\\s*\\([^;]*?\\)\\s+FROM\\s+[^;]*\\b${escapeRegExp(role)}\\b`,
    "i",
  );
}

function revokesAllBrowserRoles(source: string, functionName: string): boolean {
  return ["PUBLIC", "anon", "authenticated"].every((role) =>
    browserRevokePattern(functionName, role).test(source),
  );
}

const migration = readRepoFile(
  "supabase/migrations/_archive/20260601860000_security_definer_rpc_hardening.sql",
);
const securityHardeningMigration = readRepoFile(
  "supabase/migrations/_archive/20260619062853_security_rpc_cron_runner_hardening.sql",
);
const branchScopePaymentPrintMigration = readRepoFile(
  "supabase/migrations/_archive/20260625130000_branch_scope_pos_payment_print.sql",
);
const permissionScopeGrantsMigration = readRepoFile(
  "supabase/migrations/_archive/20260625131000_permission_scope_grants.sql",
);
const permissionScopeCleanupMigration = readRepoFile(
  "supabase/migrations/_archive/20260629190445_auth_rls_permission_scope_cleanup.sql",
);
const hddtTaxInvoiceRpcScopeMigration = readRepoFile(
  "supabase/migrations/_archive/20260625132000_hddt_tax_invoice_rpc_scope.sql",
);
const retiredIntraBranchRpcMigration = readRepoFile(
  "supabase/migrations/_archive/20260625075939_harden_retired_intra_branch_rpc.sql",
);
const featureFlagRpcMigration = readRepoFile(
  "supabase/migrations/_archive/20260625123413_gate_feature_flag_rpc.sql",
);
const hddtSummaryRpcGrantMigration = readRepoFile(
  "supabase/migrations/_archive/20260625125528_restrict_hddt_summary_rpc_grant.sql",
);
const financeTopItemsWrapperInvokerMigration = readRepoFile(
  "supabase/migrations/_archive/20260625133000_finance_top_items_wrapper_security_invoker.sql",
);
const inventoryShiftKeyInvokerMigration = readRepoFile(
  "supabase/migrations/_archive/20260625132310_inventory_shift_key_invoker.sql",
);
const inventoryProductionOperatorInvokerMigration = readRepoFile(
  "supabase/migrations/_archive/20260625134329_inventory_production_operator_invoker.sql",
);
const positionHelperRpcGrantMigration = readRepoFile(
  "supabase/migrations/_archive/20260625141001_restrict_position_helper_rpc_grants.sql",
);
const inventoryRefreshRpcGrantMigration = readRepoFile(
  "supabase/migrations/_archive/20260625151715_restrict_inventory_refresh_rpc_grant.sql",
);
const branchMenuLimitGrantMigration = readRepoFile(
  "supabase/migrations/_archive/20260625172456_restrict_branch_menu_limit_table_grants.sql",
);
const branchMenuLimitG1AccessMigration = readRepoFile(
  "supabase/migrations/_archive/20260630062650_pos_kds_inventory_truth_g1_access.sql",
);
const branchMenuLimitG2AvailabilityMigration = readRepoFile(
  "supabase/migrations/_archive/20260630071000_pos_kds_inventory_truth_g2_availability.sql",
);
const posKdsInventoryTruthG3OutcomesMigration = readRepoFile(
  "supabase/migrations/_archive/20260630082000_pos_kds_inventory_truth_g3_outcomes.sql",
);
const posRefundVoidAfterPaidMigration = readRepoFile(
  "supabase/migrations/_archive/20260628120000_pos_refund_void_after_paid.sql",
);
const orderDailyCounterGrantMigration = readRepoFile(
  "supabase/migrations/_archive/20260625174605_restrict_order_daily_counter_grants.sql",
);
const hddtRunLogGrantMigration = readRepoFile(
  "supabase/migrations/_archive/20260625180722_restrict_hddt_run_log_grants.sql",
);

function extractSqlFunction(source: string, functionName: string): string {
  return (
    source.match(
      new RegExp(
        `CREATE (?:OR REPLACE )?FUNCTION public\\.${functionName}\\([\\s\\S]*?\\n\\$\\$;`,
      ),
    )?.[0] ?? ""
  );
}

function assertSqlOrder(
  source: string,
  first: string,
  second: string,
  message: string,
): void {
  const firstIndex = source.indexOf(first);
  const secondIndex = source.indexOf(second);

  assert.ok(firstIndex >= 0, `${message}: missing ${first}`);
  assert.ok(secondIndex >= 0, `${message}: missing ${second}`);
  assert.ok(firstIndex < secondIndex, message);
}

test("forward SECURITY DEFINER migrations include an auth boundary or browser-role revoke", () => {
  const failures: string[] = [];

  for (const migration of readForwardMigrations()) {
    for (const match of migration.source.matchAll(definerFunctionPattern)) {
      const functionName = match[1]!;
      const body = match[3]!;
      const hasAuthBoundary = authzPrimitivePattern.test(body);
      const grantsBrowserRole = browserGrantPattern(functionName).test(
        migration.source,
      );
      const revokesBrowserRoles = revokesAllBrowserRoles(
        migration.source,
        functionName,
      );
      const isServiceRoleOnly =
        /auth\.role\(\)\s+IS\s+DISTINCT\s+FROM\s+'service_role'/i.test(body);

      if (!hasAuthBoundary && !revokesBrowserRoles) {
        failures.push(
          `${migration.path}: public.${functionName} lacks an in-body auth boundary and does not revoke PUBLIC/anon/authenticated in the same migration`,
        );
      }
      if (!hasAuthBoundary && grantsBrowserRole) {
        failures.push(
          `${migration.path}: public.${functionName} grants a browser role without an in-body auth boundary`,
        );
      }
      if (isServiceRoleOnly && grantsBrowserRole) {
        failures.push(
          `${migration.path}: public.${functionName} is service-role-only but grants a browser role`,
        );
      }
    }
  }

  assert.deepEqual(failures, []);
});

test("payment and print implementation RPCs are not directly executable by authenticated users", () => {
  for (const signature of [
    "public.finalize_paid_order(BIGINT, UUID)",
    "public.complete_payment_and_consume_stock(BIGINT, NUMERIC, JSONB, UUID)",
    "public.claim_print_job(BIGINT, TEXT)",
    "public.complete_print_job(BIGINT, BOOLEAN, TEXT)",
    "public.expire_stuck_print_jobs(INT)",
  ]) {
    assert.match(
      migration,
      new RegExp(
        `REVOKE EXECUTE ON FUNCTION ${signature.replace(/[()]/g, "\\$&")}\\s+FROM PUBLIC, anon, authenticated`,
      ),
    );
    assert.match(
      migration,
      new RegExp(
        `GRANT EXECUTE ON FUNCTION ${signature.replace(/[()]/g, "\\$&")}\\s+TO service_role`,
      ),
    );
  }
});

test("retired intra-branch transfer RPC is not directly executable by authenticated users", () => {
  const signature =
    "public.commit_intra_branch_transfer(BIGINT, BIGINT, BIGINT, TEXT, TEXT, JSONB)";
  assert.match(
    retiredIntraBranchRpcMigration,
    new RegExp(
      `REVOKE EXECUTE ON FUNCTION ${signature.replace(/[()]/g, "\\$&")}\\s+FROM PUBLIC, anon, authenticated`,
    ),
  );
  assert.match(
    retiredIntraBranchRpcMigration,
    new RegExp(
      `GRANT EXECUTE ON FUNCTION ${signature.replace(/[()]/g, "\\$&")}\\s+TO service_role`,
    ),
  );
});

test("feature flag RPC preserves tenant boundary inside SECURITY DEFINER body", () => {
  const body = extractSqlFunction(featureFlagRpcMigration, "is_feature_enabled");

  assert.match(body, /FROM public\.branch_feature_flags bff/);
  assert.match(body, /JOIN public\.branches b ON b\.id = bff\.branch_id/);
  assert.match(body, /b\.tenant_id = public\.auth_tenant_id\(\)/);
  assert.match(body, /auth\.role\(\) = 'service_role'/);
  assert.match(
    featureFlagRpcMigration,
    /REVOKE ALL ON FUNCTION public\.is_feature_enabled\(bigint, text\)\s+FROM PUBLIC, anon/,
  );
});

test("HDDT daily summary aggregate RPC is service-role only", () => {
  const signature =
    "public.aggregate_daily_b2c_invoice(bigint, date, uuid)";

  assert.match(
    hddtSummaryRpcGrantMigration,
    new RegExp(
      `REVOKE EXECUTE ON FUNCTION ${signature.replace(/[()]/g, "\\$&")}\\s+FROM PUBLIC, anon, authenticated`,
    ),
  );
  assert.match(
    hddtSummaryRpcGrantMigration,
    new RegExp(
      `GRANT EXECUTE ON FUNCTION ${signature.replace(/[()]/g, "\\$&")}\\s+TO service_role`,
    ),
  );
});

test("Finance top-items compatibility wrapper is invoker-rights only", () => {
  assert.match(
    financeTopItemsWrapperInvokerMigration,
    /ALTER FUNCTION public\.get_top_items\(bigint, date, integer\)\s+SECURITY INVOKER/,
  );
  assert.doesNotMatch(
    financeTopItemsWrapperInvokerMigration,
    /SECURITY DEFINER/i,
  );
});

test("Inventory shift-key helper is invoker-rights only", () => {
  assert.match(
    inventoryShiftKeyInvokerMigration,
    /ALTER FUNCTION public\.inventory_shift_key\(bigint, timestamp with time zone\)\s+SECURITY INVOKER/,
  );
  assert.doesNotMatch(inventoryShiftKeyInvokerMigration, /SECURITY DEFINER/i);
});

test("Inventory production-operator helper is invoker-rights only", () => {
  assert.match(
    inventoryProductionOperatorInvokerMigration,
    /ALTER FUNCTION public\.is_inventory_production_operator\(\)\s+SECURITY INVOKER/,
  );
  assert.doesNotMatch(
    inventoryProductionOperatorInvokerMigration,
    /SECURITY DEFINER/i,
  );
});

test("Position helper RPCs are not directly executable by browser roles", () => {
  for (const signature of [
    "public.current_position()",
    "public.has_position(text)",
  ]) {
    assert.match(
      positionHelperRpcGrantMigration,
      new RegExp(
        `REVOKE EXECUTE ON FUNCTION ${signature.replace(/[()]/g, "\\$&")}\\s+FROM PUBLIC, anon, authenticated`,
      ),
    );
    assert.match(
      positionHelperRpcGrantMigration,
      new RegExp(
        `GRANT EXECUTE ON FUNCTION ${signature.replace(/[()]/g, "\\$&")}\\s+TO service_role`,
      ),
    );
  }
});

test("Inventory dashboard refresh RPC is not directly executable by browser roles", () => {
  const signature = "public.refresh_inventory_dashboard()";

  assert.match(
    inventoryRefreshRpcGrantMigration,
    new RegExp(
      `REVOKE EXECUTE ON FUNCTION ${signature.replace(/[()]/g, "\\$&")}\\s+FROM PUBLIC, anon, authenticated`,
    ),
  );
  assert.match(
    inventoryRefreshRpcGrantMigration,
    new RegExp(
      `GRANT EXECUTE ON FUNCTION ${signature.replace(/[()]/g, "\\$&")}\\s+TO service_role`,
    ),
  );
});

test("Branch menu daily limits keep realtime read access but block browser writes", () => {
  assert.match(
    branchMenuLimitGrantMigration,
    /REVOKE ALL ON TABLE public\.branch_menu_item_daily_limits\s+FROM PUBLIC, anon/,
  );
  assert.match(
    branchMenuLimitGrantMigration,
    /REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN\s+ON TABLE public\.branch_menu_item_daily_limits\s+FROM authenticated/,
  );
  assert.match(
    branchMenuLimitGrantMigration,
    /GRANT SELECT ON TABLE public\.branch_menu_item_daily_limits\s+TO authenticated/,
  );
  assert.match(
    branchMenuLimitGrantMigration,
    /REVOKE ALL ON SEQUENCE public\.branch_menu_item_daily_limits_id_seq\s+FROM PUBLIC, anon, authenticated/,
  );
});

test("Branch menu daily limit management RPCs are manager-only", () => {
  for (const functionName of [
    "list_branch_menu_daily_limits",
    "set_branch_menu_daily_limit",
    "clear_branch_menu_daily_limit",
  ]) {
    const functionSource = extractSqlFunction(
      branchMenuLimitG1AccessMigration,
      functionName,
    );
    assert.match(
      functionSource,
      /v_role NOT IN \('owner', 'branch_manager'\)/,
    );
    assert.match(
      functionSource,
      /v_role = 'branch_manager'[\s\S]*v_branch <> p_branch_id/,
    );
    assert.doesNotMatch(functionSource, /\b(?:cashier|chef)\b/);
  }

  const writePolicy =
    branchMenuLimitG1AccessMigration.match(
      /CREATE POLICY bmidl_write[\s\S]*?;/,
    )?.[0] ?? "";
  assert.match(writePolicy, /'owner'/);
  assert.match(writePolicy, /'branch_manager'/);
  assert.doesNotMatch(writePolicy, /\b(?:cashier|chef)\b/);
  assert.match(
    branchMenuLimitG1AccessMigration,
    /REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN\s+ON TABLE public\.branch_menu_item_daily_limits\s+FROM authenticated/,
  );
  assert.match(
    branchMenuLimitG1AccessMigration,
    /GRANT SELECT ON TABLE public\.branch_menu_item_daily_limits\s+TO authenticated/,
  );
});

test("Branch menu availability rebuild keeps helper private and admin list manager-only", () => {
  assert.match(
    branchMenuLimitG2AvailabilityMigration,
    /REVOKE ALL ON FUNCTION public\.branch_menu_limit_availability\(bigint, bigint, date, boolean\)\s+FROM PUBLIC, anon, authenticated/,
  );
  assert.match(
    branchMenuLimitG2AvailabilityMigration,
    /GRANT EXECUTE ON FUNCTION public\.branch_menu_limit_availability\(bigint, bigint, date, boolean\)\s+TO service_role/,
  );

  const listFunction = extractSqlFunction(
    branchMenuLimitG2AvailabilityMigration,
    "list_branch_menu_daily_limits",
  );
  assert.match(listFunction, /v_role NOT IN \('owner', 'branch_manager'\)/);
  assert.match(
    listFunction,
    /v_role = 'branch_manager'[\s\S]*v_branch <> p_branch_id/,
  );
  assert.doesNotMatch(listFunction, /\b(?:cashier|chef)\b/);
});

test("POS stock outcome helpers are private and service-role callable only", () => {
  for (const signature of [
    "public.inv_to_base_for_tenant(bigint, bigint, bigint, numeric)",
    "public.post_pos_sale_consumption_if_ready(bigint, uuid)",
    "public.post_pos_cancelled_ready_waste(bigint, uuid, text)",
  ]) {
    assert.match(
      posKdsInventoryTruthG3OutcomesMigration,
      new RegExp(
        `REVOKE ALL ON FUNCTION ${signature.replace(/[()]/g, "\\$&")}\\s+FROM PUBLIC, anon, authenticated`,
      ),
    );
    assert.match(
      posKdsInventoryTruthG3OutcomesMigration,
      new RegExp(
        `GRANT EXECUTE ON FUNCTION ${signature.replace(/[()]/g, "\\$&")}\\s+TO service_role`,
      ),
    );
  }

  assert.doesNotMatch(
    posKdsInventoryTruthG3OutcomesMigration,
    /GRANT\s+EXECUTE\s+ON\s+FUNCTION public\.post_pos_(?:sale_consumption_if_ready|cancelled_ready_waste)[\s\S]*TO\s+(?:anon|authenticated)/,
  );
});

test("POS stock outcome helpers keep tenant, branch, and issue-location boundaries", () => {
  for (const functionName of [
    "post_pos_sale_consumption_if_ready",
    "post_pos_cancelled_ready_waste",
  ]) {
    const body = extractSqlFunction(
      posKdsInventoryTruthG3OutcomesMigration,
      functionName,
    );

    assert.match(body, /pg_advisory_xact_lock\(p_order_id\)/);
    assert.match(body, /FROM public\.branch_feature_flags bff/);
    assert.match(body, /bff\.flag_key = 'pos_stock_outcome_posting'/);
    assert.match(body, /il\.location_kind = 'warehouse'/);
    assert.match(body, /ORDER BY il\.is_default_issue DESC/);
    assert.match(body, /public\.inv_to_base_for_tenant\(/);
    assert.match(body, /o\.created_by/);
    assert.match(body, /v_actor := COALESCE\(v_actor, v_order\.created_by\)/);
    assert.doesNotMatch(body, /public\.inv_to_base\(/);
    assert.doesNotMatch(body, /00000000-0000-0000-0000-000000000000/);
  }

  const conversion = extractSqlFunction(
    posKdsInventoryTruthG3OutcomesMigration,
    "inv_to_base_for_tenant",
  );
  assert.match(conversion, /auth\.role\(\) IS DISTINCT FROM 'service_role'/);
  assert.match(
    conversion,
    /p_tenant_id IS DISTINCT FROM public\.auth_tenant_id\(\)/,
  );
  assert.match(conversion, /FROM public\.ingredient_units iu/);
  assert.match(conversion, /iu\.tenant_id = p_tenant_id/);
  assert.match(conversion, /iu\.is_active = TRUE/);
  assert.match(conversion, /recipe_unit_conversion_missing:%/);

  assertSqlOrder(
    extractSqlFunction(posKdsInventoryTruthG3OutcomesMigration, "finalize_paid_order"),
    "PERFORM pg_advisory_xact_lock(p_order_id);",
    "FOR UPDATE;",
    "finalize_paid_order must take the order advisory lock before row locks",
  );
  assertSqlOrder(
    extractSqlFunction(
      posKdsInventoryTruthG3OutcomesMigration,
      "complete_payment_and_consume_stock",
    ),
    "PERFORM pg_advisory_xact_lock(v_order_id);",
    "FOR UPDATE;",
    "complete_payment_and_consume_stock must take the order advisory lock before row locks",
  );
  assertSqlOrder(
    extractSqlFunction(posKdsInventoryTruthG3OutcomesMigration, "cancel_order"),
    "PERFORM pg_advisory_xact_lock(p_order_id);",
    "FOR UPDATE;",
    "cancel_order must take the order advisory lock before row locks",
  );
  assertSqlOrder(
    extractSqlFunction(posKdsInventoryTruthG3OutcomesMigration, "bump_kds_ticket"),
    "PERFORM pg_advisory_xact_lock(v_order_id);",
    "FOR UPDATE;",
    "bump_kds_ticket must take the order advisory lock before ticket row locks",
  );
  assertSqlOrder(
    extractSqlFunction(posKdsInventoryTruthG3OutcomesMigration, "complete_kds_tickets"),
    "FOREACH v_order_id IN ARRAY v_order_ids LOOP",
    "WITH locked AS",
    "complete_kds_tickets must take order advisory locks before ticket row locks",
  );
  assert.match(
    extractSqlFunction(posKdsInventoryTruthG3OutcomesMigration, "complete_kds_tickets"),
    /array_agg\(DISTINCT kt\.order_id ORDER BY kt\.order_id\)/,
  );
  assertSqlOrder(
    extractSqlFunction(posKdsInventoryTruthG3OutcomesMigration, "mark_order_item_served"),
    "PERFORM pg_advisory_xact_lock(v_order_id);",
    "FOR UPDATE OF oi;",
    "mark_order_item_served must take the order advisory lock before item row locks",
  );

  assert.match(
    posKdsInventoryTruthG3OutcomesMigration,
    /CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_movements_pos_outcome_idempotency/,
  );
  assert.match(
    posKdsInventoryTruthG3OutcomesMigration,
    /movement_subtype IN \(\s*'sale_consumption',\s*'cancelled_after_kds_ready'\s*\)/,
  );
});

test("Paid refund RPC does not post POS stock outcomes again", () => {
  const body = extractSqlFunction(
    posRefundVoidAfterPaidMigration,
    "refund_paid_order",
  );

  assert.doesNotMatch(
    body,
    /public\.post_pos_(?:sale_consumption_if_ready|cancelled_ready_waste)\(/,
  );
  assert.doesNotMatch(body, /public\.stock_movements/);
});

test("Order daily counters are RPC-only implementation state", () => {
  assert.match(
    orderDailyCounterGrantMigration,
    /DROP POLICY IF EXISTS order_daily_counters_write\s+ON public\.order_daily_counters/,
  );
  assert.match(
    orderDailyCounterGrantMigration,
    /REVOKE ALL ON TABLE public\.order_daily_counters\s+FROM PUBLIC, anon, authenticated/,
  );
  assert.match(
    orderDailyCounterGrantMigration,
    /GRANT ALL ON TABLE public\.order_daily_counters\s+TO service_role/,
  );
  assert.match(
    orderDailyCounterGrantMigration,
    /REVOKE ALL ON SEQUENCE public\.order_daily_counters_id_seq\s+FROM PUBLIC, anon, authenticated/,
  );
  assert.match(
    orderDailyCounterGrantMigration,
    /GRANT ALL ON SEQUENCE public\.order_daily_counters_id_seq\s+TO service_role/,
  );
  assert.doesNotMatch(
    orderDailyCounterGrantMigration,
    /GRANT[\s\S]+order_daily_counters[\s\S]+TO (?:anon|authenticated)/,
  );
});

test("HDDT run logs are service-role-only audit state", () => {
  for (const table of ["archive_run_log", "reconcile_run_log"]) {
    const policy = table === "archive_run_log" ? "arl_select" : "rrl_select";

    assert.match(
      hddtRunLogGrantMigration,
      new RegExp(`DROP POLICY IF EXISTS ${policy}\\s+ON public\\.${table}`),
    );
    assert.match(
      hddtRunLogGrantMigration,
      new RegExp(
        `REVOKE ALL ON TABLE public\\.${table}\\s+FROM PUBLIC, anon, authenticated`,
      ),
    );
    assert.match(
      hddtRunLogGrantMigration,
      new RegExp(`GRANT ALL ON TABLE public\\.${table}\\s+TO service_role`),
    );
    assert.match(
      hddtRunLogGrantMigration,
      new RegExp(
        `REVOKE ALL ON SEQUENCE public\\.${table}_id_seq\\s+FROM PUBLIC, anon, authenticated`,
      ),
    );
    assert.match(
      hddtRunLogGrantMigration,
      new RegExp(
        `GRANT ALL ON SEQUENCE public\\.${table}_id_seq\\s+TO service_role`,
      ),
    );
  }

  assert.doesNotMatch(
    hddtRunLogGrantMigration,
    /GRANT\s+[^;]+ON TABLE public\.(?:archive_run_log|reconcile_run_log)[^;]+TO (?:anon|authenticated)/,
  );
  assert.doesNotMatch(
    hddtRunLogGrantMigration,
    /GRANT\s+ALL ON SEQUENCE public\.(?:archive_run_log|reconcile_run_log)_id_seq[^;]+TO (?:anon|authenticated)/,
  );
});

test("staff admin RPCs enforce permission gates inside SECURITY DEFINER bodies", () => {
  assert.match(migration, /public\.has_permission_any\('staff:manage'\)/);
  assert.match(
    migration,
    /public\.has_permission_any\('staff:assign_position'\)/,
  );
  assert.match(
    migration,
    /RAISE EXCEPTION 'forbidden: missing staff:manage' USING ERRCODE = '42501'/,
  );
  assert.match(
    migration,
    /RAISE EXCEPTION 'forbidden: missing staff:assign_position' USING ERRCODE = '42501'/,
  );
});

test("service-only implementation RPCs are not executable by authenticated users", () => {
  for (const signature of [
    "public.consume_stock_for_order_service(BIGINT, UUID)",
    "public.create_waste_from_order(BIGINT, BIGINT, TEXT, JSONB, TEXT)",
  ]) {
    assert.match(
      securityHardeningMigration,
      new RegExp(
        `REVOKE (?:ALL|EXECUTE) ON FUNCTION ${signature.replace(/[()]/g, "\\$&")}\\s+FROM PUBLIC, anon, authenticated`,
        "i",
      ),
    );
    assert.match(
      securityHardeningMigration,
      new RegExp(
        `GRANT EXECUTE ON FUNCTION ${signature.replace(/[()]/g, "\\$&")}\\s+TO service_role`,
        "i",
      ),
    );
  }

  assert.match(
    securityHardeningMigration,
    /IF auth\.role\(\) IS DISTINCT FROM 'service_role' THEN[\s\S]{0,160}forbidden_service_role_only/,
  );
});

test("POS and inventory RPC bodies enforce branch permission and location scope", () => {
  for (const functionName of [
    "mark_order_item_served",
    "transfer_order_table",
  ]) {
    const body =
      securityHardeningMigration.match(
        new RegExp(
          `CREATE OR REPLACE FUNCTION public\\.${functionName}\\([\\s\\S]*?\\n\\$\\$;`,
        ),
      )?.[0] ?? "";
    assert.match(body, /v_prof_branch IS NULL/);
    assert.match(body, /public\.has_permission\([^,]+,\s*'pos:use'\)/);
    assert.match(body, /forbidden: missing pos:use/);
  }

  assert.match(
    securityHardeningMigration,
    /CREATE OR REPLACE FUNCTION public\.create_waste_entry/,
  );
  assert.match(securityHardeningMigration, /FROM public\.inventory_locations/);
  assert.match(securityHardeningMigration, /v_location\.tenant_id <> v_tenant/);
  assert.match(
    securityHardeningMigration,
    /v_location\.branch_id <> p_branch_id/,
  );
  assert.match(securityHardeningMigration, /location_scope_mismatch/);
});

test("POS payment and receipt RPCs enforce branch-scoped permissions", () => {
  const cash = extractSqlFunction(
    branchScopePaymentPrintMigration,
    "confirm_cash_payment",
  );
  const vietqr = extractSqlFunction(
    branchScopePaymentPrintMigration,
    "confirm_vietqr_payment",
  );
  const receipt = extractSqlFunction(
    branchScopePaymentPrintMigration,
    "enqueue_receipt_print",
  );

  assert.match(
    cash,
    /public\.has_permission\(v_order\.branch_id,\s*'pos:confirm_payment'\)/,
  );
  assert.doesNotMatch(cash, /has_permission_any\('pos:confirm_payment'\)/);

  assert.match(
    vietqr,
    /public\.has_permission\(v_order\.branch_id,\s*'pos:confirm_payment'\)/,
  );
  assert.match(
    vietqr,
    /v_order\.tenant_id IS DISTINCT FROM public\.auth_tenant_id\(\)/,
  );
  assert.match(vietqr, /created_by\s*\)\s*VALUES\s*\([\s\S]*now\(\), v_uid/);
  assert.match(vietqr, /public\.finalize_paid_order\(p_order_id, v_uid\)/);
  assert.doesNotMatch(vietqr, /has_permission_any\('pos:confirm_payment'\)/);

  assert.match(
    receipt,
    /public\.has_permission\(v_order\.branch_id,\s*'pos:print'\)/,
  );
  assert.match(
    receipt,
    /public\.has_permission\(v_order\.branch_id,\s*'pos:reprint_receipt'\)/,
  );
  assert.doesNotMatch(receipt, /has_permission_any\('pos:print'\)/);
  assert.doesNotMatch(receipt, /has_permission_any\('pos:reprint_receipt'\)/);
});

test("print_jobs write policies are branch scoped", () => {
  assert.match(
    branchScopePaymentPrintMigration,
    /CREATE POLICY print_jobs_insert[\s\S]*public\.has_permission\(branch_id,\s*'pos:print'\)[\s\S]*public\.has_permission\(branch_id,\s*'pos:send_kitchen'\)[\s\S]*public\.has_permission\(branch_id,\s*'printer:manage'\)/,
  );
  assert.match(
    branchScopePaymentPrintMigration,
    /CREATE POLICY print_jobs_update[\s\S]*public\.has_permission\(branch_id,\s*'pos:print'\)[\s\S]*public\.has_permission\(branch_id,\s*'printer:manage'\)/,
  );
  assert.doesNotMatch(
    branchScopePaymentPrintMigration,
    /print_jobs_(?:insert|update)[\s\S]*has_permission_any/,
  );
});

test("printer agent write policies are branch scoped", () => {
  assert.match(
    branchScopePaymentPrintMigration,
    /CREATE POLICY printer_agents_upsert_insert[\s\S]*public\.has_permission\(branch_id,\s*'printer:manage'\)[\s\S]*public\.has_permission\(branch_id,\s*'pos:print'\)/,
  );
  assert.match(
    branchScopePaymentPrintMigration,
    /CREATE POLICY printer_agents_upsert_update[\s\S]*public\.has_permission\(branch_id,\s*'printer:manage'\)[\s\S]*public\.has_permission\(branch_id,\s*'pos:print'\)/,
  );
  assert.doesNotMatch(
    branchScopePaymentPrintMigration,
    /printer_agents_upsert_(?:insert|update)[\s\S]*has_permission_any/,
  );
});

test("staff permission grants enforce permission key scope", () => {
  const grant = extractSqlFunction(permissionScopeGrantsMigration, "grant_permission");
  const template = extractSqlFunction(
    permissionScopeCleanupMigration,
    "apply_template_to_user",
  );
  const sync = extractSqlFunction(
    permissionScopeCleanupMigration,
    "sync_missing_permissions_from_template",
  );

  assert.match(grant, /SELECT scope INTO v_scope[\s\S]*FROM public\.permission_keys/);
  assert.match(grant, /v_scope = 'branch' AND p_branch_id IS NULL/);
  assert.match(grant, /permission_scope_requires_branch/);
  assert.match(grant, /v_scope = 'tenant' AND p_branch_id IS NOT NULL/);
  assert.match(grant, /permission_scope_requires_tenant/);

  assert.match(template, /SELECT scope INTO v_perm_scope[\s\S]*FROM public\.permission_keys/);
  assert.match(template, /unknown_permission_key_in_template/);
  assert.match(template, /WHEN v_perm_scope = 'tenant' THEN NULL/);
  assert.match(template, /WHEN v_perm_scope = 'branch' THEN p_branch_id/);
  assert.match(template, /permission_scope_requires_branch/);

  assert.match(sync, /SELECT scope INTO v_perm_scope[\s\S]*FROM public\.permission_keys/);
  assert.match(sync, /WHEN v_perm_scope = 'tenant' THEN NULL/);
  assert.match(sync, /WHEN v_perm_scope = 'branch' THEN v_branch/);
  assert.match(sync, /v_perm_scope = 'branch' AND v_grant_branch IS NULL/);

  assert.match(
    permissionScopeCleanupMigration,
    /pk\.scope = 'branch'[\s\S]*sp\.branch_id IS NULL/,
  );
  assert.match(
    permissionScopeCleanupMigration,
    /pk\.scope = 'tenant'[\s\S]*sp\.branch_id IS NOT NULL/,
  );
});

test("HDDT tax invoice RPCs enforce branch and tenant scoped permissions", () => {
  const transition = extractSqlFunction(
    hddtTaxInvoiceRpcScopeMigration,
    "transition_tax_invoice_state",
  );
  const replace = extractSqlFunction(
    hddtTaxInvoiceRpcScopeMigration,
    "replace_tax_invoice",
  );

  assert.match(
    transition,
    /public\.has_permission\(v_invoice\.branch_id,\s*'orders:write'\)/,
  );
  assert.match(
    transition,
    /public\.has_permission\(NULL,\s*'settings:tenant'\)/,
  );
  assert.doesNotMatch(transition, /has_permission_any\('orders:write'\)/);
  assert.doesNotMatch(transition, /has_permission_any\('settings:tenant'\)/);

  assert.match(replace, /public\.has_permission\(NULL,\s*'settings:tenant'\)/);
  assert.doesNotMatch(replace, /has_permission_any\('settings:tenant'\)/);
});
