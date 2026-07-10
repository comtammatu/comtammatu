#!/usr/bin/env tsx
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const PROD_REF = "iexwsuaqqenyjiskawoj";

type Args = {
  help: boolean;
  out: string;
  selfTest: boolean;
};

const DELETE_TABLES = [
  "branch_menu_item_daily_holds",
  "branch_menu_item_daily_limits",
  "attendance_consumption_report_lines",
  "attendance_consumption_reports",
  "inventory_count_slip_lines",
  "inventory_count_slips",
  "inventory_count_assignments",
  "stocktake_zone_locks",
  "stocktake_drafts",
  "stocktake_conflicts",
  "stocktake_lines",
  "stocktake_sessions",
  "stock_movements",
  "supplier_payments",
  "supplier_credit_notes",
  "supplier_return_items",
  "supplier_returns",
  "supplier_invoices",
  "grn_hardblock_overrides",
  "grn_express_extend_audit",
  "grn_baseline_pause",
  "grn_items",
  "goods_received_notes",
  "purchase_order_items",
  "purchase_orders",
  "production_runs",
  "stock_transfer_items",
  "stock_transfers",
  "stock_issue_items",
  "stock_issues",
  "stock_levels",
  "branch_daily_waste_cap",
] as const;

const PRESERVE_TABLES = [
  "tax_invoices",
  "tax_invoice_events",
  "archive_run_log",
  "orders",
  "order_items",
  "payments",
  "ingredients",
  "units",
  "ingredient_units",
  "ingredient_categories",
  "inventory_locations",
  "recipes",
  "production_recipes",
  "suppliers",
  "supplier_items",
  "supplier_price_list",
] as const;

const NON_TENANT_TABLES = new Set(["branch_daily_waste_cap"]);

function parseArgs(argv: string[]): Args {
  const out: Args = {
    help: false,
    out: `.tmp/inventory-cleanup/${new Date().toISOString().replace(/[:.]/g, "-")}`,
    selfTest: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") continue;
    if (arg === "--help" || arg === "-h") out.help = true;
    else if (arg === "--self-test") out.selfTest = true;
    else if (arg === "--out") out.out = readArg(argv, ++index, "--out");
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return out;
}

function readArg(argv: string[], index: number, name: string): string {
  const value = argv[index];
  if (!value) throw new Error(`${name} requires a value`);
  return value;
}

function printHelp() {
  console.log(`Usage:
  pnpm inventory:cleanup:dry-run

Read-only PROD inventory cleanup planner. It counts rows and writes:
  - manifest.json
  - inventory-cleanup.sql

The SQL is NOT executed by this script.`);
}

function repoRoot(): string {
  return path.resolve(process.cwd(), "../..");
}

function resolveOutDir(input: string): string {
  const root = repoRoot();
  const resolved = path.resolve(root, input);
  const relative = path.relative(root, resolved);
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Output must stay inside the repository");
  }
  if (!relative.startsWith(".tmp/")) {
    throw new Error("Output must stay under .tmp/");
  }
  return resolved;
}

function projectRefFromUrl(url: string): string | null {
  try {
    const host = new URL(url).host;
    return host.endsWith(".supabase.co") ? host.split(".")[0] ?? null : null;
  } catch {
    return null;
  }
}

function requireEnv() {
  const url =
    process.env["NEXT_PUBLIC_SUPABASE_URL"] ?? process.env["SUPABASE_URL"] ?? "";
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
  const projectId = process.env["SUPABASE_PROJECT_ID"] ?? "";
  const ref = projectRefFromUrl(url);

  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  if (ref !== PROD_REF || projectId !== PROD_REF) {
    throw new Error(`Ref mismatch. Expected ${PROD_REF}, got url=${ref ?? "unknown"} env=${projectId || "empty"}`);
  }

  return { key, ref, url };
}

async function countRows(
  supabase: ReturnType<typeof createClient>,
  table: string,
): Promise<number> {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true });
  if (error) throw new Error(`${table} count failed: ${error.code}`);
  return count ?? 0;
}

function deleteSql(table: string): string {
  if (NON_TENANT_TABLES.has(table)) {
    return `DELETE FROM public.${table}
WHERE branch_id IN (SELECT id FROM public.branches WHERE tenant_id IN (SELECT id FROM target_tenants));`;
  }

  return `DELETE FROM public.${table}
WHERE tenant_id IN (SELECT id FROM target_tenants);`;
}

function buildCleanupSql(counts: Record<string, number>): string {
  const deletedTables = DELETE_TABLES.filter((table) => (counts[table] ?? 0) > 0);

  return [
    "-- Inventory operational data reset plan.",
    "-- Review manifest.json before running. This script preserves HĐĐT, POS order/payment rows, and inventory master data.",
    "BEGIN;",
    "",
    "CREATE TEMP TABLE target_tenants ON COMMIT DROP AS",
    "SELECT id FROM public.tenants;",
    "",
    deletedTables.map(deleteSql).join("\n\n"),
    "",
    "COMMIT;",
    "",
  ].join("\n");
}

async function run(args: Args) {
  const { key, ref, url } = requireEnv();
  const outDir = resolveOutDir(args.out);
  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const counts: Record<string, number> = {};
  for (const table of [...DELETE_TABLES, ...PRESERVE_TABLES]) {
    counts[table] = await countRows(supabase, table);
  }

  const manifest = {
    generated_at: new Date().toISOString(),
    project_ref: ref,
    mode: "dry_run",
    delete_tables: Object.fromEntries(DELETE_TABLES.map((table) => [table, counts[table]])),
    preserve_tables: Object.fromEntries(PRESERVE_TABLES.map((table) => [table, counts[table]])),
    total_delete_rows: DELETE_TABLES.reduce((sum, table) => sum + (counts[table] ?? 0), 0),
  };

  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(path.join(outDir, "inventory-cleanup.sql"), buildCleanupSql(counts));

  console.log(JSON.stringify({ outDir, manifest }, null, 2));
}

function selfTest() {
  assert.equal(projectRefFromUrl("https://iexwsuaqqenyjiskawoj.supabase.co"), PROD_REF);
  assert.match(buildCleanupSql({ stock_levels: 1 }), /DELETE FROM public\.stock_levels/);
  assert.doesNotMatch(buildCleanupSql({ stock_levels: 0 }), /DELETE FROM public\.stock_levels/);
  assert.match(
    deleteSql("branch_daily_waste_cap"),
    /branch_id IN \(SELECT id FROM public\.branches/,
  );
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  printHelp();
} else if (args.selfTest) {
  selfTest();
  console.log("ok");
} else {
  await run(args);
}
