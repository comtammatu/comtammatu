import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
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

const migration = readRepoFile(
  "supabase/migrations/_archive/20260601860000_security_definer_rpc_hardening.sql",
);
const securityHardeningMigration = readRepoFile(
  "supabase/migrations/_archive/20260619062853_security_rpc_cron_runner_hardening.sql",
);
const branchScopePaymentPrintMigration = readRepoFile(
  "supabase/migrations/20260625130000_branch_scope_pos_payment_print.sql",
);
const permissionScopeGrantsMigration = readRepoFile(
  "supabase/migrations/20260625131000_permission_scope_grants.sql",
);
const hddtTaxInvoiceRpcScopeMigration = readRepoFile(
  "supabase/migrations/20260625132000_hddt_tax_invoice_rpc_scope.sql",
);
const retiredIntraBranchRpcMigration = readRepoFile(
  "supabase/migrations/20260625075939_harden_retired_intra_branch_rpc.sql",
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

function extractSqlFunction(source: string, functionName: string): string {
  return (
    source.match(
      new RegExp(
        `CREATE OR REPLACE FUNCTION public\\.${functionName}\\([\\s\\S]*?\\n\\$\\$;`,
      ),
    )?.[0] ?? ""
  );
}

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
    permissionScopeGrantsMigration,
    "apply_template_to_user",
  );

  assert.match(grant, /SELECT scope INTO v_scope[\s\S]*FROM public\.permission_keys/);
  assert.match(grant, /v_scope = 'branch' AND p_branch_id IS NULL/);
  assert.match(grant, /permission_scope_requires_branch/);
  assert.match(grant, /v_scope = 'tenant' AND p_branch_id IS NOT NULL/);
  assert.match(grant, /permission_scope_requires_tenant/);

  assert.match(template, /LEFT JOIN public\.permission_keys pk/);
  assert.match(template, /unknown_permission_key_in_template/);
  assert.match(template, /p_branch_id IS NULL AND pk\.scope = 'branch'/);
  assert.match(template, /p_branch_id IS NOT NULL AND pk\.scope = 'tenant'/);
  assert.match(template, /permission_scope_mismatch/);
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
