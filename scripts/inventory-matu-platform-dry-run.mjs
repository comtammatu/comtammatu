#!/usr/bin/env node
import assert from "node:assert/strict";

const PAGE_SIZE = 1000;

function numberValue(value) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function moneyValue(value) {
  return Math.round(numberValue(value) * 100) / 100;
}

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function countBy(rows, keyFn) {
  const out = {};
  for (const row of rows) {
    const key = keyFn(row) ?? "unknown";
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

function sumBy(rows, keyFn, valueFn) {
  const out = {};
  for (const row of rows) {
    const key = keyFn(row) ?? "unknown";
    out[key] = moneyValue((out[key] ?? 0) + valueFn(row));
  }
  return out;
}

function parseArgs(argv) {
  const out = {
    from: null,
    help: false,
    json: false,
    selfTest: false,
    sourceKey: process.env.MATU_PLATFORM_SUPABASE_SERVICE_ROLE_KEY ?? "",
    sourceUrl: process.env.MATU_PLATFORM_SUPABASE_URL ?? "",
    targetKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    targetUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "",
    to: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--") continue;
    if (arg === "--help" || arg === "-h") out.help = true;
    else if (arg === "--json") out.json = true;
    else if (arg === "--self-test") out.selfTest = true;
    else if (arg === "--from") out.from = argv[++i] ?? null;
    else if (arg === "--to") out.to = argv[++i] ?? null;
    else if (arg === "--source-url") out.sourceUrl = argv[++i] ?? "";
    else if (arg === "--source-key") out.sourceKey = argv[++i] ?? "";
    else if (arg === "--target-url") out.targetUrl = argv[++i] ?? "";
    else if (arg === "--target-key") out.targetKey = argv[++i] ?? "";
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return out;
}

function printHelp() {
  console.log(`Usage:
  pnpm inventory:matu-platform:dry-run -- [--from ISO] [--to ISO] [--json]

Environment:
  MATU_PLATFORM_SUPABASE_URL
  MATU_PLATFORM_SUPABASE_SERVICE_ROLE_KEY
  NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY

This is read-only. It classifies source Inventory data and prints the import plan.`);
}

function inFilter(values) {
  return `in.(${values.join(",")})`;
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

async function loadSource(ctx, filters) {
  const transferFilters = {};
  const movementFilters = {};
  if (filters.from) {
    transferFilters.created_at = `gte.${filters.from}`;
    movementFilters.created_at = `gte.${filters.from}`;
  }
  if (filters.to) {
    transferFilters.created_at = `lt.${filters.to}`;
    movementFilters.created_at = `lt.${filters.to}`;
  }

  const [branches, warehouses, materials, stockItems, movements, transfers] =
    await Promise.all([
      fetchAll({ ...ctx, table: "branches", select: "id,code,name" }),
      fetchAll({
        ...ctx,
        table: "warehouses",
        select: "id,branch_id,code,name,kind,is_production_default",
      }),
      fetchAll({
        ...ctx,
        table: "materials",
        select:
          "id,sku,name,kind,cost_per_unit,min_stock,is_active,base_unit,purchase_unit,purchase_to_base_factor",
      }),
      fetchAll({
        ...ctx,
        table: "stock_items",
        select: "warehouse_id,material_id,quantity,reorder_level,updated_at",
      }),
      fetchAll({
        ...ctx,
        table: "stock_movements",
        select: "id,warehouse_id,material_id,delta,kind,ref_table,ref_id,created_at",
        filters: movementFilters,
      }),
      fetchAll({
        ...ctx,
        table: "stock_transfers",
        select:
          "id,code,from_warehouse_id,to_warehouse_id,status,requested_at,sent_at,received_at,created_at",
        filters: transferFilters,
      }),
    ]);

  const transferItems = await fetchByIds(
    ctx,
    "stock_transfer_items",
    transfers.map((transfer) => transfer.id),
    "transfer_id,material_id,quantity,lot_id",
    "transfer_id",
  );

  return { branches, warehouses, materials, stockItems, movements, transfers, transferItems };
}

async function loadTarget(ctx) {
  const [branches, locations, ingredients, transfers, movements] = await Promise.all([
    fetchAll({ ...ctx, table: "branches", select: "id,code,name,branch_kind" }),
    fetchAll({
      ...ctx,
      table: "inventory_locations",
      select: "id,branch_id,code,name,location_kind,is_default_issue,is_active",
    }),
    fetchAll({ ...ctx, table: "ingredients", select: "id,sku,name,unit,purchase_unit,unit_cost,is_active" }),
    fetchAll({ ...ctx, table: "stock_transfers", select: "id,from_branch_id,to_branch_id" }),
    fetchAll({ ...ctx, table: "stock_movements", select: "id,type,movement_subtype" }),
  ]);

  return { branches, locations, ingredients, transfers, movements };
}

function sourceWarehouseRole(warehouse) {
  const code = String(warehouse?.code ?? "");
  const name = normalizeText(warehouse?.name);
  if (warehouse?.branch_id && warehouse?.kind === "warehouse") return "branch_warehouse";
  if (warehouse?.branch_id && warehouse?.kind === "kitchen") return "branch_kitchen_endpoint";
  if (!warehouse?.branch_id && code === "KHO-TONG") return "central_supply";
  if (
    !warehouse?.branch_id &&
    (code === "KHO-TT" ||
      code === "BEP-TT" ||
      warehouse?.is_production_default ||
      name.includes("trung tam"))
  ) {
    return "central_kitchen";
  }
  return "manual_review";
}

function isAllowedTargetTransferDirection(fromKind, toKind) {
  return (
    (fromKind === "branch" &&
      (toKind === "branch" || toKind === "central_supply" || toKind === "central_kitchen")) ||
    ((fromKind === "central_supply" || fromKind === "central_kitchen") && toKind === "branch") ||
    (fromKind === "central_supply" && toKind === "central_kitchen") ||
    (fromKind === "central_kitchen" && toKind === "central_supply")
  );
}

function makeTargetIndex(target) {
  const branchByCode = new Map(
    target.branches
      .filter((branch) => branch.code)
      .map((branch) => [String(branch.code).toUpperCase(), branch]),
  );
  const branchByName = new Map(target.branches.map((branch) => [normalizeText(branch.name), branch]));
  const centralSupply = target.branches.find((branch) => branch.branch_kind === "central_supply") ?? null;
  const centralKitchen =
    target.branches.find((branch) => branch.branch_kind === "central_kitchen") ?? null;

  const locationsByBranch = new Map();
  for (const loc of target.locations) {
    const list = locationsByBranch.get(loc.branch_id) ?? [];
    list.push(loc);
    locationsByBranch.set(loc.branch_id, list);
  }

  const stockLocationForBranch = (branchId) => {
    const list = locationsByBranch.get(branchId) ?? [];
    return (
      list.find((loc) => loc.is_default_issue && loc.location_kind === "warehouse") ??
      list.find((loc) => loc.location_kind === "warehouse") ??
      list.find((loc) => loc.location_kind === "production_storage") ??
      null
    );
  };

  const ingredientBySku = new Map(
    target.ingredients
      .filter((ingredient) => ingredient.sku)
      .map((ingredient) => [String(ingredient.sku).toUpperCase(), ingredient]),
  );

  return { branchByCode, branchByName, centralKitchen, centralSupply, ingredientBySku, stockLocationForBranch };
}

function sourceBranchToTarget(sourceBranch, targetIndex) {
  if (!sourceBranch) return null;
  return (
    targetIndex.branchByCode.get(String(sourceBranch.code ?? "").toUpperCase()) ??
    targetIndex.branchByName.get(normalizeText(sourceBranch.name)) ??
    null
  );
}

function sourceWarehouseTarget(warehouse, sourceBranchById, targetIndex) {
  const role = sourceWarehouseRole(warehouse);
  if (role === "central_supply") {
    const branch = targetIndex.centralSupply;
    return { branch, location: branch ? targetIndex.stockLocationForBranch(branch.id) : null, role };
  }
  if (role === "central_kitchen") {
    const branch = targetIndex.centralKitchen;
    return { branch, location: branch ? targetIndex.stockLocationForBranch(branch.id) : null, role };
  }

  const sourceBranch = sourceBranchById.get(warehouse?.branch_id);
  const branch = sourceBranchToTarget(sourceBranch, targetIndex);
  const location =
    role === "branch_warehouse" && branch ? targetIndex.stockLocationForBranch(branch.id) : null;
  return { branch, location, role };
}

function transferCost(transfer, transferItemsByTransfer, materialById) {
  return (transferItemsByTransfer.get(transfer.id) ?? []).reduce((sum, item) => {
    const material = materialById.get(item.material_id);
    return sum + numberValue(item.quantity) * numberValue(material?.cost_per_unit);
  }, 0);
}

function classifyTransfer({ transfer, sourceWarehouseById, sourceBranchById, targetIndex, transferItemsByTransfer, materialById }) {
  const from = sourceWarehouseById.get(transfer.from_warehouse_id);
  const to = sourceWarehouseById.get(transfer.to_warehouse_id);
  const fromTarget = sourceWarehouseTarget(from, sourceBranchById, targetIndex);
  const toTarget = sourceWarehouseTarget(to, sourceBranchById, targetIndex);
  const cost = transferCost(transfer, transferItemsByTransfer, materialById);
  const base = {
    cost: moneyValue(cost),
    fromCode: from?.code ?? null,
    fromRole: fromTarget.role,
    id: transfer.id,
    lineCount: (transferItemsByTransfer.get(transfer.id) ?? []).length,
    status: transfer.status,
    toCode: to?.code ?? null,
    toRole: toTarget.role,
    transferCode: transfer.code,
  };

  if (transfer.status !== "received") return { ...base, class: "ignored_not_received" };
  if (toTarget.role === "branch_kitchen_endpoint") {
    return {
      ...base,
      branchCode: toTarget.branch?.code ?? null,
      class: "branch_sale_consumption",
      targetLocationId: targetIndex.stockLocationForBranch(toTarget.branch?.id)?.id ?? null,
    };
  }
  if (fromTarget.role === "branch_kitchen_endpoint") {
    return { ...base, class: "manual_review_kitchen_source" };
  }
  if (fromTarget.location && toTarget.location) {
    if (fromTarget.location.id === toTarget.location.id || fromTarget.branch?.id === toTarget.branch?.id) {
      return { ...base, class: "manual_review_same_target_site" };
    }
    if (!isAllowedTargetTransferDirection(fromTarget.branch?.branch_kind, toTarget.branch?.branch_kind)) {
      return { ...base, class: "manual_review_disallowed_direction" };
    }
    return {
      ...base,
      class: "real_transfer",
      targetFromBranchId: fromTarget.branch?.id ?? null,
      targetToBranchId: toTarget.branch?.id ?? null,
    };
  }
  return { ...base, class: "manual_review_missing_target" };
}

function buildReport(source, target, filters = {}) {
  const sourceBranchById = new Map(source.branches.map((branch) => [branch.id, branch]));
  const sourceWarehouseById = new Map(source.warehouses.map((warehouse) => [warehouse.id, warehouse]));
  const materialById = new Map(source.materials.map((material) => [material.id, material]));
  const targetIndex = makeTargetIndex(target);
  const transferItemsByTransfer = new Map();
  for (const item of source.transferItems) {
    const list = transferItemsByTransfer.get(item.transfer_id) ?? [];
    list.push(item);
    transferItemsByTransfer.set(item.transfer_id, list);
  }

  const branchMatches = source.branches.map((sourceBranch) => {
    const targetBranch = sourceBranchToTarget(sourceBranch, targetIndex);
    return {
      sourceCode: sourceBranch.code,
      sourceName: sourceBranch.name,
      targetBranchId: targetBranch?.id ?? null,
      targetCode: targetBranch?.code ?? null,
      targetName: targetBranch?.name ?? null,
    };
  });

  const materialRows = source.materials.map((material) => {
    const targetIngredient = targetIndex.ingredientBySku.get(String(material.sku ?? "").toUpperCase());
    return {
      sourceSku: material.sku,
      sourceName: material.name,
      targetIngredientId: targetIngredient?.id ?? null,
      targetName: targetIngredient?.name ?? null,
    };
  });

  const sourceStockRows = source.stockItems.map((stock) => {
    const warehouse = sourceWarehouseById.get(stock.warehouse_id);
    const targetRef = sourceWarehouseTarget(warehouse, sourceBranchById, targetIndex);
    const material = materialById.get(stock.material_id);
    const quantity = numberValue(stock.quantity);
    const value = quantity * numberValue(material?.cost_per_unit);
    return {
      materialId: stock.material_id,
      quantity,
      role: targetRef.role,
      sourceWarehouseCode: warehouse?.code ?? null,
      targetBranchId: targetRef.branch?.id ?? null,
      targetLocationId: targetRef.location?.id ?? null,
      value,
    };
  });

  const nonzeroStockRows = sourceStockRows.filter((row) => row.quantity !== 0);
  const stockBearingRows = nonzeroStockRows.filter((row) => row.targetLocationId != null);
  const missingStockTargetRows = nonzeroStockRows.filter(
    (row) => row.role !== "branch_kitchen_endpoint" && row.targetLocationId == null,
  );
  const branchKitchenRows = nonzeroStockRows.filter((row) => row.role === "branch_kitchen_endpoint");
  const transferRows = source.transfers.map((transfer) =>
    classifyTransfer({
      materialById,
      sourceBranchById,
      sourceWarehouseById,
      targetIndex,
      transfer,
      transferItemsByTransfer,
    }),
  );

  const preconditions = [];
  if (!targetIndex.centralSupply) preconditions.push("missing target branch_kind=central_supply");
  if (!targetIndex.centralKitchen) preconditions.push("missing target branch_kind=central_kitchen");
  if (target.ingredients.length === 0) preconditions.push("target ingredients empty; import master data first");
  if (materialRows.some((row) => !row.targetIngredientId)) preconditions.push("unmatched material SKU(s)");
  if (branchMatches.some((row) => !row.targetBranchId)) preconditions.push("unmatched branch code/name");
  if (missingStockTargetRows.length > 0) preconditions.push("stock-bearing source warehouse missing target location");

  return {
    generatedAt: new Date().toISOString(),
    mode: "dry-run",
    filters,
    source: {
      branches: source.branches.length,
      materials: source.materials.length,
      materialsByKind: countBy(source.materials, (row) => row.kind),
      movementKinds: countBy(source.movements, (row) => row.kind),
      stockRows: source.stockItems.length,
      transfers: source.transfers.length,
      warehouses: source.warehouses.map((warehouse) => ({
        branchCode: sourceBranchById.get(warehouse.branch_id)?.code ?? "central",
        code: warehouse.code,
        name: warehouse.name,
        role: sourceWarehouseRole(warehouse),
      })),
    },
    target: {
      branchKinds: countBy(target.branches, (row) => row.branch_kind),
      locationKinds: countBy(target.locations, (row) => row.location_kind),
      ingredients: target.ingredients.length,
      movements: target.movements.length,
      preconditions,
      transfers: target.transfers.length,
    },
    mapping: {
      branches: branchMatches,
      materials: {
        matched: materialRows.filter((row) => row.targetIngredientId).length,
        missing: materialRows.filter((row) => !row.targetIngredientId).length,
        missingSamples: materialRows.filter((row) => !row.targetIngredientId).slice(0, 20),
      },
    },
    stockSnapshotPlan: {
      stockBearingRows: stockBearingRows.length,
      stockBearingValue: moneyValue(stockBearingRows.reduce((sum, row) => sum + row.value, 0)),
      branchKitchenRows: branchKitchenRows.length,
      branchKitchenValue: moneyValue(branchKitchenRows.reduce((sum, row) => sum + row.value, 0)),
      bySourceWarehouse: sumBy(nonzeroStockRows, (row) => row.sourceWarehouseCode, (row) => row.value),
      missingTargetRows: missingStockTargetRows.length,
      missingTargetSamples: missingStockTargetRows.slice(0, 20),
    },
    transferPlan: {
      counts: countBy(transferRows, (row) => row.class),
      saleConsumptionCostByBranch: sumBy(
        transferRows.filter((row) => row.class === "branch_sale_consumption"),
        (row) => row.branchCode ?? "unmapped",
        (row) => row.cost,
      ),
      samples: transferRows
        .filter((row) => row.class !== "real_transfer")
        .slice(0, 20),
    },
    nextApplyOrder: [
      "create missing central_supply and central_kitchen branches/stock locations",
      "import materials as ingredients by SKU",
      "import stock-bearing opening stock only",
      "convert all source transfers into branch kitchen endpoints to consumption/sale_consumption",
      "import only real stock-bearing transfers",
      "review manual_review rows before any write",
    ],
  };
}

function printHuman(report) {
  console.log("Matu-platform Inventory import dry-run");
  console.log(`Generated: ${report.generatedAt}`);
  console.log(`Source materials: ${report.source.materials}`);
  console.log(`Source transfers: ${report.source.transfers}`);
  console.log(`Target ingredients: ${report.target.ingredients}`);
  console.log(`Target preconditions: ${report.target.preconditions.length ? report.target.preconditions.join("; ") : "ok"}`);
  console.log("Transfer plan:");
  console.table(report.transferPlan.counts);
  console.log("Sale consumption cost by branch:");
  console.table(report.transferPlan.saleConsumptionCostByBranch);
  console.log("Stock snapshot plan:");
  console.table(report.stockSnapshotPlan.bySourceWarehouse);
  if (report.mapping.materials.missingSamples.length > 0) {
    console.log("Missing material SKU samples:");
    console.table(report.mapping.materials.missingSamples);
  }
}

function selfTest() {
  const source = {
    branches: [
      { id: "b-dd", code: "DD", name: "Dat Do" },
      { id: "b-ph", code: "PH", name: "Phuoc Hai" },
    ],
    warehouses: [
      { id: "kho-tong", branch_id: null, code: "KHO-TONG", name: "Kho Tong", kind: "warehouse" },
      { id: "kho-dd", branch_id: "b-dd", code: "KHO-DD", name: "Kho DD", kind: "warehouse" },
      { id: "bep-dd", branch_id: "b-dd", code: "BEP-DD", name: "Bep DD", kind: "kitchen" },
      {
        id: "kho-tt",
        branch_id: null,
        code: "KHO-TT",
        name: "Kho Trung Tam",
        kind: "warehouse",
        is_production_default: true,
      },
    ],
    materials: [
      { id: "m1", sku: "MAT-1", name: "Rice", kind: "raw", cost_per_unit: 10 },
      { id: "m2", sku: "MAT-2", name: "Pork", kind: "raw", cost_per_unit: 20 },
    ],
    stockItems: [
      { warehouse_id: "kho-dd", material_id: "m1", quantity: 5 },
      { warehouse_id: "bep-dd", material_id: "m2", quantity: 3 },
    ],
    movements: [{ kind: "transfer_in" }],
    transfers: [
      {
        id: "t1",
        code: "TR-1",
        from_warehouse_id: "kho-dd",
        to_warehouse_id: "bep-dd",
        status: "received",
      },
      {
        id: "t2",
        code: "TR-2",
        from_warehouse_id: "kho-tong",
        to_warehouse_id: "kho-dd",
        status: "received",
      },
      {
        id: "t3",
        code: "TR-3",
        from_warehouse_id: "kho-dd",
        to_warehouse_id: "kho-tong",
        status: "received",
      },
    ],
    transferItems: [
      { transfer_id: "t1", material_id: "m2", quantity: 2 },
      { transfer_id: "t2", material_id: "m1", quantity: 4 },
      { transfer_id: "t3", material_id: "m1", quantity: 1 },
    ],
  };
  const target = {
    branches: [
      { id: 1, code: "DD", name: "Dat Do", branch_kind: "branch" },
      { id: 2, code: "KT", name: "Kho Tong", branch_kind: "central_supply" },
      { id: 3, code: "BTT", name: "Bep Trung Tam", branch_kind: "central_kitchen" },
    ],
    locations: [
      { id: 10, branch_id: 1, location_kind: "warehouse", is_default_issue: true },
      { id: 20, branch_id: 2, location_kind: "warehouse", is_default_issue: true },
      { id: 30, branch_id: 3, location_kind: "warehouse", is_default_issue: true },
    ],
    ingredients: [{ id: 100, sku: "MAT-1", name: "Rice" }],
    transfers: [],
    movements: [],
  };
  const report = buildReport(source, target);
  assert.equal(report.transferPlan.counts.branch_sale_consumption, 1);
  assert.equal(report.transferPlan.counts.real_transfer, 2);
  assert.equal(report.stockSnapshotPlan.branchKitchenRows, 1);
  assert.equal(report.stockSnapshotPlan.stockBearingRows, 1);
  assert.equal(report.mapping.materials.missing, 1);
  console.log("self-test ok");
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  printHelp();
} else if (args.selfTest) {
  selfTest();
} else {
  if (!args.sourceUrl || !args.sourceKey || !args.targetUrl || !args.targetKey) {
    throw new Error("Missing source/target Supabase env for dry-run");
  }
  const [source, target] = await Promise.all([
    loadSource({ baseUrl: args.sourceUrl, key: args.sourceKey }, args),
    loadTarget({ baseUrl: args.targetUrl, key: args.targetKey }),
  ]);
  const report = buildReport(source, target, { from: args.from, to: args.to });
  if (args.json) console.log(JSON.stringify(report, null, 2));
  else printHuman(report);
}
