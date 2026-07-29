import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { normalizePgDumpSql } from "./sql-test-utils";

const root = fileURLToPath(new URL("../../../", import.meta.url));

function read(path: string): string {
  return readFileSync(`${root}${path}`, "utf8");
}

function filesUnder(path: string): string[] {
  return readdirSync(`${root}${path}`, { withFileTypes: true }).flatMap(
    (entry) => {
      const entryPath = `${path}/${entry.name}`;
      if (entry.isDirectory()) return filesUnder(entryPath);
      if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) return [entryPath];
      return [];
    },
  );
}

function escaped(pattern: string): RegExp {
  return new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
}

function section(path: string, start: string, end: string): string {
  const source = read(path);
  const from = source.indexOf(start);
  assert.ok(from >= 0, `${start} not found in ${path}`);
  const to = source.indexOf(end, from);
  assert.ok(to >= 0, `${end} not found in ${path}`);
  return source.slice(from, to);
}

function assertActionCallsDoNotSendUnit(path: string, callName: string): void {
  const source = read(path);
  const calls = source.matchAll(
    new RegExp(`${callName}\\(\\{[\\s\\S]*?\\}\\);`, "g"),
  );
  let count = 0;
  for (const call of calls) {
    count++;
    assert.doesNotMatch(call[0], /\bunit\s*:/, `${path} ${callName}`);
  }
  assert.ok(count > 0, `${callName} not found in ${path}`);
}

function latestMigrationDefining(functionName: string): {
  file: string;
  sql: string;
} {
  const migrationDir = `${root}supabase/migrations`;
  const matches = readdirSync(migrationDir)
    .filter((file) => /^\d+_.*\.sql$/.test(file))
    .map((file) => ({
      file,
      sql: normalizePgDumpSql(read(`supabase/migrations/${file}`)),
    }))
    .filter(({ sql }) => sql.includes(`CREATE FUNCTION public.${functionName}`))
    .sort((left, right) => left.file.localeCompare(right.file));
  const match = matches.at(-1);
  assert.ok(match, `${functionName} migration not found`);
  return match;
}

test("active inventory reads do not select dropped unit columns", () => {
  const checks = new Map([
    [
      "apps/web/app/(protected)/inventory/count-slips/page.tsx",
      [/ingredients\s*\(\s*name,\s*unit\s*\)/],
    ],
    [
      "apps/web/app/(protected)/inventory/transfer-actions.ts",
      [/ingredients\s*\(\s*id,\s*name,\s*unit,\s*purchase_unit\s*\)/],
    ],
    [
      "apps/web/app/(protected)/inventory/issues/issues-page-content.tsx",
      [/ingredients\s*\(\s*name,\s*unit\s*\)/],
    ],
    [
      "apps/web/app/(protected)/inventory/issue-actions.ts",
      [/\bquantity,\s*unit,\s*entry_unit_id\b/],
    ],
    [
      "apps/web/app/(protected)/inventory/menu-recipe-actions.ts",
      [/\bingredient_id,\s*quantity,\s*unit,\s*entry_unit_id\b/],
    ],
  ]);

  for (const [path, patterns] of checks) {
    const source = read(path);
    for (const pattern of patterns) {
      assert.doesNotMatch(source, pattern, path);
    }
  }
});

