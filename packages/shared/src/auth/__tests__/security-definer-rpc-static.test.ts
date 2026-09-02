import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import { readSql, assertSqlMatch, assertSqlNotMatch, sqlIndexOf, looksLikeDump } from "../../test-utils/active-sql";


const repoRoot = new URL("../../../../../", import.meta.url);

function readRepoFile(path: string): string {
  if (path.startsWith("supabase/") || path.includes("migration-archive")) {
    return readSql(fileURLToPath(repoRoot), path);
  }
  return readFileSync(new URL(path, repoRoot), "utf8");
}

function readForwardMigrations(): Array<{ path: string; source: string }> {
  const dir = new URL("supabase/migrations/", repoRoot);
  return readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .filter(
      (name) =>
        name !== "00000000000000_baseline.sql" &&
        !/^\d{14}_baseline\.sql$/.test(name) &&
        name !== "20260706084248_realtime_pr5_cron_monitoring.sql",
    )
    .sort()
    .map((name) => {
      const path = `supabase/migrations/${name}`;
      // Strip block comments so rollback snapshots inside DROP migrations do
      // not register as live SECURITY DEFINER definitions.
      const source = readRepoFile(path).replace(/\/\*[\s\S]*?\*\//g, "");
      return { path, source };
    });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const definerFunctionPattern =
  /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?([a-zA-Z_][\w]*)\s*\([\s\S]*?\)(?:(?!CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION)[\s\S])*?SECURITY\s+DEFINER[\s\S]*?AS\s+(\$[A-Za-z0-9_]*\$)([\s\S]*?)\2\s*;/gi;

const authzPrimitivePattern =
  /\bpublic\.(?:has_permission|has_permission_any|auth_tenant_id|auth_is_owner|can_read_inventory_monetary)\s*\(|\bauth\.(?:uid|role)\s*\(/i;

function browserGrantPattern(functionName: string): RegExp {
  return new RegExp(
    `GRANT\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+(?:public\\.)?${escapeRegExp(functionName)}\\s*\\([^;]*?\\)\\s+TO\\s+[^;]*(?:PUBLIC|anon|authenticated)`,
    "i",
  );
}

function browserRevokePattern(functionName: string, role: string): RegExp {
  return new RegExp(
    `REVOKE\\s+(?:ALL|EXECUTE)\\s+ON\\s+FUNCTION\\s+[^;]*?(?:public\\.)?${escapeRegExp(functionName)}\\s*\\([^;]*?\\)[^;]*?FROM\\s+[^;]*\\b${escapeRegExp(role)}\\b`,
    "i",
  );
}

function lastMatchIndex(source: string, pattern: RegExp): number {
  const flags = pattern.flags.includes("g")
    ? pattern.flags
    : `${pattern.flags}g`;
  const matches = source.matchAll(new RegExp(pattern.source, flags));
  let last = -1;
  for (const match of matches) last = match.index;
  return last;
}

function browserRolesAreFinallyRevoked(
  source: string,
  functionName: string,
): boolean {
  const lastGrant = lastMatchIndex(source, browserGrantPattern(functionName));
  return ["PUBLIC", "anon", "authenticated"].every(
    (role) =>
      lastMatchIndex(source, browserRevokePattern(functionName, role)) >
      lastGrant,
  );
}

function isFinallySecurityInvoker(
  source: string,
  functionName: string,
): boolean {
  const escapedName = escapeRegExp(functionName);
  const lastDefiner = lastMatchIndex(
    source,
    new RegExp(
      `CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+(?:public\\.)?${escapedName}\\s*\\([\\s\\S]*?SECURITY\\s+DEFINER`,
      "i",
    ),
  );
  const lastInvoker = lastMatchIndex(
    source,
    new RegExp(
      `ALTER\\s+FUNCTION\\s+(?:public\\.)?${escapedName}\\s*\\([^;]*?\\)\\s+SECURITY\\s+INVOKER`,
      "i",
    ),
  );
  return lastInvoker > lastDefiner;
}

function delegatesToPrivateAuthorizedFunction(
  body: string,
  finalSource: string,
): boolean {
  const delegatedNames = Array.from(
    body.matchAll(/\bRETURN\s+public\.([a-zA-Z_][\w]*)\s*\(/gi),
    (match) => match[1]!,
  );

  return delegatedNames.some((delegatedName) => {
    const delegateIsPrivate = browserRolesAreFinallyRevoked(
      finalSource,
      delegatedName,
    );
    if (!delegateIsPrivate) {
      return false;
    }

    let delegatedBody = "";
    for (const match of finalSource.matchAll(definerFunctionPattern)) {
      if (match[1] === delegatedName) delegatedBody = match[3]!;
    }

    if (!delegatedBody) {
      const renamePattern = new RegExp(
        `ALTER\\s+FUNCTION\\s+(?:public\\.)?([a-zA-Z_][\\w]*)\\s*\\([^;]*?\\)\\s+RENAME\\s+TO\\s+${escapeRegExp(delegatedName)}\\s*;`,
        "gi",
      );
      const rename = Array.from(finalSource.matchAll(renamePattern)).at(-1);
      if (rename?.index !== undefined) {
        const sourceBeforeRename = finalSource.slice(0, rename.index);
        for (const match of sourceBeforeRename.matchAll(
          definerFunctionPattern,
        )) {
          if (match[1] === rename[1]) delegatedBody = match[3]!;
        }
      }
    }
    return authzPrimitivePattern.test(delegatedBody);
  });
}

const migration = readRepoFile(
  "supabase/migrations/20260601860000_security_definer_rpc_hardening.sql",
);
const securityHardeningMigration = readRepoFile(
  "supabase/migrations/20260619062853_security_rpc_cron_runner_hardening.sql",
);
const branchScopePaymentPrintMigration = readRepoFile(
  "supabase/migrations/20260625130000_branch_scope_pos_payment_print.sql",
);
const permissionScopeGrantsMigration = readRepoFile(
  "supabase/migrations/20260625131000_permission_scope_grants.sql",
);
const permissionScopeCleanupMigration = readRepoFile(
  "supabase/migrations/20260629190445_auth_rls_permission_scope_cleanup.sql",
);
const hddtTaxInvoiceRpcScopeMigration = readRepoFile(
  "supabase/migrations/20260625132000_hddt_tax_invoice_rpc_scope.sql",
);
const featureFlagRpcMigration = readRepoFile(
  "supabase/migrations/20260625123413_gate_feature_flag_rpc.sql",
);
const hddtSummaryRpcGrantMigration = readRepoFile(
  "supabase/migrations/20260625125528_restrict_hddt_summary_rpc_grant.sql",
);
const financeTopItemsWrapperInvokerMigration = readRepoFile(
  "supabase/migrations/20260625133000_finance_top_items_wrapper_security_invoker.sql",
);
const inventoryShiftKeyInvokerMigration = readRepoFile(
  "supabase/migrations/20260625132310_inventory_shift_key_invoker.sql",
);
const inventoryProductionOperatorInvokerMigration = readRepoFile(
  "supabase/migrations/20260625134329_inventory_production_operator_invoker.sql",
);
const positionHelperRpcGrantMigration = readRepoFile(
  "supabase/migrations/20260625141001_restrict_position_helper_rpc_grants.sql",
);
const inventoryRefreshRpcGrantMigration = readRepoFile(
  "supabase/migrations/20260625151715_restrict_inventory_refresh_rpc_grant.sql",
);
const branchMenuLimitGrantMigration = readRepoFile(
  "supabase/migrations/20260625172456_restrict_branch_menu_limit_table_grants.sql",
);
const branchMenuLimitG1AccessMigration = readRepoFile(
  "supabase/migrations/20260630062650_pos_kds_inventory_truth_g1_access.sql",
);
const branchMenuLimitG2AvailabilityMigration = readRepoFile(
  "supabase/migrations/20260630071000_pos_kds_inventory_truth_g2_availability.sql",
);
const posKdsInventoryTruthG3OutcomesMigration = readRepoFile(
  "supabase/migrations/20260630082000_pos_kds_inventory_truth_g3_outcomes.sql",
);
const posRefundVoidAfterPaidMigration = readRepoFile(
  "supabase/migrations/20260628120000_pos_refund_void_after_paid.sql",
);
const orderDailyCounterGrantMigration = readRepoFile(
  "supabase/migrations/20260625174605_restrict_order_daily_counter_grants.sql",
);
const hddtRunLogGrantMigration = readRepoFile(
  "supabase/migrations/20260625180722_restrict_hddt_run_log_grants.sql",
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
  const firstIndex = sqlIndexOf(source, first);
  const secondIndex = sqlIndexOf(source, second);
  if (looksLikeDump(source) && (firstIndex < 0 || secondIndex < 0)) return;

  assert.ok(firstIndex >= 0, `${message}: missing ${first}`);
  assert.ok(secondIndex >= 0, `${message}: missing ${second}`);
  assert.ok(firstIndex < secondIndex, message);
}

test("forward SECURITY DEFINER migrations include an auth boundary or browser-role revoke", () => {
  const failures: string[] = [];
  const migrations = readForwardMigrations();
  const allSource = migrations.map(({ source }) => source).join("\n");

  for (const [migrationIndex, migration] of migrations.entries()) {
    const finalSource = migrations
      .slice(migrationIndex)
      .map(({ source }) => source)
      .join("\n");
    for (const match of migration.source.matchAll(definerFunctionPattern)) {
      const functionName = match[1]!;
      const headerEnd = match[0].search(/\bAS\s+\$[A-Za-z0-9_]*\$/i);
      if (
        headerEnd < 0 ||
        !/\bSECURITY\s+DEFINER\b/i.test(match[0].slice(0, headerEnd))
      ) {
        continue;
      }
      const body = match[3]!;
      const hasAuthBoundary =
        authzPrimitivePattern.test(body) ||
        delegatesToPrivateAuthorizedFunction(body, allSource);
      const grantsBrowserRole = browserGrantPattern(functionName).test(
        migration.source,
      );
      const revokesBrowserRoles = browserRolesAreFinallyRevoked(
        finalSource,
        functionName,
      );
      const becomesSecurityInvoker = isFinallySecurityInvoker(
        finalSource,
        functionName,
      );
      const isServiceRoleOnly =
        /auth\.role\(\)\s+IS\s+DISTINCT\s+FROM\s+'service_role'/i.test(body);

      if (!hasAuthBoundary && !revokesBrowserRoles && !becomesSecurityInvoker) {
        failures.push(
          `${migration.path}: public.${functionName} lacks an in-body auth boundary and remains executable by a browser role`,
        );
      }
      if (
        !hasAuthBoundary &&
        grantsBrowserRole &&
        !revokesBrowserRoles &&
        !becomesSecurityInvoker
      ) {
        failures.push(
          `${migration.path}: public.${functionName} grants a browser role without an in-body auth boundary`,
        );
      }
      if (isServiceRoleOnly && grantsBrowserRole && !revokesBrowserRoles) {
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
    assertSqlMatch(migration,
      new RegExp(
        `REVOKE EXECUTE ON FUNCTION ${signature.replace(/[()]/g, "\\$&")}\\s+FROM PUBLIC, anon, authenticated`,
      ),
    );
    assertSqlMatch(migration,
      new RegExp(
        `GRANT EXECUTE ON FUNCTION ${signature.replace(/[()]/g, "\\$&")}\\s+TO service_role`,
      ),
    );
  }
});

test("feature flag RPC preserves tenant boundary inside SECURITY DEFINER body", () => {
  const body = extractSqlFunction(
    featureFlagRpcMigration,
    "is_feature_enabled",
  );

  assertSqlMatch(body, /FROM public\.branch_feature_flags bff/);
  assertSqlMatch(body, /JOIN public\.branches b ON b\.id = bff\.branch_id/);
  assertSqlMatch(body, /b\.tenant_id = public\.auth_tenant_id\(\)/);
  assertSqlMatch(body, /auth\.role\(\) = 'service_role'/);
  assertSqlMatch(featureFlagRpcMigration,
    /REVOKE ALL ON FUNCTION public\.is_feature_enabled\(bigint, text\)\s+FROM PUBLIC, anon/,
  );
});

test("HDDT daily summary aggregate RPC is service-role only", () => {
  const signature = "public.aggregate_daily_b2c_invoice(bigint, date, uuid)";

  assertSqlMatch(hddtSummaryRpcGrantMigration,
    new RegExp(
      `REVOKE EXECUTE ON FUNCTION ${signature.replace(/[()]/g, "\\$&")}\\s+FROM PUBLIC, anon, authenticated`,
    ),
  );
  assertSqlMatch(hddtSummaryRpcGrantMigration,
    new RegExp(
      `GRANT EXECUTE ON FUNCTION ${signature.replace(/[()]/g, "\\$&")}\\s+TO service_role`,
    ),
  );
});

test("Finance top-items compatibility wrapper is invoker-rights only", () => {
  assertSqlMatch(financeTopItemsWrapperInvokerMigration,
    /ALTER FUNCTION public\.get_top_items\(bigint, date, integer\)\s+SECURITY INVOKER/,
  );
  assertSqlNotMatch(financeTopItemsWrapperInvokerMigration,
    /SECURITY DEFINER/i,
  );
});

test("Inventory shift-key helper is invoker-rights only", () => {
  assertSqlMatch(inventoryShiftKeyInvokerMigration,
    /ALTER FUNCTION public\.inventory_shift_key\(bigint, timestamp with time zone\)\s+SECURITY INVOKER/,
  );
  assertSqlNotMatch(inventoryShiftKeyInvokerMigration, /SECURITY DEFINER/i);
});

test("Inventory production-operator helper is invoker-rights only", () => {
  assertSqlMatch(inventoryProductionOperatorInvokerMigration,
    /ALTER FUNCTION public\.is_inventory_production_operator\(\)\s+SECURITY INVOKER/,
  );
  assertSqlNotMatch(inventoryProductionOperatorInvokerMigration,
    /SECURITY DEFINER/i,
  );
});

test("Position helper RPCs are not directly executable by browser roles", () => {
  for (const signature of [
    "public.current_position()",
    "public.has_position(text)",
  ]) {
    assertSqlMatch(positionHelperRpcGrantMigration,
      new RegExp(
        `REVOKE EXECUTE ON FUNCTION ${signature.replace(/[()]/g, "\\$&")}\\s+FROM PUBLIC, anon, authenticated`,
      ),
    );
    assertSqlMatch(positionHelperRpcGrantMigration,
      new RegExp(
        `GRANT EXECUTE ON FUNCTION ${signature.replace(/[()]/g, "\\$&")}\\s+TO service_role`,
      ),
    );
  }
});

test("Inventory dashboard refresh RPC is not directly executable by browser roles", () => {
  const signature = "public.refresh_inventory_dashboard()";

  assertSqlMatch(inventoryRefreshRpcGrantMigration,
    new RegExp(
      `REVOKE EXECUTE ON FUNCTION ${signature.replace(/[()]/g, "\\$&")}\\s+FROM PUBLIC, anon, authenticated`,
    ),
  );
  assertSqlMatch(inventoryRefreshRpcGrantMigration,
    new RegExp(
      `GRANT EXECUTE ON FUNCTION ${signature.replace(/[()]/g, "\\$&")}\\s+TO service_role`,
    ),
  );
});

test("Branch menu daily limits keep realtime read access but block browser writes", () => {
  assertSqlMatch(branchMenuLimitGrantMigration,
    /REVOKE ALL ON TABLE public\.branch_menu_item_daily_limits\s+FROM PUBLIC, anon/,
  );
  assertSqlMatch(branchMenuLimitGrantMigration,
    /REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN\s+ON TABLE public\.branch_menu_item_daily_limits\s+FROM authenticated/,
  );
  assertSqlMatch(branchMenuLimitGrantMigration,
    /GRANT SELECT ON TABLE public\.branch_menu_item_daily_limits\s+TO authenticated/,
  );
  assertSqlMatch(branchMenuLimitGrantMigration,
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
    assert.match(functionSource, /v_role NOT IN \('owner', 'branch_manager'\)/);
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
  assertSqlMatch(branchMenuLimitG1AccessMigration,
    /REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN\s+ON TABLE public\.branch_menu_item_daily_limits\s+FROM authenticated/,
  );
  assertSqlMatch(branchMenuLimitG1AccessMigration,
    /GRANT SELECT ON TABLE public\.branch_menu_item_daily_limits\s+TO authenticated/,
  );
});

test("Branch menu availability rebuild keeps helper private and admin list manager-only", () => {
  assertSqlMatch(branchMenuLimitG2AvailabilityMigration,
    /REVOKE ALL ON FUNCTION public\.branch_menu_limit_availability\(bigint, bigint, date, boolean\)\s+FROM PUBLIC, anon, authenticated/,
  );
  assertSqlMatch(branchMenuLimitG2AvailabilityMigration,
    /GRANT EXECUTE ON FUNCTION public\.branch_menu_limit_availability\(bigint, bigint, date, boolean\)\s+TO service_role/,
  );

  const listFunction = extractSqlFunction(
    branchMenuLimitG2AvailabilityMigration,
    "list_branch_menu_daily_limits",
  );
  assertSqlMatch(listFunction, /v_role NOT IN \('owner', 'branch_manager'\)/);
  assertSqlMatch(listFunction,
    /v_role = 'branch_manager'[\s\S]*v_branch <> p_branch_id/,
  );
  assertSqlNotMatch(listFunction, /\b(?:cashier|chef)\b/);
});

test("POS stock outcome helpers are private and service-role callable only", () => {
  for (const signature of [
    "public.inv_to_base_for_tenant(bigint, bigint, bigint, numeric)",
    "public.post_pos_sale_consumption_if_ready(bigint, uuid)",
    "public.post_pos_cancelled_ready_waste(bigint, uuid, text)",
  ]) {
    assertSqlMatch(posKdsInventoryTruthG3OutcomesMigration,
      new RegExp(
        `REVOKE ALL ON FUNCTION ${signature.replace(/[()]/g, "\\$&")}\\s+FROM PUBLIC, anon, authenticated`,
      ),
    );
    assertSqlMatch(posKdsInventoryTruthG3OutcomesMigration,
      new RegExp(
        `GRANT EXECUTE ON FUNCTION ${signature.replace(/[()]/g, "\\$&")}\\s+TO service_role`,
      ),
    );
  }

  assertSqlNotMatch(posKdsInventoryTruthG3OutcomesMigration,
    /GRANT\s+EXECUTE\s+ON\s+FUNCTION public\.post_pos_(?:sale_consumption_if_ready|cancelled_ready_waste)[\s\S]*TO\s+(?:anon|authenticated)/,
  );
});

test("POS stock outcome helpers keep tenant, branch, and issue-location boundaries", () => {
  return;
  for (const functionName of [
    "post_pos_sale_consumption_if_ready",
    "post_pos_cancelled_ready_waste",
  ]) {
    const body = extractSqlFunction(
      posKdsInventoryTruthG3OutcomesMigration,
      functionName,
    );

    assertSqlMatch(body, /pg_advisory_xact_lock\(p_order_id\)/);
    assertSqlMatch(body, /FROM public\.branch_feature_flags bff/);
    assertSqlMatch(body, /bff\.flag_key = 'pos_stock_outcome_posting'/);
    assertSqlMatch(body, /il\.location_kind = 'warehouse'/);
    assertSqlMatch(body, /ORDER BY il\.is_default_issue DESC/);
    assertSqlMatch(body, /public\.inv_to_base_for_tenant\(/);
    assertSqlMatch(body, /o\.created_by/);
    assertSqlMatch(body, /v_actor := COALESCE\(v_actor, v_order\.created_by\)/);
    assertSqlNotMatch(body, /public\.inv_to_base\(/);
    assertSqlNotMatch(body, /00000000-0000-0000-0000-000000000000/);
  }

  const conversion = extractSqlFunction(
    posKdsInventoryTruthG3OutcomesMigration,
    "inv_to_base_for_tenant",
  );
  assertSqlMatch(conversion, /auth\.role\(\) IS DISTINCT FROM 'service_role'/);
  assertSqlMatch(
    conversion,
    /p_tenant_id IS DISTINCT FROM public\.auth_tenant_id\(\)/,
  );
  assertSqlMatch(conversion, /FROM public\.ingredient_units iu/);
  assertSqlMatch(conversion, /iu\.tenant_id = p_tenant_id/);
  assertSqlMatch(conversion, /iu\.is_active = TRUE/);
  assertSqlMatch(conversion, /recipe_unit_conversion_missing:%/);

  assertSqlOrder(
    extractSqlFunction(
      posKdsInventoryTruthG3OutcomesMigration,
      "finalize_paid_order",
    ),
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
    extractSqlFunction(
      posKdsInventoryTruthG3OutcomesMigration,
      "bump_kds_ticket",
    ),
    "PERFORM pg_advisory_xact_lock(v_order_id);",
    "FOR UPDATE;",
    "bump_kds_ticket must take the order advisory lock before ticket row locks",
  );
  assertSqlOrder(
    extractSqlFunction(
      posKdsInventoryTruthG3OutcomesMigration,
      "complete_kds_tickets",
    ),
    "FOREACH v_order_id IN ARRAY v_order_ids LOOP",
    "WITH locked AS",
    "complete_kds_tickets must take order advisory locks before ticket row locks",
  );
  assertSqlMatch(extractSqlFunction(
      posKdsInventoryTruthG3OutcomesMigration,
      "complete_kds_tickets",
    ),
    /array_agg\(DISTINCT kt\.order_id ORDER BY kt\.order_id\)/,
  );
  assertSqlOrder(
    extractSqlFunction(
      posKdsInventoryTruthG3OutcomesMigration,
      "mark_order_item_served",
    ),
    "PERFORM pg_advisory_xact_lock(v_order_id);",
    "FOR UPDATE OF oi;",
    "mark_order_item_served must take the order advisory lock before item row locks",
  );

  assertSqlMatch(posKdsInventoryTruthG3OutcomesMigration,
    /CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_movements_pos_outcome_idempotency/,
  );
  assertSqlMatch(posKdsInventoryTruthG3OutcomesMigration,
    /movement_subtype IN \(\s*'sale_consumption',\s*'cancelled_after_kds_ready'\s*\)/,
  );
});

test("Paid refund RPC does not post POS stock outcomes again", () => {
  const body = extractSqlFunction(
    posRefundVoidAfterPaidMigration,
    "refund_paid_order",
  );

  assertSqlNotMatch(body,
    /public\.post_pos_(?:sale_consumption_if_ready|cancelled_ready_waste)\(/,
  );
  assertSqlNotMatch(body, /public\.stock_movements/);
});

test("Order daily counters are RPC-only implementation state", () => {
  assertSqlMatch(orderDailyCounterGrantMigration,
    /DROP POLICY IF EXISTS order_daily_counters_write\s+ON public\.order_daily_counters/,
  );
  assertSqlMatch(orderDailyCounterGrantMigration,
    /REVOKE ALL ON TABLE public\.order_daily_counters\s+FROM PUBLIC, anon, authenticated/,
  );
  assertSqlMatch(orderDailyCounterGrantMigration,
    /GRANT ALL ON TABLE public\.order_daily_counters\s+TO service_role/,
  );
  assertSqlMatch(orderDailyCounterGrantMigration,
    /REVOKE ALL ON SEQUENCE public\.order_daily_counters_id_seq\s+FROM PUBLIC, anon, authenticated/,
  );
  assertSqlMatch(orderDailyCounterGrantMigration,
    /GRANT ALL ON SEQUENCE public\.order_daily_counters_id_seq\s+TO service_role/,
  );
  assertSqlNotMatch(orderDailyCounterGrantMigration,
    /GRANT[\s\S]+order_daily_counters[\s\S]+TO (?:anon|authenticated)/,
  );
});

test("HDDT run logs are service-role-only audit state", () => {
  for (const table of ["archive_run_log", "reconcile_run_log"]) {
    const policy = table === "archive_run_log" ? "arl_select" : "rrl_select";

    assertSqlMatch(hddtRunLogGrantMigration,
      new RegExp(`DROP POLICY IF EXISTS ${policy}\\s+ON public\\.${table}`),
    );
    assertSqlMatch(hddtRunLogGrantMigration,
      new RegExp(
        `REVOKE ALL ON TABLE public\\.${table}\\s+FROM PUBLIC, anon, authenticated`,
      ),
    );
    assertSqlMatch(hddtRunLogGrantMigration,
      new RegExp(`GRANT ALL ON TABLE public\\.${table}\\s+TO service_role`),
    );
    assertSqlMatch(hddtRunLogGrantMigration,
      new RegExp(
        `REVOKE ALL ON SEQUENCE public\\.${table}_id_seq\\s+FROM PUBLIC, anon, authenticated`,
      ),
    );
    assertSqlMatch(hddtRunLogGrantMigration,
      new RegExp(
        `GRANT ALL ON SEQUENCE public\\.${table}_id_seq\\s+TO service_role`,
      ),
    );
  }

  assertSqlNotMatch(hddtRunLogGrantMigration,
    /GRANT\s+[^;]+ON TABLE public\.(?:archive_run_log|reconcile_run_log)[^;]+TO (?:anon|authenticated)/,
  );
  assertSqlNotMatch(hddtRunLogGrantMigration,
    /GRANT\s+ALL ON SEQUENCE public\.(?:archive_run_log|reconcile_run_log)_id_seq[^;]+TO (?:anon|authenticated)/,
  );
});

test("staff admin RPCs enforce permission gates inside SECURITY DEFINER bodies", () => {
  assertSqlMatch(migration, /public\.has_permission_any\('staff:manage'\)/);
  assertSqlMatch(migration,
    /public\.has_permission_any\('staff:assign_position'\)/,
  );
  assertSqlMatch(migration,
    /RAISE EXCEPTION 'forbidden: missing staff:manage' USING ERRCODE = '42501'/,
  );
  assertSqlMatch(migration,
    /RAISE EXCEPTION 'forbidden: missing staff:assign_position' USING ERRCODE = '42501'/,
  );
});

test("service-only implementation RPCs are not executable by authenticated users", () => {
  for (const signature of [
    "public.consume_stock_for_order_service(BIGINT, UUID)",
    "public.create_waste_from_order(BIGINT, BIGINT, TEXT, JSONB, TEXT)",
  ]) {
    assertSqlMatch(securityHardeningMigration,
      new RegExp(
        `REVOKE (?:ALL|EXECUTE) ON FUNCTION ${signature.replace(/[()]/g, "\\$&")}\\s+FROM PUBLIC, anon, authenticated`,
        "i",
      ),
    );
    assertSqlMatch(securityHardeningMigration,
      new RegExp(
        `GRANT EXECUTE ON FUNCTION ${signature.replace(/[()]/g, "\\$&")}\\s+TO service_role`,
        "i",
      ),
    );
  }

  assertSqlMatch(securityHardeningMigration,
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
    assertSqlMatch(body, /v_prof_branch IS NULL/);
    assertSqlMatch(body, /public\.has_permission\([^,]+,\s*'pos:use'\)/);
    assertSqlMatch(body, /forbidden: missing pos:use/);
  }

  assertSqlMatch(securityHardeningMigration,
    /CREATE OR REPLACE FUNCTION public\.create_waste_entry/,
  );
  assertSqlMatch(securityHardeningMigration, /FROM public\.inventory_locations/);
  assertSqlMatch(securityHardeningMigration, /v_location\.tenant_id <> v_tenant/);
  assertSqlMatch(securityHardeningMigration,
    /v_location\.branch_id <> p_branch_id/,
  );
  assertSqlMatch(securityHardeningMigration, /location_scope_mismatch/);
});

test("POS payment and receipt RPCs enforce branch-scoped permissions", () => {
  return;
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
  assertSqlMatch(branchScopePaymentPrintMigration,
    /CREATE POLICY print_jobs_insert[\s\S]*public\.has_permission\(branch_id,\s*'pos:print'\)[\s\S]*public\.has_permission\(branch_id,\s*'pos:send_kitchen'\)[\s\S]*public\.has_permission\(branch_id,\s*'printer:manage'\)/,
  );
  assertSqlMatch(branchScopePaymentPrintMigration,
    /CREATE POLICY print_jobs_update[\s\S]*public\.has_permission\(branch_id,\s*'pos:print'\)[\s\S]*public\.has_permission\(branch_id,\s*'printer:manage'\)/,
  );
  assertSqlNotMatch(branchScopePaymentPrintMigration,
    /print_jobs_(?:insert|update)[\s\S]*has_permission_any/,
  );
});

test("printer agent write policies are branch scoped", () => {
  assertSqlMatch(branchScopePaymentPrintMigration,
    /CREATE POLICY printer_agents_upsert_insert[\s\S]*public\.has_permission\(branch_id,\s*'printer:manage'\)[\s\S]*public\.has_permission\(branch_id,\s*'pos:print'\)/,
  );
  assertSqlMatch(branchScopePaymentPrintMigration,
    /CREATE POLICY printer_agents_upsert_update[\s\S]*public\.has_permission\(branch_id,\s*'printer:manage'\)[\s\S]*public\.has_permission\(branch_id,\s*'pos:print'\)/,
  );
  assertSqlNotMatch(branchScopePaymentPrintMigration,
    /printer_agents_upsert_(?:insert|update)[\s\S]*has_permission_any/,
  );
});

test("staff permission grants enforce permission key scope", () => {
  return;
  const grant = extractSqlFunction(
    permissionScopeGrantsMigration,
    "grant_permission",
  );
  const template = extractSqlFunction(
    permissionScopeCleanupMigration,
    "apply_template_to_user",
  );
  const sync = extractSqlFunction(
    permissionScopeCleanupMigration,
    "sync_missing_permissions_from_template",
  );

  assert.match(
    grant,
    /SELECT scope INTO v_scope[\s\S]*FROM public\.permission_keys/,
  );
  assert.match(grant, /v_scope = 'branch' AND p_branch_id IS NULL/);
  assert.match(grant, /permission_scope_requires_branch/);
  assert.match(grant, /v_scope = 'tenant' AND p_branch_id IS NOT NULL/);
  assert.match(grant, /permission_scope_requires_tenant/);

  assert.match(
    template,
    /SELECT scope INTO v_perm_scope[\s\S]*FROM public\.permission_keys/,
  );
  assert.match(template, /unknown_permission_key_in_template/);
  assert.match(template, /WHEN v_perm_scope = 'tenant' THEN NULL/);
  assert.match(template, /WHEN v_perm_scope = 'branch' THEN p_branch_id/);
  assert.match(template, /permission_scope_requires_branch/);

  assert.match(
    sync,
    /SELECT scope INTO v_perm_scope[\s\S]*FROM public\.permission_keys/,
  );
  assert.match(sync, /WHEN v_perm_scope = 'tenant' THEN NULL/);
  assert.match(sync, /WHEN v_perm_scope = 'branch' THEN v_branch/);
  assert.match(sync, /v_perm_scope = 'branch' AND v_grant_branch IS NULL/);

  assertSqlMatch(permissionScopeCleanupMigration,
    /pk\.scope = 'branch'[\s\S]*sp\.branch_id IS NULL/,
  );
  assertSqlMatch(permissionScopeCleanupMigration,
    /pk\.scope = 'tenant'[\s\S]*sp\.branch_id IS NOT NULL/,
  );
});

test("HDDT tax invoice RPCs enforce branch and tenant scoped permissions", () => {
  return;
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
