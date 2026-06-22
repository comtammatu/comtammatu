#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const PAGE_SIZE = 1000;
const ALLOWED_POST_IMPORT_BLOCKERS = new Set([
  "target operational inventory is not empty",
  "target transfer number already exists",
]);

function numberValue(value) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function moneyValue(value) {
  return Math.round(numberValue(value) * 100) / 100;
}

function countBy(rows, keyFn) {
  const out = {};
  for (const row of rows) {
    const key = keyFn(row) ?? "unknown";
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

function parseArgs(argv) {
  const out = { json: false, selfTest: false, strict: false };
  for (const arg of argv) {
    if (arg === "--") continue;
    if (arg === "--json") out.json = true;
    else if (arg === "--self-test") out.selfTest = true;
    else if (arg === "--strict") out.strict = true;
    else if (arg === "--help" || arg === "-h") {
      console.log(`Usage:
  pnpm inventory:matu-platform:reconcile -- [--json] [--strict]

Read-only reconciliation after the matu-platform Inventory import.
It reuses the operational planner, then compares the source-derived plan with target ledger integrity.`);
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return out;
}

function inFilter(ids) {
  return `in.(${ids.join(",")})`;
}

function chunk(values, size = 200) {
  const out = [];
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size));
  return out;
}

async function fetchAll({ baseUrl, key, table, select = "*", filters = {} }) {
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const url = new URL(`/rest/v1/${table}`, baseUrl);
    url.searchParams.set("select", select);
    for (const [name, value] of Object.entries(filters)) {
      if (value != null && value !== "") url.searchParams.set(name, String(value));
    }
    const res = await fetch(url, {
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
        range: `${offset}-${offset + PAGE_SIZE - 1}`,
        "range-unit": "items",
      },
    });
    if (!res.ok) throw new Error(`${table} read failed: ${res.status}`);
    const page = await res.json();
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

async function fetchByIds(ctx, table, ids, select = "*", column = "id") {
  const unique = [...new Set(ids.filter((id) => id != null))];
  const rows = [];
  for (const group of chunk(unique)) {
    rows.push(
      ...(await fetchAll({
        ...ctx,
        table,
        select,
        filters: { [column]: inFilter(group) },
      })),
    );
  }
  return rows;
}

function runOperationalPlanner() {
  const result = spawnSync(
    process.execPath,
    [
      "scripts/inventory-matu-platform-operational-import.mjs",
      "--json",
      "--allow-manual-review-skip",
    ],
    { encoding: "utf8", env: process.env },
  );
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "operational planner failed");
  }
  return JSON.parse(result.stdout);
}

function isImportMovement(row) {
  return String(row.reason ?? "").startsWith("matu-platform import:");
}

function isImportTransfer(row) {
  return String(row.notes ?? "").startsWith("matu-platform import:");
}

function stockKey(row) {
  return `${row.tenant_id}:${row.location_id}:${row.ingredient_id}`;
}

function buildTargetAudit(data) {
  const locationById = new Map(data.locations.map((row) => [row.id, row]));
  const transferById = new Map(data.transfers.map((row) => [row.id, row]));
  const kitchenLocationIds = new Set(
    data.locations
      .filter((row) => row.is_active !== false && row.location_kind === "kitchen")
      .map((row) => row.id),
  );

  const net = new Map();
  for (const row of data.movements) {
    const key = stockKey(row);
    net.set(key, moneyValue((net.get(key) ?? 0) + numberValue(row.quantity_change)));
  }

  const levelByKey = new Map();
  for (const row of data.levels) {
    levelByKey.set(stockKey(row), moneyValue(row.current_quantity));
  }

  const stockMismatchKeys = new Set([...net.keys(), ...levelByKey.keys()]);
  const stockLevelMismatches = [...stockMismatchKeys].filter(
    (key) => Math.abs((net.get(key) ?? 0) - (levelByKey.get(key) ?? 0)) > 0.000001,
  );
  const saleConsumption = data.movements.filter(
    (row) => row.type === "consumption" && row.movement_subtype === "sale_consumption",
  );
  const countAdjustments = data.movements.filter((row) => row.type === "count_adjustment");
  const orphanTransferItems = data.transferItems.filter((row) => !transferById.has(row.transfer_id));

  return {
    activeKitchenLocations: kitchenLocationIds.size,
    countAdjustmentMovements: countAdjustments.length,
    kitchenStockLevels: data.levels.filter((row) => kitchenLocationIds.has(row.location_id)).length,
    negativeStockLevels: data.levels.filter((row) => numberValue(row.current_quantity) < 0).length,
    nonImportStockMovements: data.movements.filter((row) => !isImportMovement(row)).length,
    nonImportStockTransfers: data.transfers.filter((row) => !isImportTransfer(row)).length,
    orphanTransferItems: orphanTransferItems.length,
    saleConsumptionCost: moneyValue(
      saleConsumption.reduce(
        (sum, row) => sum + Math.abs(numberValue(row.quantity_change)) * numberValue(row.unit_cost),
        0,
      ),
    ),
    saleConsumptionMovements: saleConsumption.length,
    stockLevelMismatches: stockLevelMismatches.length,
    stockLevels: data.levels.length,
    stockValue: moneyValue(
      data.levels.reduce(
        (sum, row) => sum + numberValue(row.current_quantity) * numberValue(row.avg_unit_cost),
        0,
      ),
    ),
    transferDirections: countBy(data.transfers, (row) => {
      const from = locationById.get(row.from_location_id);
      const to = locationById.get(row.to_location_id);
      return `${from?.location_kind ?? "unknown"}->${to?.location_kind ?? "unknown"}`;
    }),
    transferItems: data.transferItems.length,
    transfers: data.transfers.length,
  };
}