test("active inventory reads use explicit PostgREST unit relationships", () => {
  for (const path of filesUnder("apps/web/app/(protected)/inventory")) {
    const source = read(path);
    assert.doesNotMatch(source, /\bingredient_units\s*\(/, path);
    assert.doesNotMatch(source, /units!ingredient_units_unit_id_fkey/, path);
  }
});

test("active app code does not use ambiguous or dropped inventory unit fields", () => {
  for (const rootPath of ["apps/web/app", "apps/web/lib"]) {
    for (const path of filesUnder(rootPath)) {
      const source = read(path);
      assert.doesNotMatch(source, /\bingredient_units\s*\(/, path);
      assert.doesNotMatch(
        source,
        /ingredient_units_(?:ingredient|unit)_id_fkey/,
        path,
      );
      assert.doesNotMatch(
        source,
        /\b(?:purchase_unit|measure_unit|purchase_to_measure_factor|allow_purchase|allow_issue|allow_production)\b/,
        path,
      );
    }
  }
});

test("post Phase C migrations do not reference dropped ingredient unit fields", () => {
  const migrationDir = `${root}supabase/migrations`;
  const files = readdirSync(migrationDir)
    .filter((file) => /^\d+_.*\.sql$/.test(file))
    .filter((file) => file !== "20260717151345_baseline.sql")
    .filter(
      (file) => file > "20260707002300_inventory_unit_system_phase_c.sql",
    );

  for (const file of files) {
    const sql = normalizePgDumpSql(read(`supabase/migrations/${file}`));
    assert.doesNotMatch(
      sql,
      /\bing\.(?:purchase_unit|measure_unit|purchase_to_measure_factor|unit)\b/,
      file,
    );
    assert.doesNotMatch(
      sql,
      /\bingredients\.(?:purchase_unit|measure_unit|purchase_to_measure_factor|unit)\b/,
      file,
    );
    assert.doesNotMatch(sql, /\ballow_(?:purchase|issue|production)\b/, file);
  }
});

test("latest menu recipe upsert RPC does not write dropped unit text", () => {
  const { file, sql } = latestMigrationDefining("upsert_recipe_lines");
  const from = sql.indexOf("CREATE FUNCTION public.upsert_recipe_lines");
  const to = sql.indexOf(
    "REVOKE ALL ON FUNCTION public.upsert_recipe_lines",
    from,
  );
  assert.ok(from >= 0, `upsert_recipe_lines not found in ${file}`);
  assert.ok(to >= 0, `upsert_recipe_lines ACL not found in ${file}`);
  const body = sql.slice(from, to);

  assert.match(sql, /public\.inventory_entry_unit_code\(/);
  assert.doesNotMatch(
    body,
    /INSERT INTO public\.recipes[\s\S]*\bunit\b[\s\S]*VALUES/,
  );
  assert.doesNotMatch(body, /\bunit\s*=\s*EXCLUDED\.unit\b/);
});

test.skip("inventory entry units are persisted inside atomic RPCs", () => {
  const sql = read(
    "supabase/migration-archive/20260629125621_persist_entry_unit_in_atomic_rpcs.sql",
  );

  for (const table of [
    "public.production_order_items",
    "public.stock_transfer_items",
    "public.production_recipes",
    "public.recipes",
  ]) {
    assert.match(sql, new RegExp(`INSERT INTO ${table}[\\s\\S]*entry_unit_id`));
  }

  assert.equal(
    (sql.match(/entry_unit_id = EXCLUDED\.entry_unit_id/g) ?? []).length,
    4,
  );

  for (const key of [
    "line->>'entryUnitId'",
    "line.value->>'entryUnitId'",
    "v_line->>'entry_unit_id'",
  ]) {
    assert.match(sql, escaped(key), key);
  }
});

test.skip("server actions do not patch entry units after RPC success", () => {
  for (const path of [
    "apps/web/app/(protected)/inventory/production-run-actions.ts",
    "apps/web/app/(protected)/inventory/production-recipe-actions.ts",
    "apps/web/app/(protected)/inventory/menu-recipe-actions.ts",
    "apps/web/app/(protected)/inventory/transfer-actions.ts",
  ]) {
    const source = read(path);
    assert.doesNotMatch(source, /\.update\(\{\s*entry_unit_id/s, path);
    assert.doesNotMatch(source, /error:\s*(?:error|rpcError)\.message/, path);
  }
});

test.skip("server action payload keys match the RPC contract", () => {
  const actionPayloads = new Map([
    [
      "apps/web/app/(protected)/inventory/production-run-actions.ts",
      "entryUnitId: item.entryUnitId ?? null",
    ],
    [
      "apps/web/app/(protected)/inventory/transfer-actions.ts",
      "entryUnitId: line.entryUnitId ?? null",
    ],
    [
      "apps/web/app/(protected)/inventory/menu-recipe-actions.ts",
      "entry_unit_id: line.entryUnitId ?? null",
    ],
    [
      "apps/web/app/(protected)/inventory/production-recipe-actions.ts",
      "entry_unit_id: line.entryUnitId ?? null",
    ],
  ]);

  for (const [path, payloadLine] of actionPayloads) {
    assert.match(read(path), escaped(payloadLine));
  }
});

test.skip("transaction write callers do not send unit text/code", () => {
  for (const path of [
    "apps/web/app/(protected)/inventory/grn-actions.ts",
    "apps/web/app/(protected)/inventory/issue-actions.ts",
    "apps/web/app/(protected)/inventory/waste-actions.ts",
    "apps/web/app/(protected)/inventory/production-run-actions.ts",
    "apps/web/app/(protected)/inventory/transfer-actions.ts",
    "apps/web/app/(protected)/inventory/menu-recipe-actions.ts",
    "apps/web/app/(protected)/inventory/production-recipe-actions.ts",
  ]) {
    assert.doesNotMatch(
      read(path),
      /\bunit:\s*z\.string\(\)\.optional\(\)/,
      path,
    );
  }

  for (const [path, callName] of [
    [
      "apps/web/app/(protected)/inventory/grn/new/[supplierId]/grn-create-client.tsx",
      "upsertGrnLine",
    ],
    ["apps/web/lib/inventory/use-grn-detail-actions.ts", "upsertGrnLine"],
    [
      "apps/web/app/(protected)/inventory/grn/[id]/views/add-grn-line-dialog.tsx",
      "upsertGrnLine",
    ],
    [
      "apps/web/app/(protected)/inventory/production-order-form.tsx",
      "createProductionOrder",
    ],
    [
      "apps/web/app/(protected)/inventory/production-recipe-panel.tsx",
      "upsertProductionRecipeLines",
    ],
    [
      "apps/web/app/(protected)/inventory/menu-recipes/menu-recipe-line-dialog.tsx",
      "upsertMenuRecipeLines",
    ],
    [
      "apps/web/app/(protected)/inventory/issues/[id]/issue-detail-client.tsx",
      "upsertStockIssueLine",
    ],
    [
      "apps/web/app/(protected)/inventory/stock/stock-client.tsx",
      "upsertStockIssueLine",
    ],
    [
      "apps/web/app/(protected)/inventory/waste/new/waste-create-client.tsx",
      "createWasteEntry",
    ],
    [
      "apps/web/app/(protected)/inventory/transfers/create-transfer-dialog.tsx",
      "createStockTransfer",
    ],
  ] as const) {
    assertActionCallsDoNotSendUnit(path, callName);
  }
});

test.skip("direct table writes derive persisted unit text from the entry unit catalog", () => {
  const helper = read(
    "apps/web/app/(protected)/inventory/_lib/entry-unit-code.ts",
  );

  assert.match(helper, /\.eq\("unit_id", entryUnitId\)/);
  assert.match(helper, /\.eq\("is_base", true\)/);
  assert.match(helper, /\.eq\("ingredient_id", ingredientId\)/);
  assert.match(helper, /\.eq\("tenant_id", tenantId\)/);
  assert.doesNotMatch(helper, /\.eq\("id", entryUnitId\)/);
  assert.doesNotMatch(helper, /fallbackUnit/);

  for (const path of [
    "apps/web/app/(protected)/inventory/grn-actions.ts",
    "apps/web/app/(protected)/inventory/issue-actions.ts",
  ]) {
    const source = read(path);
    assert.match(source, /resolveEntryUnitCode/, path);
    assert.match(source, /unit:\s*resolvedUnit\.unit/, path);
    assert.doesNotMatch(source, /fallbackUnit/, path);
  }
});

test("menu recipe editor fixes entry unit to the ingredient output unit", () => {
  const editor = section(
    "apps/web/app/(protected)/inventory/menu-recipes/menu-recipe-line-dialog.tsx",
    "<IngredientLinesEditor",
    "/>",
  );

  assert.doesNotMatch(editor, /\bunitEditable\b/);
});

test("menu and production recipe DTOs expose unitLabel", () => {
  const sections = new Map([
    [
      "IngredientLineOption",
      section(
        "apps/web/app/(protected)/inventory/_components/ingredient-lines-editor.tsx",
        "export interface IngredientLineOption",
        "export interface IngredientLineRowValue",
      ),
    ],
    [
      "IngredientLineRowValue",
      section(
        "apps/web/app/(protected)/inventory/_components/ingredient-lines-editor.tsx",
        "export interface IngredientLineRowValue",
        "const GRID_TEMPLATE",
      ),
    ],
    [
      "MenuRecipeLineDraft",
      section(
        "apps/web/app/(protected)/inventory/menu-recipes/menu-recipe-line-dialog.tsx",
        "export interface MenuRecipeLineDraft",
        "const menuRecipeLineRowSchema",
      ),
    ],
    [
      "MenuRecipeItem",
      section(
        "apps/web/app/(protected)/inventory/menu-recipes/menu-recipes-client.tsx",
        "export type MenuRecipeItem",
        "export type MenuRecipeRow",
      ),
    ],
    [
      "ProductionRecipeRow",
      section(
        "apps/web/app/(protected)/inventory/production-recipe-actions.ts",
        "export interface ProductionRecipeRow",
        "type ProductionRecipeQueryRow",
      ),
    ],
  ]);

  for (const [name, source] of sections) {
    assert.match(source, /\bunitLabel\b/, name);
    assert.doesNotMatch(source, /\bunit:\s*string\b/, name);
  }

  assert.doesNotMatch(
    read(
      "apps/web/app/(protected)/inventory/menu-recipes/menu-recipes-client.tsx",
    ),
    /\bitem\.unit\b/,
  );
  assert.doesNotMatch(
    read(
      "apps/web/app/(protected)/inventory/menu-recipes/menu-recipe-line-dialog.tsx",
    ),
    /\b(?:l|row)\.unit\b/,
  );
  assert.doesNotMatch(
    read("apps/web/app/(protected)/inventory/production-recipe-panel.tsx"),
    /\brecipe\.unit\b/,
  );
  assert.doesNotMatch(
    read("apps/web/app/(protected)/inventory/production-recipe-actions.ts"),
    /\brow\.unit\b/,
  );
});

test.skip("RPC-backed inventory writes let the RPC derive persisted unit text", () => {
  for (const path of [
    "apps/web/app/(protected)/inventory/production-run-actions.ts",
    "apps/web/app/(protected)/inventory/waste-actions.ts",
    "apps/web/app/(protected)/inventory/menu-recipe-actions.ts",
    "apps/web/app/(protected)/inventory/production-recipe-actions.ts",
  ]) {
    const source = read(path);
    assert.doesNotMatch(source, /resolveEntryUnitCode/, path);
    assert.doesNotMatch(source, /unit:\s*resolvedUnit\.unit/, path);
  }
  assert.doesNotMatch(
    read("apps/web/app/(protected)/inventory/transfer-actions.ts"),
    /unit:\s*resolvedUnit\.unit/,
  );
});

test.skip("inventory RPCs derive persisted unit text from the unit catalog", () => {
  const migration = read(
    "supabase/migration-archive/20260704193015_inventory_unit_rpc_contract.sql",
  );
  const baseline = read("supabase/migrations/20260727120000_baseline.sql");

  for (const sql of [migration, baseline]) {
    assert.match(sql, /inventory_entry_unit_code/);
    assert.match(sql, /iu\.unit_id = p_entry_unit_id/);
    assert.match(sql, /iu\.is_base = TRUE/);
    assert.doesNotMatch(sql, /iu\.id = p_entry_unit_id/);
  }

  for (const sql of [migration, baseline]) {
    assert.doesNotMatch(sql, /NULLIF\(btrim\(line->>'unit'\), ''\)/i);
    assert.doesNotMatch(
      sql,
      /line \? 'finishedGoodId' AND line \? 'quantity' AND line \? 'unit'/,
    );
    assert.doesNotMatch(sql, /\bx\.unit\b/);
    assert.doesNotMatch(sql, /line\.value \? 'unit'/);
    assert.doesNotMatch(sql, /line\.value->>'unit'/);
    assert.doesNotMatch(sql, /COALESCE\(v_item->>'unit', 'kg'\)/);
    assert.doesNotMatch(sql, /btrim\(v_line->>'unit'\)/);
  }

  assert.doesNotMatch(
    read("apps/web/app/(protected)/inventory/waste-actions.ts"),
    /\bp_unit:/,
  );
});

test.skip("expiry writeoff RPC does not accept a unit text argument", () => {
  const migration = read(
    "supabase/migration-archive/20260704200923_inventory_drop_expiry_writeoff_unit_arg.sql",
  );
  const bridge = read(
    "supabase/migration-archive/20260704214448_inventory_expiry_writeoff_optional_unit_bridge.sql",
  );
  const baseline = read("supabase/migrations/20260727120000_baseline.sql");
  const action = read("apps/web/app/(protected)/inventory/waste-actions.ts");

  assert.match(
    migration,
    /DROP FUNCTION IF EXISTS public\.create_expiry_writeoff\([\s\S]*?text[\s\S]*?\);/,
  );
  assert.doesNotMatch(
    migration,
    /CREATE OR REPLACE FUNCTION public\.create_expiry_writeoff\([\s\S]*?p_unit text/,
  );
  assert.doesNotMatch(
    baseline,
    /CREATE FUNCTION public\.create_expiry_writeoff\([\s\S]*?p_unit text/,
  );
  assert.doesNotMatch(action, /\bp_unit:/);
  assert.match(bridge, /to_regprocedure\(/);
  assert.match(bridge, /p_unit text DEFAULT NULL::text/);
  assert.match(bridge, /RETURN;/);
});

test.skip("production recipe bulk import stores catalog-derived units", () => {
  const migration = read(
    "supabase/migration-archive/20260704193015_inventory_unit_rpc_contract.sql",
  );
  const fnStart = migration.indexOf(
    "CREATE OR REPLACE FUNCTION public.bulk_import_production_recipes",
  );
  assert.ok(fnStart >= 0, "bulk_import_production_recipes override not found");
  const fnBody = migration.slice(fnStart, fnStart + 7000);

  assert.match(
    fnBody,
    /public\.inventory_entry_unit_code\(v_tenant, lines\.ingredient_id, lines\.entry_unit_id\)/,
  );
  assert.doesNotMatch(fnBody, /raw\.value->>'unit'/);
  assert.doesNotMatch(fnBody, /lines\.unit/);

  const action = read(
    "apps/web/app/(protected)/inventory/production-recipe-actions.ts",
  );
  assert.match(action, /resolveImportEntryUnit\(ingredient, unitRaw\)/);
  assert.match(action, /entry_unit_id:\s*line\.entryUnitId/);
});

test.skip("employee count slip prefill preserves the submitted entry unit", () => {
  const sql = read(
    "supabase/migration-archive/20260629144912_employee_count_slip_entry_unit_prefill.sql",
  );

  assert.match(sql, /entry_unit_id\s+BIGINT/);
  assert.match(
    sql,
    /SELECT\s+l\.ingredient_id,\s+l\.counted_quantity,\s+l\.entry_unit_id,\s+l\.note/s,
  );
  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION public\.get_my_count_slip\(BIGINT\) FROM PUBLIC, anon/,
  );
});

test.skip("stock transfer receive converts received entry quantities to base units", () => {
  const sql = read(
    "supabase/migration-archive/20260706071001_stock_transfer_receive_base_quantity.sql",
  );
  const fnStart = sql.indexOf(
    "CREATE OR REPLACE FUNCTION public.stock_transfer_receive",
  );
  assert.ok(fnStart >= 0, "stock_transfer_receive override not found");
  const fnBody = sql.slice(
    fnStart,
    sql.indexOf(
      "REVOKE ALL ON FUNCTION public.stock_transfer_receive",
      fnStart,
    ),
  );

  assert.match(fnBody, /v_recv_base\s+NUMERIC\(15,3\)/);
  assert.match(
    fnBody,
    /v_recv_base := public\.inv_to_base\(v_line\.ingredient_id, v_line\.entry_unit_id, v_recv\)::NUMERIC\(15,3\);/,
  );
  assert.match(fnBody, /'transfer_in', v_recv_base/);
  assert.doesNotMatch(fnBody, /'transfer_in', v_recv,/);
  assert.match(fnBody, /entry_unit_id, entry_quantity/);
  assert.match(fnBody, /v_line\.entry_unit_id, v_recv/);

  assert.match(sql, /sm\.entry_unit_id IS NULL/);
  assert.match(sql, /sm\.entry_quantity IS NULL/);
  assert.match(
    sql,
    /ABS\(sm\.quantity_change - COALESCE\(sti\.quantity_received, sti\.quantity\)\) <= 0\.0005/,
  );
  assert.match(sql, /current_quantity = sl\.current_quantity \+ agg\.delta/);
});

test.skip("GRN amend and historical GRN movements use base quantities", () => {
  const sql = read(
    "supabase/migration-archive/20260706084233_grn_base_quantity_legacy_cleanup.sql",
  );
  const fnStart = sql.indexOf(
    "CREATE OR REPLACE FUNCTION public.amend_grn_line",
  );
  assert.ok(fnStart >= 0, "amend_grn_line override not found");
  const fnBody = sql.slice(fnStart, sql.indexOf("DO $$", fnStart));

  assert.match(
    fnBody,
    /v_old_net_base := public\.inv_to_base\(v_line\.ingredient_id, v_line\.entry_unit_id, v_old_net\);/,
  );
  assert.match(
    fnBody,
    /v_new_net_base := public\.inv_to_base\(v_line\.ingredient_id, v_line\.entry_unit_id, v_new_net\);/,
  );
  assert.match(fnBody, /v_delta_base := v_new_net_base - v_old_net_base;/);
  assert.match(
    fnBody,
    /WHERE tenant_id = v_tenant[\s\S]*location_id = v_location_id[\s\S]*ingredient_id = v_line\.ingredient_id/,
  );
  assert.match(fnBody, /'grn_amend',\s*\n\s*v_delta_base/);
  assert.match(fnBody, /entry_unit_id, entry_quantity/);
  assert.match(fnBody, /v_line\.entry_unit_id, ABS\(v_delta_qty\)/);
  assert.doesNotMatch(fnBody, /'grn_amend',\s*\n\s*v_delta_qty/);

  assert.match(sql, /grn_entry_unit_backfill_missing_conversion/);
  assert.match(sql, /grn_amend_backfill_requires_manual_review/);
  assert.match(sql, /sm\.type = 'grn_receipt'/);
  assert.match(sql, /COALESCE\(sm\.entry_unit_id, gi\.entry_unit_id\)/);
  assert.match(sql, /SET quantity_change = CASE/);
  assert.match(sql, /unit_cost = targets\.expected_unit_cost/);
  assert.match(sql, /entry_unit_id = targets\.entry_unit_id/);
  assert.match(sql, /entry_quantity = targets\.entry_quantity/);
  assert.match(sql, /current_quantity = sl\.current_quantity \+ agg\.delta/);
  assert.match(sql, /avg_unit_cost = CASE/);
});

test("inventory unit closure backfills old null entry units and resolves production run base unit", () => {
  const sql = read(
    "supabase/migration-archive/20260708103000_inventory_unit_closure.sql",
  );

  for (const table of [
    "production_recipes",
    "production_runs",
    "stock_issue_items",
    "stock_transfer_items",
    "stocktake_lines",
    "stock_movements",
  ]) {
    assert.match(
      sql,
      new RegExp(
        `UPDATE public\\.${table}[\\s\\S]*entry_unit_id = bu\\.unit_id`,
      ),
      table,
    );
  }

  assert.match(
    sql,
    /UPDATE public\.stock_movements sm[\s\S]*entry_quantity = COALESCE\(sm\.entry_quantity, ABS\(sm\.quantity_change\)\)/,
  );

  const productionStart = sql.indexOf(
    "CREATE OR REPLACE FUNCTION public.create_production_run",
  );
  assert.ok(productionStart >= 0, "create_production_run override not found");
  const nextFunctionStart = sql.indexOf(
    "CREATE OR REPLACE FUNCTION",
    productionStart + 1,
  );
  assert.ok(nextFunctionStart > productionStart, "next function not found");
  const productionBody = sql.slice(productionStart, nextFunctionStart);
  assert.match(productionBody, /v_entry_unit_id bigint := p_entry_unit_id/);
  assert.match(productionBody, /iu\.ingredient_id = p_finished_good_id/);
  assert.match(productionBody, /iu\.is_base = TRUE/);
  assert.match(productionBody, /entry_unit_id,[\s\S]*v_entry_unit_id/);
});

test("inventory unit constraints lock entry unit columns at the database boundary", () => {
  const sql = read(
    "supabase/migration-archive/20260707191741_inventory_unit_not_null_constraints.sql",
  );

  assert.match(sql, /WHERE entry_unit_id IS NULL/);
  assert.match(sql, /entry_unit_id_not_null_precheck_failed/);
  assert.doesNotMatch(sql, /ALTER COLUMN entry_quantity SET NOT NULL/);

  for (const table of [
    "production_recipes",
    "production_runs",
    "stock_issue_items",
    "stock_transfer_items",
    "stocktake_lines",
    "stock_movements",
  ]) {
    assert.match(sql, new RegExp(`'${table}'`), table);
    assert.match(
      sql,
      new RegExp(
        `ALTER TABLE public\\.${table} ALTER COLUMN entry_unit_id SET NOT NULL`,
      ),
      table,
    );
  }
});
