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

function quantityValue(value) {
  return Math.round(numberValue(value) * 1000) / 1000;
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
  const out = { json: false, markdown: false, selfTest: false, strict: false };
  for (const arg of argv) {
    if (arg === "--") continue;
    if (arg === "--json") out.json = true;
    else if (arg === "--markdown") out.markdown = true;
    else if (arg === "--self-test") out.selfTest = true;
    else if (arg === "--strict") out.strict = true;
    else if (arg === "--help" || arg === "-h") {
      console.log(`Usage:
  pnpm inventory:matu-platform:reconcile -- [--json] [--strict]
  pnpm inventory:matu-platform:reconcile -- [--markdown]

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
      "--include-rows",
      "--allow-manual-review-skip",
    ],
    { encoding: "utf8", env: process.env, maxBuffer: 64 * 1024 * 1024 },
  );
  if (result.error) throw result.error;
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

function dateKey(value) {
  return String(value ?? "").slice(0, 10) || "unknown";
}

function stockKey(row) {
  return `${row.tenant_id}:${row.location_id}:${row.ingredient_id}`;
}

function branchLabel(row) {
  if (!row) return "unknown";
  return row.code ? `${row.code} / ${row.name}` : row.name ?? `#${row.id}`;
}

function movementRef(row, maps) {
  const ingredient = maps.ingredientById.get(row.ingredient_id);
  const location = maps.locationById.get(row.location_id);
  const branchId = row.branch_id ?? location?.branch_id ?? null;
  const branch = maps.branchById.get(branchId);
  const quantity = Math.abs(numberValue(row.quantity_change));
  return {
    id: row.id,
    branch: branchLabel(branch),
    branchId,
    cost: moneyValue(quantity * numberValue(row.unit_cost)),
    date: dateKey(row.created_at),
    ingredient: ingredient?.name ?? `#${row.ingredient_id ?? "unknown"}`,
    ingredientId: row.ingredient_id ?? null,
    locationId: row.location_id ?? null,
    locationKind: location?.location_kind ?? "unknown",
    quantity: quantityValue(quantity),
    reason: row.reason ?? null,
    unit: ingredient?.unit ?? null,
    unitCost: row.unit_cost == null ? null : moneyValue(row.unit_cost),
  };
}

function stockRef(row, maps, netQuantity = null) {
  const ingredient = maps.ingredientById.get(row.ingredient_id);
  const location = maps.locationById.get(row.location_id);
  const branchId = row.branch_id ?? location?.branch_id ?? null;
  const branch = maps.branchById.get(branchId);
  return {
    branch: branchLabel(branch),
    branchId,
    ingredient: ingredient?.name ?? `#${row.ingredient_id ?? "unknown"}`,
    ingredientId: row.ingredient_id ?? null,
    ledgerQuantity: netQuantity == null ? null : quantityValue(netQuantity),
    levelQuantity: quantityValue(row.current_quantity),
    locationId: row.location_id ?? null,
    locationKind: location?.location_kind ?? "unknown",
    unit: ingredient?.unit ?? null,
    value: moneyValue(numberValue(row.current_quantity) * numberValue(row.avg_unit_cost)),
  };
}

function groupSaleConsumption(rows, maps) {
  const buckets = new Map();
  for (const row of rows) {
    const ingredient = maps.ingredientById.get(row.ingredient_id);
    const location = maps.locationById.get(row.location_id);
    const branchId = row.branch_id ?? location?.branch_id ?? null;
    const branch = maps.branchById.get(branchId);
    const key = `${branchId ?? "unknown"}:${dateKey(row.created_at)}:${row.ingredient_id ?? "unknown"}`;
    const current =
      buckets.get(key) ??
      {
        branch: branchLabel(branch),
        branchId,
        cost: 0,
        date: dateKey(row.created_at),
        ingredient: ingredient?.name ?? `#${row.ingredient_id ?? "unknown"}`,
        ingredientId: row.ingredient_id ?? null,
        movements: 0,
        quantity: 0,
        unit: ingredient?.unit ?? null,
      };
    current.cost += Math.abs(numberValue(row.quantity_change)) * numberValue(row.unit_cost);
    current.movements += 1;
    current.quantity += Math.abs(numberValue(row.quantity_change));
    buckets.set(key, current);
  }
  return [...buckets.values()]
    .map((row) => ({
      ...row,
      cost: moneyValue(row.cost),
      quantity: quantityValue(row.quantity),
    }))
    .sort((a, b) => a.branch.localeCompare(b.branch) || a.date.localeCompare(b.date) || b.cost - a.cost);
}

function compareValue(value) {
  if (value == null) return "";
  const numeric = Number(value);
  return Number.isFinite(numeric) ? String(moneyValue(numeric)) : String(value);
}

function normalizeImportKey(value) {
  return String(value ?? "").replace("matu-platform import:delta_transfer:", "matu-platform import:real_transfer:");
}

function movementCompareKey(row) {
  return [
    row.type,
    row.movement_subtype ?? "",
    normalizeImportKey(row.reason),
    row.branch_id ?? "",
    row.location_id ?? "",
    row.ingredient_id ?? "",
    compareValue(row.quantity_change),
  ].join("|");
}

function transferCompareKey(row) {
  return normalizeImportKey(row.notes);
}

function transferItemCompareKey(row) {
  return [
    row.transfer_number ?? "",
    row.ingredient_id ?? "",
    compareValue(row.quantity),
    compareValue(row.quantity_received),
    row.unit ?? "",
  ].join("|");
}

function diffRows(expected, actual, keyFn, expectedRef, actualRef, changedRef = null) {
  const actualByKey = new Map();
  for (const row of actual) {
    const key = keyFn(row);
    const list = actualByKey.get(key) ?? [];
    list.push(row);
    actualByKey.set(key, list);
  }

  const missingFromTarget = [];
  const changed = [];
  let matched = 0;
  for (const row of expected) {
    const key = keyFn(row);
    const list = actualByKey.get(key) ?? [];
    const match = list.shift();
    if (match) {
      matched += 1;
      const changedRow = changedRef?.(row, match);
      if (changedRow) changed.push(changedRow);
    } else missingFromTarget.push(expectedRef(row));
  }

  const extraInTarget = [...actualByKey.values()].flat().map(actualRef);
  return {
    changed,
    extraInTarget,
    matched,
    missingFromTarget,
  };
}

function transferRef(row) {
  return {
    cost: row.cost == null ? null : moneyValue(row.cost),
    fromLocationId: row.from_location_id ?? null,
    lineCount: row.lineCount ?? null,
    notes: row.notes ?? null,
    toLocationId: row.to_location_id ?? null,
    transferNumber: row.transfer_number ?? null,
  };
}

function transferItemRef(row) {
  return {
    ingredientId: row.ingredient_id ?? null,
    quantity: moneyValue(row.quantity),
    quantityReceived: row.quantity_received == null ? null : moneyValue(row.quantity_received),
    transferNumber: row.transfer_number ?? null,
    unit: row.unit ?? null,
    unitCostAtShip: row.unit_cost_at_ship == null ? null : moneyValue(row.unit_cost_at_ship),
  };
}

function movementCostChangeRef(expected, actual, maps) {
  const expectedUnitCost = expected.unit_cost == null ? null : moneyValue(expected.unit_cost);
  const targetUnitCost = actual.unit_cost == null ? null : moneyValue(actual.unit_cost);
  if (expectedUnitCost === targetUnitCost) return null;
  const quantity = Math.abs(numberValue(expected.quantity_change));
  return {
    ...movementRef(actual, maps),
    expectedCost: moneyValue(quantity * numberValue(expected.unit_cost)),
    expectedUnitCost,
    targetCost: moneyValue(quantity * numberValue(actual.unit_cost)),
    targetUnitCost,
  };
}

function transferItemCostChangeRef(expected, actual) {
  const expectedUnitCost = expected.unit_cost_at_ship == null ? null : moneyValue(expected.unit_cost_at_ship);
  const targetUnitCost = actual.unit_cost_at_ship == null ? null : moneyValue(actual.unit_cost_at_ship);
  if (expectedUnitCost === targetUnitCost) return null;
  return {
    ...transferItemRef(actual),
    expectedUnitCost,
    targetUnitCost,
  };
}

function targetTransferItemsWithNumber(data) {
  const transferById = new Map(data.transfers.map((row) => [row.id, row]));
  return data.transferItems.map((row) => {
    const transfer = transferById.get(row.transfer_id);
    return {
      ...row,
      transfer_number: transfer?.transfer_number ?? null,
    };
  });
}

function buildSourceDriftDetails(plannedRows, targetData, maps) {
  const planned = plannedRows ?? { movements: [], transferItems: [], transfers: [] };
  const targetImportMovements = targetData.movements.filter((row) => isImportMovement(row));
  const targetImportTransfers = targetData.transfers.filter((row) => isImportTransfer(row));
  const movement = diffRows(
    planned.movements,
    targetImportMovements,
    movementCompareKey,
    (row) => movementRef(row, maps),
    (row) => movementRef(row, maps),
    (expected, actual) => movementCostChangeRef(expected, actual, maps),
  );
  const saleConsumption = diffRows(
    planned.movements.filter(
      (row) => row.type === "consumption" && row.movement_subtype === "sale_consumption",
    ),
    targetImportMovements.filter(
      (row) => row.type === "consumption" && row.movement_subtype === "sale_consumption",
    ),
    movementCompareKey,
    (row) => movementRef(row, maps),
    (row) => movementRef(row, maps),
    (expected, actual) => movementCostChangeRef(expected, actual, maps),
  );
  const transfer = diffRows(
    planned.transfers,
    targetImportTransfers,
    transferCompareKey,
    transferRef,
    transferRef,
  );
  const transferItem = diffRows(
    planned.transferItems,
    targetTransferItemsWithNumber(targetData),
    transferItemCompareKey,
    transferItemRef,
    transferItemRef,
    transferItemCostChangeRef,
  );

  return {
    movement,
    saleConsumption,
    transfer,
    transferItem,
  };
}

function buildTargetAudit(data) {
  const branchById = new Map(data.branches.map((row) => [row.id, row]));
  const ingredientById = new Map(data.ingredients.map((row) => [row.id, row]));
  const locationById = new Map(data.locations.map((row) => [row.id, row]));
  const transferById = new Map(data.transfers.map((row) => [row.id, row]));
  const maps = { branchById, ingredientById, locationById };
  const kitchenLocationIds = new Set(
    data.locations
      .filter((row) => row.is_active !== false && row.location_kind === "kitchen")
      .map((row) => row.id),
  );

  const net = new Map();
  const movementByStockKey = new Map();
  for (const row of data.movements) {
    const key = stockKey(row);
    net.set(key, (net.get(key) ?? 0) + numberValue(row.quantity_change));
    if (!movementByStockKey.has(key)) movementByStockKey.set(key, row);
  }

  const levelByKey = new Map();
  const levelRowByKey = new Map();
  for (const row of data.levels) {
    levelByKey.set(stockKey(row), quantityValue(row.current_quantity));
    levelRowByKey.set(stockKey(row), row);
  }

  const stockMismatchKeys = new Set([...net.keys(), ...levelByKey.keys()]);
  const stockLevelMismatches = [...stockMismatchKeys].filter(
    (key) => Math.abs(quantityValue(net.get(key) ?? 0) - (levelByKey.get(key) ?? 0)) > 0.000001,
  );
  const stockMismatchDetails = stockLevelMismatches.map((key) => {
    const [tenantId, locationId, ingredientId] = key.split(":").map((value) => Number(value));
    const sample = levelRowByKey.get(key) ?? movementByStockKey.get(key) ?? {};
    return stockRef(
      {
        ...sample,
        avg_unit_cost: sample.avg_unit_cost ?? 0,
        current_quantity: levelByKey.get(key) ?? 0,
        ingredient_id: sample.ingredient_id ?? ingredientId,
        location_id: sample.location_id ?? locationId,
        tenant_id: sample.tenant_id ?? tenantId,
      },
      maps,
      quantityValue(net.get(key) ?? 0),
    );
  });
  const saleConsumption = data.movements.filter(
    (row) => row.type === "consumption" && row.movement_subtype === "sale_consumption",
  );
  const countAdjustments = data.movements.filter((row) => row.type === "count_adjustment");
  const orphanTransferItems = data.transferItems.filter((row) => !transferById.has(row.transfer_id));
  const branchLocationMismatches = data.movements
    .filter((row) => {
      const location = locationById.get(row.location_id);
      return row.branch_id != null && location?.branch_id != null && row.branch_id !== location.branch_id;
    })
    .map((row) => {
      const location = locationById.get(row.location_id);
      return {
        ...movementRef(row, maps),
        locationBranch: branchLabel(branchById.get(location?.branch_id)),
        locationBranchId: location?.branch_id ?? null,
      };
    });
  const badConsumptionLocations = saleConsumption
    .filter((row) => {
      const location = locationById.get(row.location_id);
      const branchId = row.branch_id ?? location?.branch_id ?? null;
      const branch = branchById.get(branchId);
      return location?.location_kind !== "warehouse" || branch?.branch_kind !== "branch";
    })
    .map((row) => movementRef(row, maps));
  const missingImportSource = saleConsumption.filter((row) => !isImportMovement(row)).map((row) => movementRef(row, maps));
  const missingUnitCost = saleConsumption.filter((row) => row.unit_cost == null).map((row) => movementRef(row, maps));
  const zeroUnitCost = saleConsumption
    .filter((row) => row.unit_cost != null && numberValue(row.unit_cost) === 0)
    .map((row) => movementRef(row, maps));
  const unresolvedRefs = saleConsumption
    .filter((row) => {
      const location = locationById.get(row.location_id);
      const branchId = row.branch_id ?? location?.branch_id ?? null;
      return !branchById.has(branchId) || !ingredientById.has(row.ingredient_id) || !location;
    })
    .map((row) => movementRef(row, maps));
  const negativeStockRows = data.levels
    .filter((row) => numberValue(row.current_quantity) < 0)
    .map((row) => stockRef(row, maps));

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
    saleConsumptionByBranchDateIngredient: groupSaleConsumption(saleConsumption, maps),
    saleConsumptionExceptions: {
      badConsumptionLocations,
      branchLocationMismatches,
      missingImportSource,
      missingUnitCost,
      unresolvedRefs,
      zeroUnitCost,
    },
    saleConsumptionMovements: saleConsumption.length,
    stockExceptions: {
      ledgerMismatches: stockMismatchDetails,
      negativeStock: negativeStockRows,
    },
    stockLevelMismatches: stockLevelMismatches.length,
    stockLevels: data.levels.length,
    stockMovementRows: data.movements.length,
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
          "id,created_at,tenant_id,branch_id,location_id,ingredient_id,type,movement_subtype,quantity_change,unit_cost,reason",
      }),
      fetchAll({
        ...ctx,
        table: "stock_transfers",
        select: "id,from_location_id,to_location_id,transfer_number,notes",
      }),
      fetchAll({
        ...ctx,
        table: "stock_levels",
        select: "id,tenant_id,branch_id,location_id,ingredient_id,current_quantity,avg_unit_cost",
      }),
      fetchAll({ ...ctx, table: "stock_issues", select: "id" }),
      fetchAll({ ...ctx, table: "stocktake_sessions", select: "id" }),
    ]);
  const transferItems = await fetchByIds(
    ctx,
    "stock_transfer_items",
    transfers.map((row) => row.id),
    "id,transfer_id,ingredient_id,quantity,quantity_received,unit,unit_cost_at_ship",
    "transfer_id",
  );
  const ingredientIds = [
    ...movements.map((row) => row.ingredient_id),
    ...levels.map((row) => row.ingredient_id),
  ];
  const ingredients = await fetchByIds(ctx, "ingredients", ingredientIds, "id,name,unit");
  return { branches, ingredients, issues, levels, locations, movements, stocktakes, transferItems, transfers };
}