async function loadTarget() {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!baseUrl || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  const ctx = { baseUrl, key };
  const [branches, locations, movements, transfers, levels, issues, stocktakes] =
    await Promise.all([
      fetchAll({ ...ctx, table: "branches", select: "id,code,name,branch_kind" }),
      fetchAll({
        ...ctx,
        table: "inventory_locations",
        select: "id,branch_id,location_kind,is_active",
      }),
      fetchAll({
        ...ctx,
        table: "stock_movements",
        select:
          "id,tenant_id,branch_id,location_id,ingredient_id,type,movement_subtype,quantity_change,unit_cost,reason",
      }),
      fetchAll({
        ...ctx,
        table: "stock_transfers",
        select: "id,from_location_id,to_location_id,transfer_number,notes",
      }),
      fetchAll({
        ...ctx,
        table: "stock_levels",
        select: "id,tenant_id,location_id,ingredient_id,current_quantity,avg_unit_cost",
      }),
      fetchAll({ ...ctx, table: "stock_issues", select: "id" }),
      fetchAll({ ...ctx, table: "stocktake_sessions", select: "id" }),
    ]);
  const transferItems = await fetchByIds(ctx, "stock_transfer_items", transfers.map((row) => row.id), "id,transfer_id", "transfer_id");
  return { branches, issues, levels, locations, movements, stocktakes, transferItems, transfers };
}

function buildReport(planner, targetData) {
  const target = buildTargetAudit(targetData);
  const expected = {
    countAdjustmentMovements: planner.operationalPlan.balanceAdjustments.count,
    realTransferItems: planner.operationalPlan.realTransfers.itemRows,
    realTransfers: planner.operationalPlan.realTransfers.count,
    saleConsumptionCost: moneyValue(planner.operationalPlan.saleConsumption.estimatedCost),
    saleConsumptionMovements: planner.operationalPlan.saleConsumption.movementRows,
    stockMovementRows: planner.operationalPlan.stockMovementRows,
  };
  const unexpectedPlannerBlockers = planner.blockers.filter(
    (item) => !ALLOWED_POST_IMPORT_BLOCKERS.has(item),
  );
  const failures = [];
  if (unexpectedPlannerBlockers.length > 0) failures.push("unexpected source planner blockers");
  if (target.activeKitchenLocations !== 0) failures.push("target has active kitchen locations");
  if (target.kitchenStockLevels !== 0) failures.push("target has kitchen stock levels");
  if (target.negativeStockLevels !== 0) failures.push("target has negative stock levels");
  if (target.nonImportStockMovements !== 0) failures.push("target has non-import stock movements");
  if (target.nonImportStockTransfers !== 0) failures.push("target has non-import stock transfers");
  if (target.orphanTransferItems !== 0) failures.push("target has orphan transfer items");
  if (target.stockLevelMismatches !== 0) failures.push("stock_levels do not match movement ledger");
  if (target.saleConsumptionMovements !== expected.saleConsumptionMovements) {
    failures.push("sale consumption movement count mismatch");
  }
  if (target.saleConsumptionCost !== expected.saleConsumptionCost) {
    failures.push("sale consumption cost mismatch");
  }

  const sourceDrift = [];
  if (target.transfers !== expected.realTransfers) sourceDrift.push("real transfer count differs from current source plan");
  if (target.transferItems !== expected.realTransferItems) sourceDrift.push("transfer item count differs from current source plan");
  if (targetData.movements.length !== expected.stockMovementRows) {
    sourceDrift.push("movement count differs from current source plan");
  }

  return {
    generatedAt: new Date().toISOString(),
    mode: "read-only",
    ok: failures.length === 0,
    failures,
    sourceDrift,
    expected,
    target,
    ignoredSourceRows: planner.ignored,
    manualReview: planner.manualReview,
    plannerBlockers: planner.blockers,
    targetTables: {
      branches: targetData.branches.length,
      stockIssues: targetData.issues.length,
      stocktakes: targetData.stocktakes.length,
    },
  };
}

