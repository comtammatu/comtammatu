#!/usr/bin/env node
import assert from "node:assert/strict";

const PAGE_SIZE = 1000;

function numberOrNull(value) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function dateKey(value) {
  return String(value ?? "").slice(0, 10) || "unknown";
}

function parseArgs(argv) {
  const out = {
    json: false,
    selfTest: false,
    tenantId: null,
    branchId: null,
    from: null,
    to: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--json") out.json = true;
    else if (arg === "--self-test") out.selfTest = true;
    else if (arg === "--tenant-id") out.tenantId = Number(argv[++i]);
    else if (arg === "--branch-id") out.branchId = Number(argv[++i]);
    else if (arg === "--from") out.from = argv[++i] ?? null;
    else if (arg === "--to") out.to = argv[++i] ?? null;
    else if (arg === "--help") {
      console.log(`Usage:
  node scripts/inventory-legacy-kitchen-backfill.mjs [--tenant-id N] [--branch-id N] [--from ISO] [--to ISO] [--json]

Read-only audit for legacy Kho CN -> Bep CN transfers. It does not write data.`);
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

function buildAudit({ transfers, locations, items, movements, stockLevels, branches, ingredients }, filters) {
  const locById = new Map(locations.map((loc) => [loc.id, loc]));
  const branchById = new Map(branches.map((branch) => [branch.id, branch]));
  const ingredientById = new Map(ingredients.map((ingredient) => [ingredient.id, ingredient]));

  const legacyTransfers = transfers.filter((transfer) => {
    const fromLoc = locById.get(transfer.from_location_id);
    const toLoc = locById.get(transfer.to_location_id);
    if (transfer.from_branch_id !== transfer.to_branch_id) return false;
    if (fromLoc?.location_kind !== "warehouse") return false;
    if (toLoc?.location_kind !== "kitchen") return false;
    if (filters.branchId != null && transfer.from_branch_id !== filters.branchId) return false;
    if (filters.from && String(transfer.created_at) < filters.from) return false;
    if (filters.to && String(transfer.created_at) >= filters.to) return false;
    return true;
  });

  const transferIds = new Set(legacyTransfers.map((transfer) => transfer.id));
  const transferInMovements = movements.filter(
    (movement) => transferIds.has(movement.transfer_id) && movement.type === "transfer_in",
  );
  const stockByLegacyKitchen = stockLevels.filter((row) => {
    const loc = locById.get(row.location_id);
    return loc?.location_kind === "kitchen" && numberOrNull(row.current_quantity) !== 0;
  });

  const costByTransfer = new Map();
  for (const movement of transferInMovements) {
    const amount =
      Math.abs(numberOrNull(movement.quantity_change)) * numberOrNull(movement.unit_cost);
    costByTransfer.set(movement.transfer_id, (costByTransfer.get(movement.transfer_id) ?? 0) + amount);
  }

  const branchRows = new Map();
  for (const transfer of legacyTransfers) {
    const branchId = transfer.from_branch_id;
    const row =
      branchRows.get(branchId) ??
      {
        branchId,
        branchName: branchById.get(branchId)?.name ?? `Branch ${branchId}`,
        legacyTransferCount: 0,
        estimatedSaleConsumptionCost: 0,
        phantomKitchenValue: 0,
      };
    row.legacyTransferCount += 1;
    row.estimatedSaleConsumptionCost += costByTransfer.get(transfer.id) ?? 0;
    branchRows.set(branchId, row);
  }

  for (const stock of stockByLegacyKitchen) {
    const row =
      branchRows.get(stock.branch_id) ??
      {
        branchId: stock.branch_id,
        branchName: branchById.get(stock.branch_id)?.name ?? `Branch ${stock.branch_id}`,
        legacyTransferCount: 0,
        estimatedSaleConsumptionCost: 0,
        phantomKitchenValue: 0,
      };
    row.phantomKitchenValue +=
      numberOrNull(stock.current_quantity) * numberOrNull(stock.avg_unit_cost);
    branchRows.set(stock.branch_id, row);
  }

  return {
    generatedAt: new Date().toISOString(),
    mode: "dry-run",
    filters,
    summary: {
      legacyTransferCount: legacyTransfers.length,
      transferInMovementCount: transferInMovements.length,
      estimatedSaleConsumptionCost: [...costByTransfer.values()].reduce((sum, value) => sum + value, 0),
      phantomKitchenQuantity: stockByLegacyKitchen.reduce(
        (sum, row) => sum + numberOrNull(row.current_quantity),
        0,
      ),
      phantomKitchenValue: stockByLegacyKitchen.reduce(
        (sum, row) => sum + numberOrNull(row.current_quantity) * numberOrNull(row.avg_unit_cost),
        0,
      ),
    },
    branches: [...branchRows.values()].sort((a, b) => b.estimatedSaleConsumptionCost - a.estimatedSaleConsumptionCost),
    candidateTransfers: legacyTransfers.map((transfer) => ({
      id: transfer.id,
      transferNumber: transfer.transfer_number,
      branchId: transfer.from_branch_id,
      branchName: branchById.get(transfer.from_branch_id)?.name ?? null,
      date: dateKey(transfer.received_at ?? transfer.created_at),
      transferInCost: costByTransfer.get(transfer.id) ?? 0,
      lineCount: items.filter((item) => item.transfer_id === transfer.id).length,
    })),
    dryRunCorrections: stockByLegacyKitchen.map((stock) => ({
      branchId: stock.branch_id,
      branchName: branchById.get(stock.branch_id)?.name ?? null,
      ingredientId: stock.ingredient_id,
      ingredientName: ingredientById.get(stock.ingredient_id)?.name ?? null,
      kitchenLocationId: stock.location_id,
      quantityToZero: numberOrNull(stock.current_quantity),
      estimatedValue: numberOrNull(stock.current_quantity) * numberOrNull(stock.avg_unit_cost),
    })),
  };
}

async function loadAuditData(filters) {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!baseUrl || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  const ctx = { baseUrl, key };
  const transferFilters = {};
  if (filters.tenantId != null) transferFilters.tenant_id = `eq.${filters.tenantId}`;
  if (filters.branchId != null) {
    transferFilters.from_branch_id = `eq.${filters.branchId}`;
    transferFilters.to_branch_id = `eq.${filters.branchId}`;
  }
  if (filters.from) transferFilters.created_at = `gte.${filters.from}`;
  if (filters.to) transferFilters.created_at = `lt.${filters.to}`;
  const transfers = await fetchAll({
    ...ctx,
    table: "stock_transfers",
    select:
      "id,tenant_id,transfer_number,status,from_branch_id,to_branch_id,from_location_id,to_location_id,created_at,received_at",
    filters: transferFilters,
  });
  const locationFilters = {};
  if (filters.tenantId != null) locationFilters.tenant_id = `eq.${filters.tenantId}`;
  if (filters.branchId != null) locationFilters.branch_id = `eq.${filters.branchId}`;
  const locations = await fetchAll({
    ...ctx,
    table: "inventory_locations",
    select: "id,tenant_id,branch_id,name,location_kind",
    filters: locationFilters,
  });
  const branchIds = [
    ...new Set([
      ...transfers.flatMap((transfer) => [transfer.from_branch_id, transfer.to_branch_id]),
      ...locations.map((loc) => loc.branch_id),
    ]),
  ];
  const transferIds = transfers.map((transfer) => transfer.id);
  const [items, movements, stockLevels, branches] = await Promise.all([
    fetchByIds(ctx, "stock_transfer_items", transferIds, "id,transfer_id,ingredient_id,quantity,unit", "transfer_id"),
    fetchByIds(
      ctx,
      "stock_movements",
      transferIds,
      "id,transfer_id,branch_id,ingredient_id,type,quantity_change,unit_cost,location_id,created_at",
      "transfer_id",
    ),
    fetchByIds(
      ctx,
      "stock_levels",
      locations.map((loc) => loc.id),
      "branch_id,ingredient_id,location_id,current_quantity,avg_unit_cost",
      "location_id",
    ),
    fetchByIds(ctx, "branches", branchIds, "id,name,branch_kind"),
  ]);
  const ingredientIds = [
    ...new Set([...items.map((item) => item.ingredient_id), ...stockLevels.map((row) => row.ingredient_id)]),
  ];
  const ingredients = await fetchByIds(ctx, "ingredients", ingredientIds, "id,name,unit");
  return { transfers, locations, items, movements, stockLevels, branches, ingredients };
}

function printHuman(report) {
  console.log("Inventory legacy kitchen backfill dry-run");
  console.log(`Generated: ${report.generatedAt}`);
  console.log(`Legacy transfers: ${report.summary.legacyTransferCount}`);
  console.log(`Estimated sale consumption cost: ${report.summary.estimatedSaleConsumptionCost}`);
  console.log(`Phantom kitchen value: ${report.summary.phantomKitchenValue}`);
  console.table(report.branches);
  if (report.dryRunCorrections.length > 0) console.table(report.dryRunCorrections);
}

function selfTest() {
  const report = buildAudit(
    {
      transfers: [
        {
          id: 1,
          transfer_number: "TRF-1",
          from_branch_id: 10,
          to_branch_id: 10,
          from_location_id: 100,
          to_location_id: 101,
          created_at: "2026-06-01T01:00:00Z",
          received_at: null,
        },
      ],
      locations: [
        { id: 100, branch_id: 10, location_kind: "warehouse" },
        { id: 101, branch_id: 10, location_kind: "kitchen" },
      ],
      items: [{ transfer_id: 1, ingredient_id: 5 }],
      movements: [
        {
          transfer_id: 1,
          branch_id: 10,
          ingredient_id: 5,
          type: "transfer_in",
          quantity_change: 2,
          unit_cost: 30000,
          location_id: 101,
        },
      ],
      stockLevels: [
        {
          branch_id: 10,
          ingredient_id: 5,
          location_id: 101,
          current_quantity: 2,
          avg_unit_cost: 30000,
        },
      ],
      branches: [{ id: 10, name: "Chi nhánh test" }],
      ingredients: [{ id: 5, name: "Sườn" }],
    },
    { tenantId: null, branchId: null, from: null, to: null },
  );
  assert.equal(report.summary.legacyTransferCount, 1);
  assert.equal(report.summary.estimatedSaleConsumptionCost, 60000);
  assert.equal(report.summary.phantomKitchenValue, 60000);
  assert.equal(report.dryRunCorrections[0].quantityToZero, 2);
  console.log("self-test ok");
}

const args = parseArgs(process.argv.slice(2));
if (args.selfTest) {
  selfTest();
} else {
  const data = await loadAuditData(args);
  const report = buildAudit(data, args);
  if (args.json) console.log(JSON.stringify(report, null, 2));
  else printHuman(report);
}