function buildReport(planner, targetData) {
  const target = buildTargetAudit(targetData);
  const targetMaps = {
    branchById: new Map(targetData.branches.map((row) => [row.id, row])),
    ingredientById: new Map(targetData.ingredients.map((row) => [row.id, row])),
    locationById: new Map(targetData.locations.map((row) => [row.id, row])),
  };
  const sourceDriftDetails = buildSourceDriftDetails(
    planner.plannedRows,
    targetData,
    targetMaps,
  );
  const expected = {
    countAdjustmentMovements: planner.operationalPlan.balanceAdjustments.count,
    grnReceiptMovements: planner.operationalPlan.goodsReceipts?.movementRows ?? 0,
    productionConsumptionMovements: planner.operationalPlan.production?.consumptionRows ?? 0,
    productionOutputMovements: planner.operationalPlan.production?.outputRows ?? 0,
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
  if (target.saleConsumptionExceptions.badConsumptionLocations.length > 0) {
    failures.push("sale consumption is not posted to branch warehouses");
  }
  if (target.saleConsumptionExceptions.branchLocationMismatches.length > 0) {
    failures.push("movement branch_id does not match location branch_id");
  }
  if (target.saleConsumptionExceptions.missingImportSource.length > 0) {
    failures.push("sale consumption rows are missing matu-platform import source");
  }
  if (target.saleConsumptionExceptions.missingUnitCost.length > 0) {
    failures.push("sale consumption rows are missing unit_cost");
  }
  if (target.saleConsumptionExceptions.unresolvedRefs.length > 0) {
    failures.push("sale consumption rows have unresolved branch/location/ingredient refs");
  }

  const sourceDrift = [];
  if (target.transfers !== expected.realTransfers) sourceDrift.push("real transfer count differs from current source plan");
  if (target.transferItems !== expected.realTransferItems) sourceDrift.push("transfer item count differs from current source plan");
  if (target.stockMovementRows !== expected.stockMovementRows) {
    sourceDrift.push("movement count differs from current source plan");
  }

  return {
    generatedAt: new Date().toISOString(),
    mode: "read-only",
    ok: failures.length === 0,
    failures,
    financeFoodCostMirror: {
      formula:
        "sum(abs(quantity_change) * unit_cost) where type=consumption and movement_subtype=sale_consumption",
      importedSaleConsumptionCost: target.saleConsumptionCost,
      missingCostRows: target.saleConsumptionExceptions.missingUnitCost.length,
      zeroCostRows: target.saleConsumptionExceptions.zeroUnitCost.length,
    },
    costBasisDrift: {
      saleConsumption: {
        currentSourceCost: expected.saleConsumptionCost,
        targetLedgerCost: target.saleConsumptionCost,
        deltaTargetMinusCurrentSource: moneyValue(target.saleConsumptionCost - expected.saleConsumptionCost),
        rowsWithChangedCostBasis: sourceDriftDetails.saleConsumption.changed.length,
      },
    },
    sourceDrift,
    sourceDriftDetails,
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

function markdownValue(value) {
  if (value == null) return "";
  if (typeof value === "object") return JSON.stringify(value).replaceAll("|", "\\|");
  return String(value).replaceAll("\n", " ").replaceAll("|", "\\|");
}

function markdownTable(rows, columns) {
  if (rows.length === 0) return "_None._";
  const header = `| ${columns.map((column) => column.label).join(" | ")} |`;
  const separator = `| ${columns.map(() => "---").join(" | ")} |`;
  const body = rows.map(
    (row) => `| ${columns.map((column) => markdownValue(row[column.key])).join(" | ")} |`,
  );
  return [header, separator, ...body].join("\n");
}

function printMarkdown(report) {
  const driftCounts = [
    {
      area: "movement",
      matched: report.sourceDriftDetails.movement.matched,
      missingFromTarget: report.sourceDriftDetails.movement.missingFromTarget.length,
      extraInTarget: report.sourceDriftDetails.movement.extraInTarget.length,
      costBasisChanged: report.sourceDriftDetails.movement.changed.length,
    },
    {
      area: "saleConsumption",
      matched: report.sourceDriftDetails.saleConsumption.matched,
      missingFromTarget: report.sourceDriftDetails.saleConsumption.missingFromTarget.length,
      extraInTarget: report.sourceDriftDetails.saleConsumption.extraInTarget.length,
      costBasisChanged: report.sourceDriftDetails.saleConsumption.changed.length,
    },
    {
      area: "transfer",
      matched: report.sourceDriftDetails.transfer.matched,
      missingFromTarget: report.sourceDriftDetails.transfer.missingFromTarget.length,
      extraInTarget: report.sourceDriftDetails.transfer.extraInTarget.length,
      costBasisChanged: report.sourceDriftDetails.transfer.changed.length,
    },
    {
      area: "transferItem",
      matched: report.sourceDriftDetails.transferItem.matched,
      missingFromTarget: report.sourceDriftDetails.transferItem.missingFromTarget.length,
      extraInTarget: report.sourceDriftDetails.transferItem.extraInTarget.length,
      costBasisChanged: report.sourceDriftDetails.transferItem.changed.length,
    },
  ];
  const exceptionCounts = [
    {
      exception: "badConsumptionLocations",
      count: report.target.saleConsumptionExceptions.badConsumptionLocations.length,
    },
    {
      exception: "branchLocationMismatches",
      count: report.target.saleConsumptionExceptions.branchLocationMismatches.length,
    },
    {
      exception: "missingImportSource",
      count: report.target.saleConsumptionExceptions.missingImportSource.length,
    },
    {
      exception: "missingUnitCost",
      count: report.target.saleConsumptionExceptions.missingUnitCost.length,
    },
    {
      exception: "zeroUnitCost",
      count: report.target.saleConsumptionExceptions.zeroUnitCost.length,
    },
    {
      exception: "unresolvedRefs",
      count: report.target.saleConsumptionExceptions.unresolvedRefs.length,
    },
    {
      exception: "ledgerMismatches",
      count: report.target.stockExceptions.ledgerMismatches.length,
    },
    {
      exception: "negativeStock",
      count: report.target.stockExceptions.negativeStock.length,
    },
  ];
  const summaryRows = [
    { metric: "status", value: report.ok ? "ok" : "failed" },
    { metric: "expectedRealTransfers", value: report.expected.realTransfers },
    { metric: "targetTransfers", value: report.target.transfers },
    { metric: "expectedTransferItems", value: report.expected.realTransferItems },
    { metric: "targetTransferItems", value: report.target.transferItems },
    { metric: "expectedSaleConsumptionRows", value: report.expected.saleConsumptionMovements },
    { metric: "targetSaleConsumptionRows", value: report.target.saleConsumptionMovements },
    { metric: "expectedGrnReceiptRows", value: report.expected.grnReceiptMovements },
    { metric: "expectedProductionConsumptionRows", value: report.expected.productionConsumptionMovements },
    { metric: "expectedProductionOutputRows", value: report.expected.productionOutputMovements },
    { metric: "currentSourceSaleConsumptionCost", value: report.expected.saleConsumptionCost },
    { metric: "targetLedgerSaleConsumptionCost", value: report.target.saleConsumptionCost },
    { metric: "expectedStockMovementRows", value: report.expected.stockMovementRows },
    { metric: "targetStockMovementRows", value: report.target.stockMovementRows },
    { metric: "targetStockLevels", value: report.target.stockLevels },
    { metric: "targetStockValue", value: report.target.stockValue },
  ];

  console.log("# Matu-platform Inventory reconciliation");
  console.log("");
  console.log(`Generated: ${report.generatedAt}`);
  console.log("");
  console.log("## Summary");
  console.log(markdownTable(summaryRows, [{ key: "metric", label: "Metric" }, { key: "value", label: "Value" }]));
  console.log("");
  console.log("## Finance food-cost mirror");
  console.log(
    markdownTable(
      [
        {
          formula: report.financeFoodCostMirror.formula,
          importedSaleConsumptionCost: report.financeFoodCostMirror.importedSaleConsumptionCost,
          missingCostRows: report.financeFoodCostMirror.missingCostRows,
          zeroCostRows: report.financeFoodCostMirror.zeroCostRows,
        },
      ],
      [
        { key: "formula", label: "Formula" },
        { key: "importedSaleConsumptionCost", label: "Imported sale consumption cost" },
        { key: "missingCostRows", label: "Missing cost rows" },
        { key: "zeroCostRows", label: "Zero cost rows" },
      ],
    ),
  );
  console.log("");
  console.log("## Failures");
  console.log(report.failures.length ? report.failures.map((item) => `- ${item}`).join("\n") : "_None._");
  console.log("");
  console.log("## Current-source drift");
  console.log(report.sourceDrift.length ? report.sourceDrift.map((item) => `- ${item}`).join("\n") : "_None._");
  console.log("");
  console.log("## Current-source drift details");
  console.log(
    markdownTable(driftCounts, [
      { key: "area", label: "Area" },
      { key: "matched", label: "Matched" },
      { key: "missingFromTarget", label: "Missing from target" },
      { key: "extraInTarget", label: "Extra in target" },
      { key: "costBasisChanged", label: "Cost basis changed" },
    ]),
  );
  console.log("");
  console.log("## Cost basis drift");
  console.log(
    markdownTable(
      [
        {
          currentSourceCost: report.costBasisDrift.saleConsumption.currentSourceCost,
          targetLedgerCost: report.costBasisDrift.saleConsumption.targetLedgerCost,
          deltaTargetMinusCurrentSource: report.costBasisDrift.saleConsumption.deltaTargetMinusCurrentSource,
          rowsWithChangedCostBasis: report.costBasisDrift.saleConsumption.rowsWithChangedCostBasis,
        },
      ],
      [
        { key: "currentSourceCost", label: "Current source cost" },
        { key: "targetLedgerCost", label: "Target ledger cost" },
        { key: "deltaTargetMinusCurrentSource", label: "Target - current source" },
        { key: "rowsWithChangedCostBasis", label: "Rows with changed cost basis" },
      ],
    ),
  );
  console.log(
    "Cost basis uses moving average at movement time; differences here are valuation drift, not fixed master-data mismatches.",
  );
  console.log("");
  console.log("## Transfer directions");
  console.log(
    markdownTable(
      Object.entries(report.target.transferDirections).map(([direction, count]) => ({ direction, count })),
      [{ key: "direction", label: "Direction" }, { key: "count", label: "Count" }],
    ),
  );
  console.log("");
  console.log("## Sale consumption by branch/date/ingredient");
  console.log(
    markdownTable(report.target.saleConsumptionByBranchDateIngredient, [
      { key: "branch", label: "Branch" },
      { key: "date", label: "Date" },
      { key: "ingredient", label: "Ingredient" },
      { key: "quantity", label: "Quantity" },
      { key: "unit", label: "Unit" },
      { key: "cost", label: "Cost" },
      { key: "movements", label: "Movements" },
    ]),
  );
  console.log("");
  console.log("## Exception counts");
  console.log(markdownTable(exceptionCounts, [{ key: "exception", label: "Exception" }, { key: "count", label: "Count" }]));
  console.log("");
  console.log("## Exception samples");
  console.log("### Planned sale consumption missing from target");
  console.log(
    markdownTable(report.sourceDriftDetails.saleConsumption.missingFromTarget.slice(0, 20), [
      { key: "branch", label: "Branch" },
      { key: "date", label: "Date" },
      { key: "locationId", label: "Location" },
      { key: "ingredient", label: "Ingredient" },
      { key: "quantity", label: "Quantity" },
      { key: "unitCost", label: "Unit cost" },
      { key: "cost", label: "Cost" },
      { key: "reason", label: "Reason" },
    ]),
  );
  console.log("");
  console.log("### Target sale consumption extra vs current source");
  console.log(
    markdownTable(report.sourceDriftDetails.saleConsumption.extraInTarget.slice(0, 20), [
      { key: "id", label: "Movement" },
      { key: "branch", label: "Branch" },
      { key: "date", label: "Date" },
      { key: "locationId", label: "Location" },
      { key: "ingredient", label: "Ingredient" },
      { key: "quantity", label: "Quantity" },
      { key: "unitCost", label: "Unit cost" },
      { key: "cost", label: "Cost" },
      { key: "reason", label: "Reason" },
    ]),
  );
  console.log("");
  console.log("### Sale consumption cost-basis changes");
  console.log(
    markdownTable(report.sourceDriftDetails.saleConsumption.changed.slice(0, 20), [
      { key: "id", label: "Movement" },
      { key: "branch", label: "Branch" },
      { key: "date", label: "Date" },
      { key: "ingredient", label: "Ingredient" },
      { key: "quantity", label: "Quantity" },
      { key: "expectedUnitCost", label: "Expected unit cost" },
      { key: "targetUnitCost", label: "Target unit cost" },
      { key: "expectedCost", label: "Expected cost" },
      { key: "targetCost", label: "Target cost" },
      { key: "reason", label: "Reason" },
    ]),
  );
  console.log("");
  console.log("### Planned transfers missing from target");
  console.log(
    markdownTable(report.sourceDriftDetails.transfer.missingFromTarget.slice(0, 20), [
      { key: "transferNumber", label: "Transfer" },
      { key: "fromLocationId", label: "From location" },
      { key: "toLocationId", label: "To location" },
      { key: "lineCount", label: "Lines" },
      { key: "cost", label: "Cost" },
      { key: "notes", label: "Notes" },
    ]),
  );
  console.log("");
  console.log("### Target transfers extra vs current source");
  console.log(
    markdownTable(report.sourceDriftDetails.transfer.extraInTarget.slice(0, 20), [
      { key: "transferNumber", label: "Transfer" },
      { key: "fromLocationId", label: "From location" },
      { key: "toLocationId", label: "To location" },
      { key: "notes", label: "Notes" },
    ]),
  );
  console.log("");
  console.log("### Bad sale consumption locations");
  console.log(
    markdownTable(report.target.saleConsumptionExceptions.badConsumptionLocations.slice(0, 20), [
      { key: "id", label: "Movement" },
      { key: "branch", label: "Branch" },
      { key: "locationId", label: "Location" },
      { key: "locationKind", label: "Location kind" },
      { key: "ingredient", label: "Ingredient" },
      { key: "quantity", label: "Quantity" },
      { key: "cost", label: "Cost" },
    ]),
  );
  console.log("");
  console.log("### Ledger mismatches");
  console.log(
    markdownTable(report.target.stockExceptions.ledgerMismatches.slice(0, 20), [
      { key: "branch", label: "Branch" },
      { key: "locationId", label: "Location" },
      { key: "ingredient", label: "Ingredient" },
      { key: "ledgerQuantity", label: "Ledger qty" },
      { key: "levelQuantity", label: "Level qty" },
      { key: "unit", label: "Unit" },
    ]),
  );
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
    expectedGrnReceiptRows: report.expected.grnReceiptMovements,
    expectedProductionConsumptionRows: report.expected.productionConsumptionMovements,
    expectedProductionOutputRows: report.expected.productionOutputMovements,
    currentSourceSaleConsumptionCost: report.expected.saleConsumptionCost,
    targetLedgerSaleConsumptionCost: report.target.saleConsumptionCost,
    expectedStockMovementRows: report.expected.stockMovementRows,
    targetStockMovementRows: report.target.stockMovementRows,
    missingCostRows: report.financeFoodCostMirror.missingCostRows,
    zeroCostRows: report.financeFoodCostMirror.zeroCostRows,
    targetStockLevels: report.target.stockLevels,
    targetStockValue: report.target.stockValue,
  });
  console.log("Sale consumption by branch/date/ingredient (first 20 rows)");
  console.table(report.target.saleConsumptionByBranchDateIngredient.slice(0, 20));
  console.log("Current-source drift details");
  console.table({
    movements: {
      matched: report.sourceDriftDetails.movement.matched,
      missingFromTarget: report.sourceDriftDetails.movement.missingFromTarget.length,
      extraInTarget: report.sourceDriftDetails.movement.extraInTarget.length,
      costBasisChanged: report.sourceDriftDetails.movement.changed.length,
    },
    saleConsumption: {
      matched: report.sourceDriftDetails.saleConsumption.matched,
      missingFromTarget: report.sourceDriftDetails.saleConsumption.missingFromTarget.length,
      extraInTarget: report.sourceDriftDetails.saleConsumption.extraInTarget.length,
      costBasisChanged: report.sourceDriftDetails.saleConsumption.changed.length,
    },
    transfers: {
      matched: report.sourceDriftDetails.transfer.matched,
      missingFromTarget: report.sourceDriftDetails.transfer.missingFromTarget.length,
      extraInTarget: report.sourceDriftDetails.transfer.extraInTarget.length,
      costBasisChanged: report.sourceDriftDetails.transfer.changed.length,
    },
    transferItems: {
      matched: report.sourceDriftDetails.transferItem.matched,
      missingFromTarget: report.sourceDriftDetails.transferItem.missingFromTarget.length,
      extraInTarget: report.sourceDriftDetails.transferItem.extraInTarget.length,
      costBasisChanged: report.sourceDriftDetails.transferItem.changed.length,
    },
  });
  console.log("Sale consumption drift samples");
  console.table({
    missingFromTarget: report.sourceDriftDetails.saleConsumption.missingFromTarget.slice(0, 5),
    extraInTarget: report.sourceDriftDetails.saleConsumption.extraInTarget.slice(0, 5),
  });
  console.log("Exception counts");
  console.table({
    badConsumptionLocations: report.target.saleConsumptionExceptions.badConsumptionLocations.length,
    branchLocationMismatches: report.target.saleConsumptionExceptions.branchLocationMismatches.length,
    missingImportSource: report.target.saleConsumptionExceptions.missingImportSource.length,
    missingUnitCost: report.target.saleConsumptionExceptions.missingUnitCost.length,
    zeroUnitCost: report.target.saleConsumptionExceptions.zeroUnitCost.length,
    unresolvedRefs: report.target.saleConsumptionExceptions.unresolvedRefs.length,
    ledgerMismatches: report.target.stockExceptions.ledgerMismatches.length,
    negativeStock: report.target.stockExceptions.negativeStock.length,
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
        stockMovementRows: 5,
      },
      plannedRows: {
        transferItems: [
          {
            ingredient_id: 1,
            quantity: 2,
            quantity_received: 2,
            transfer_number: "TR-1",
            unit: "kg",
          },
        ],
        transfers: [
          {
            from_location_id: 10,
            lineCount: 1,
            notes: "matu-platform import:real_transfer:t1",
            to_location_id: 20,
            transfer_number: "TR-1",
          },
        ],
        movements: [
          {
            branch_id: 1,
            ingredient_id: 1,
            location_id: 10,
            quantity_change: -2,
            reason: "matu-platform import:real_transfer:t1:transfer_out",
            tenant_id: 1,
            type: "transfer_out",
          },
          {
            branch_id: 2,
            ingredient_id: 1,
            location_id: 20,
            quantity_change: 2,
            reason: "matu-platform import:real_transfer:t1:transfer_in",
            tenant_id: 1,
            type: "transfer_in",
          },
          {
            branch_id: 1,
            ingredient_id: 2,
            location_id: 10,
            movement_subtype: "sale_consumption",
            quantity_change: -2,
            reason: "matu-platform import:sale_consumption:t-missing",
            tenant_id: 1,
            type: "consumption",
            unit_cost: 30000,
          },
          {
            branch_id: 2,
            ingredient_id: 1,
            location_id: 20,
            quantity_change: 3,
            reason: "matu-platform import:balance_adjustment",
            tenant_id: 1,
            type: "count_adjustment",
          },
          {
            branch_id: 2,
            ingredient_id: 3,
            location_id: 20,
            quantity_change: 1.234,
            reason: "matu-platform import:balance_adjustment",
            tenant_id: 1,
            type: "count_adjustment",
          },
        ],
      },
    },
    {
      branches: [
        { id: 1, code: "DD", name: "Dong Den", branch_kind: "branch" },
        { id: 2, code: "KT", name: "Kho Tong", branch_kind: "central_supply" },
      ],
      ingredients: [
        { id: 1, name: "Rice", unit: "kg" },
        { id: 2, name: "Pork", unit: "kg" },
        { id: 3, name: "Tea", unit: "g" },
      ],
      issues: [],
      locations: [
        { id: 10, branch_id: 1, location_kind: "warehouse", is_active: true },
        { id: 20, branch_id: 2, location_kind: "warehouse", is_active: true },
      ],
      stocktakes: [],
      transferItems: [
        {
          id: 1,
          ingredient_id: 1,
          quantity: 2,
          quantity_received: 2,
          transfer_id: 1,
          unit: "kg",
        },
      ],
      transfers: [
        {
          id: 1,
          from_location_id: 10,
          to_location_id: 20,
          notes: "matu-platform import:real_transfer:t1",
          transfer_number: "TR-1",
        },
      ],
      movements: [
        {
          id: 1,
          branch_id: 1,
          created_at: "2026-06-01T01:00:00.000Z",
          tenant_id: 1,
          location_id: 10,
          ingredient_id: 1,
          quantity_change: -2,
          type: "transfer_out",
          reason: "matu-platform import:real_transfer:t1:transfer_out",
        },
        {
          id: 2,
          branch_id: 2,
          created_at: "2026-06-01T01:01:00.000Z",
          tenant_id: 1,
          location_id: 20,
          ingredient_id: 1,
          quantity_change: 2,
          type: "transfer_in",
          reason: "matu-platform import:real_transfer:t1:transfer_in",
        },
        {
          id: 3,
          branch_id: 1,
          created_at: "2026-06-01T01:02:00.000Z",
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
          id: 4,
          branch_id: 2,
          created_at: "2026-06-01T01:03:00.000Z",
          tenant_id: 1,
          location_id: 20,
          ingredient_id: 1,
          quantity_change: 3,
          type: "count_adjustment",
          reason: "matu-platform import:balance_adjustment",
        },
        {
          id: 5,
          branch_id: 2,
          created_at: "2026-06-01T01:04:00.000Z",
          tenant_id: 1,
          location_id: 20,
          ingredient_id: 3,
          quantity_change: 1.234,
          type: "count_adjustment",
          reason: "matu-platform import:balance_adjustment",
        },
      ],
      levels: [
        { tenant_id: 1, branch_id: 1, location_id: 10, ingredient_id: 1, current_quantity: -2, avg_unit_cost: 1 },
        { tenant_id: 1, branch_id: 2, location_id: 20, ingredient_id: 1, current_quantity: 5, avg_unit_cost: 1 },
        { tenant_id: 1, branch_id: 1, location_id: 10, ingredient_id: 2, current_quantity: -2, avg_unit_cost: 30000 },
        { tenant_id: 1, branch_id: 2, location_id: 20, ingredient_id: 3, current_quantity: 1.234, avg_unit_cost: 1 },
      ],
    },
  );
  assert.equal(report.ok, false);
  assert.ok(report.failures.includes("target has negative stock levels"));
  assert.equal(report.target.saleConsumptionByBranchDateIngredient.length, 1);
  assert.equal(report.financeFoodCostMirror.importedSaleConsumptionCost, 60000);
  assert.equal(report.financeFoodCostMirror.missingCostRows, 0);
  assert.equal(report.sourceDriftDetails.saleConsumption.missingFromTarget.length, 1);
  assert.equal(report.sourceDriftDetails.saleConsumption.extraInTarget.length, 1);
  assert.equal(report.sourceDriftDetails.transfer.missingFromTarget.length, 0);
  assert.equal(report.sourceDriftDetails.transferItem.missingFromTarget.length, 0);
  assert.equal(report.target.stockExceptions.ledgerMismatches.length, 0);
  console.log("self-test ok");
}

const args = parseArgs(process.argv.slice(2));
if (args.selfTest) {
  selfTest();
} else {
  const [planner, targetData] = await Promise.all([runOperationalPlanner(), loadTarget()]);
  const report = buildReport(planner, targetData);
  if (args.json) console.log(JSON.stringify(report, null, 2));
  else if (args.markdown) printMarkdown(report);
  else printHuman(report);
  if (args.strict && !report.ok) process.exit(1);
}