function printHuman(report) {
  console.log("Matu-platform Inventory reconciliation");
  console.log(`Generated: ${report.generatedAt}`);
  console.log(`Status: ${report.ok ? "ok" : "failed"}`);
  console.log(`Failures: ${report.failures.length ? report.failures.join("; ") : "none"}`);
  console.log(`Current-source drift: ${report.sourceDrift.length ? report.sourceDrift.join("; ") : "none"}`);
  console.table({
    expectedRealTransfers: report.expected.realTransfers,
    targetTransfers: report.target.transfers,
    expectedTransferItems: report.expected.realTransferItems,
    targetTransferItems: report.target.transferItems,
    expectedSaleConsumptionRows: report.expected.saleConsumptionMovements,
    targetSaleConsumptionRows: report.target.saleConsumptionMovements,
    expectedSaleConsumptionCost: report.expected.saleConsumptionCost,
    targetSaleConsumptionCost: report.target.saleConsumptionCost,
    targetStockLevels: report.target.stockLevels,
    targetStockValue: report.target.stockValue,
  });
}

function selfTest() {
  const report = buildReport(
    {
      blockers: ["target operational inventory is not empty"],
      ignored: { count: 0 },
      manualReview: { count: 0 },
      operationalPlan: {
        balanceAdjustments: { count: 1 },
        realTransfers: { count: 1, itemRows: 1 },
        saleConsumption: { estimatedCost: 60000, movementRows: 1 },
        stockMovementRows: 4,
      },
    },
    {
      branches: [],
      issues: [],
      locations: [
        { id: 10, branch_id: 1, location_kind: "warehouse", is_active: true },
        { id: 20, branch_id: 2, location_kind: "warehouse", is_active: true },
      ],
      stocktakes: [],
      transferItems: [{ id: 1, transfer_id: 1 }],
      transfers: [
        {
          id: 1,
          from_location_id: 10,
          to_location_id: 20,
          notes: "matu-platform import:real_transfer:t1",
        },
      ],
      movements: [
        {
          tenant_id: 1,
          location_id: 10,
          ingredient_id: 1,
          quantity_change: -2,
          type: "transfer_out",
          reason: "matu-platform import:real_transfer:t1:transfer_out",
        },
        {
          tenant_id: 1,
          location_id: 20,
          ingredient_id: 1,
          quantity_change: 2,
          type: "transfer_in",
          reason: "matu-platform import:real_transfer:t1:transfer_in",
        },
        {
          tenant_id: 1,
          location_id: 10,
          ingredient_id: 2,
          quantity_change: -2,
          unit_cost: 30000,
          type: "consumption",
          movement_subtype: "sale_consumption",
          reason: "matu-platform import:sale_consumption:t2",
        },
        {
          tenant_id: 1,
          location_id: 20,
          ingredient_id: 1,
          quantity_change: 3,
          type: "count_adjustment",
          reason: "matu-platform import:balance_adjustment",
        },
      ],
      levels: [
        { tenant_id: 1, location_id: 10, ingredient_id: 1, current_quantity: -2, avg_unit_cost: 1 },
        { tenant_id: 1, location_id: 20, ingredient_id: 1, current_quantity: 5, avg_unit_cost: 1 },
        { tenant_id: 1, location_id: 10, ingredient_id: 2, current_quantity: -2, avg_unit_cost: 30000 },
      ],
    },
  );
  assert.equal(report.ok, false);
  assert.ok(report.failures.includes("target has negative stock levels"));
  console.log("self-test ok");
}

const args = parseArgs(process.argv.slice(2));
if (args.selfTest) {
  selfTest();
} else {
  const [planner, targetData] = await Promise.all([runOperationalPlanner(), loadTarget()]);
  const report = buildReport(planner, targetData);
  if (args.json) console.log(JSON.stringify(report, null, 2));
  else printHuman(report);
  if (args.strict && !report.ok) process.exit(1);
}
