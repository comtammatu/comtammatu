#!/usr/bin/env node
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";

const SOURCE_REF = "dyksphedgzqsqjqgxzog";
const TARGET_REF = "iexwsuaqqenyjiskawoj";
const PAGE_SIZE = 1000;

function numberValue(value) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function moneyValue(value) {
  return Math.round(numberValue(value) * 100) / 100;
}

function costValue(quantity, unitCost) {
  return numberValue(quantity) * moneyValue(unitCost);
}

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function parseArgs(argv) {
  const out = {
    actorId: process.env.MATU_IMPORT_ACTOR_ID ?? "",
    allowManualReviewSkip: false,
    balanceAt: null,
    help: false,
    includeRows: false,
    json: false,
    selfTest: false,
    sourceKey: process.env.MATU_PLATFORM_SUPABASE_SERVICE_ROLE_KEY ?? "",
    sourceUrl: process.env.MATU_PLATFORM_SUPABASE_URL ?? "",
    targetKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    targetUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "",
    writeResetSql: null,
    writeSql: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--") continue;
    if (arg === "--allow-manual-review-skip") out.allowManualReviewSkip = true;
    else if (arg === "--help" || arg === "-h") out.help = true;
    else if (arg === "--include-rows") out.includeRows = true;
    else if (arg === "--json") out.json = true;
    else if (arg === "--self-test") out.selfTest = true;
    else if (arg === "--actor-id") out.actorId = argv[++i] ?? "";
    else if (arg === "--balance-at") out.balanceAt = argv[++i] ?? null;
    else if (arg === "--source-url") out.sourceUrl = argv[++i] ?? "";
    else if (arg === "--source-key") out.sourceKey = argv[++i] ?? "";
    else if (arg === "--target-url") out.targetUrl = argv[++i] ?? "";
    else if (arg === "--target-key") out.targetKey = argv[++i] ?? "";
    else if (arg === "--write-reset-sql") out.writeResetSql = argv[++i] ?? null;
    else if (arg === "--write-sql") out.writeSql = argv[++i] ?? null;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return out;
}

function printHelp() {
  console.log(`Usage:
  pnpm inventory:matu-platform:operational -- [--json]
  pnpm inventory:matu-platform:operational -- --json --include-rows
  pnpm inventory:matu-platform:operational -- --write-sql /tmp/import.sql --allow-manual-review-skip
  pnpm inventory:matu-platform:operational -- --write-reset-sql /tmp/reset.sql

Builds the operational Inventory import plan:
  - real stock-bearing transfers
  - branch sale consumption from retired Bep CN transfer-in
  - balance adjustments so current stock matches matu-platform stock_items

This script does not apply SQL. It writes one transaction file only after blockers are clear.
The reset SQL is guarded and only targets previous matu-platform import rows.`);
}

function assertProjectUrl(url, ref, label) {
  if (!url.includes(ref)) throw new Error(`${label} URL must target ${ref}`);
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
    out[key] = (out[key] ?? 0) + valueFn(row);
  }
  return Object.fromEntries(
    Object.entries(out).map(([key, value]) => [key, moneyValue(value)]),
  );
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

async function loadSource(ctx) {
  const [
    branches,
    warehouses,
    materials,
    stockItems,
    transfers,
    goodsReceipts,
    goodsReceiptItems,
    productionRuns,
    recipes,
    recipeItems,
  ] = await Promise.all([
    fetchAll({ ...ctx, table: "branches", select: "id,code,name" }),
    fetchAll({
      ...ctx,
      table: "warehouses",
      select: "id,branch_id,code,name,kind,is_production_default",
    }),
    fetchAll({
      ...ctx,
      table: "materials",
      select: "id,sku,name,kind,cost_per_unit,base_unit,purchase_unit,purchase_to_base_factor",
    }),
    fetchAll({
      ...ctx,
      table: "stock_items",
      select: "warehouse_id,material_id,quantity,updated_at",
    }),
    fetchAll({
      ...ctx,
      table: "stock_transfers",
      select:
        "id,code,from_warehouse_id,to_warehouse_id,status,requested_at,sent_at,received_at,created_at",
    }),
    fetchAll({
      ...ctx,
      table: "goods_receipts",
      select: "id,code,warehouse_id,status,received_at,posted_at,created_at",
    }),
    fetchAll({
      ...ctx,
      table: "goods_receipt_items",
      select: "receipt_id,material_id,quantity,qty_base,unit_cost,unit_cost_base",
    }),
    fetchAll({
      ...ctx,
      table: "production_runs",
      select:
        "id,code,recipe_id,actual_quantity,consume_warehouse_id,output_warehouse_id,status,completed_at,created_at",
    }),
    fetchAll({
      ...ctx,
      table: "recipes",
      select: "id,name,output_material_id,output_quantity,output_unit",
    }),
    fetchAll({
      ...ctx,
      table: "recipe_items",
      select: "recipe_id,material_id,quantity",
    }),
  ]);

  const transferItems = await fetchByIds(
    ctx,
    "stock_transfer_items",
    transfers.map((transfer) => transfer.id),
    "transfer_id,material_id,quantity",
    "transfer_id",
  );

  return {
    branches,
    goodsReceiptItems,
    goodsReceipts,
    materials,
    productionRuns,
    recipeItems,
    recipes,
    stockItems,
    transferItems,
    transfers,
    warehouses,
  };
}

async function loadTarget(ctx) {
  const [
    tenants,
    branches,
    locations,
    ingredients,
    profiles,
    transfers,
    movements,
    transferItems,
    levels,
    issues,
    stocktakes,
  ] =
    await Promise.all([
      fetchAll({ ...ctx, table: "tenants", select: "id,slug,name" }),
      fetchAll({ ...ctx, table: "branches", select: "id,tenant_id,code,name,branch_kind" }),
      fetchAll({
        ...ctx,
        table: "inventory_locations",
        select: "id,tenant_id,branch_id,code,name,location_kind,is_default_issue,is_active",
      }),
      fetchAll({
        ...ctx,
        table: "ingredients",
        select: "id,tenant_id,sku,name,unit,unit_cost,is_active",
      }),
      fetchAll({
        ...ctx,
        table: "profiles",
        select: "id,tenant_id,branch_id,full_name,is_active,created_at",
      }),
      fetchAll({ ...ctx, table: "stock_transfers", select: "id,transfer_number,notes" }),
      fetchAll({ ...ctx, table: "stock_movements", select: "id,type,reason" }),
      fetchAll({ ...ctx, table: "stock_transfer_items", select: "id,transfer_id" }),
      fetchAll({ ...ctx, table: "stock_levels", select: "id" }),
      fetchAll({ ...ctx, table: "stock_issues", select: "id" }),
      fetchAll({ ...ctx, table: "stocktake_sessions", select: "id" }),
    ]);

  return {
    branches,
    ingredients,
    issues,
    levels,
    locations,
    movements,
    profiles,
    stocktakes,
    tenants,
    transferItems,
    transfers,
  };
}

function getTargetTenant(target) {
  const tenant = target.tenants.find((row) => row.slug === "comtammatu") ?? target.tenants[0];
  if (!tenant) throw new Error("Target tenant not found");
  return tenant;
}

function selectActor(target, tenantId, actorId) {
  if (actorId) {
    const actor = target.profiles.find((row) => row.id === actorId && row.tenant_id === tenantId);
    if (!actor) throw new Error("Import actor profile not found in target tenant");
    return actor;
  }
  const actor = target.profiles
    .filter((row) => row.tenant_id === tenantId && row.is_active)
    .sort((a, b) => {
      if (a.branch_id == null && b.branch_id != null) return -1;
      if (a.branch_id != null && b.branch_id == null) return 1;
      return String(a.created_at ?? "").localeCompare(String(b.created_at ?? ""));
    })[0];
  if (!actor) throw new Error("No active target profile found for import actor");
  return actor;
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

function locationKey(code, kind) {
  return `${String(code ?? "").toLowerCase()}:${String(kind ?? "").toLowerCase()}`;
}

function makeTargetIndex(target, tenantId) {
  const branches = target.branches.filter((branch) => branch.tenant_id === tenantId);
  const locations = target.locations.filter((location) => location.tenant_id === tenantId);
  const ingredients = target.ingredients.filter((ingredient) => ingredient.tenant_id === tenantId);
  const branchByCodeKind = new Map(
    branches
      .filter((branch) => branch.code && branch.branch_kind)
      .map((branch) => [`${String(branch.code).toUpperCase()}:${branch.branch_kind}`, branch]),
  );
  const branchByNameKind = new Map(
    branches.map((branch) => [`${normalizeText(branch.name)}:${branch.branch_kind}`, branch]),
  );
  const centralSupply = branches.find((branch) => branch.branch_kind === "central_supply") ?? null;
  const centralKitchen =
    branches.find((branch) => branch.branch_kind === "central_kitchen") ?? null;
  const locationsByBranch = new Map();
  for (const loc of locations.filter((row) => row.is_active !== false)) {
    const list = locationsByBranch.get(loc.branch_id) ?? [];
    list.push(loc);
    locationsByBranch.set(loc.branch_id, list);
  }
  const stockLocationForBranch = (branchId) => {
    const list = locationsByBranch.get(branchId) ?? [];
    return (
      list.find((loc) => locationKey(loc.code, loc.location_kind) === "main_warehouse:warehouse") ??
      list.find((loc) => loc.is_default_issue && loc.location_kind === "warehouse") ??
      list.find((loc) => loc.location_kind === "warehouse") ??
      list.find((loc) => loc.location_kind === "production_storage") ??
      null
    );
  };
  const ingredientBySku = new Map(
    ingredients
      .filter((ingredient) => ingredient.sku)
      .map((ingredient) => [String(ingredient.sku).toUpperCase(), ingredient]),
  );
  const ingredientByName = new Map(ingredients.map((ingredient) => [normalizeText(ingredient.name), ingredient]));
  return {
    branchByCodeKind,
    branchByNameKind,
    centralKitchen,
    centralSupply,
    ingredientByName,
    ingredientBySku,
    stockLocationForBranch,
  };
}

function sourceBranchToTarget(sourceBranch, targetIndex, branchKind = "branch") {
  if (!sourceBranch) return null;
  return (
    targetIndex.branchByCodeKind.get(`${String(sourceBranch.code ?? "").toUpperCase()}:${branchKind}`) ??
    targetIndex.branchByNameKind.get(`${normalizeText(sourceBranch.name)}:${branchKind}`) ??
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
  const branch = sourceBranchToTarget(sourceBranch, targetIndex, "branch");
  const location =
    role === "branch_warehouse" && branch ? targetIndex.stockLocationForBranch(branch.id) : null;
  return { branch, location, role };
}

function movementKey(row) {
  return `${row.branch_id}:${row.location_id}:${row.ingredient_id}`;
}

function addNetMovement(net, row) {
  const key = movementKey(row);
  const existing = net.get(key) ?? { ...row, quantity_change: 0 };
  existing.quantity_change += row.quantity_change;
  net.set(key, existing);
}

function addDesiredStock(desired, row) {
  const key = movementKey(row);
  const existing = desired.get(key) ?? { ...row, quantity: 0 };
  existing.quantity += row.quantity;
  desired.set(key, existing);
}

function targetIngredientForMaterial(material, targetIndex) {
  return (
    targetIndex.ingredientBySku.get(String(material?.sku ?? "").toUpperCase()) ??
    targetIndex.ingredientByName.get(normalizeText(material?.name))
  );
}

function addMissingMaterialRow(missingRows, material, materialId, sourceWarehouseCode = null) {
  missingRows.push({
    materialId,
    materialSku: material?.sku ?? null,
    materialName: material?.name ?? null,
    sourceWarehouseCode,
  });
}

function sourceQuantityToBase(material, quantity, unit) {
  const value = numberValue(quantity);
  const sourceUnit = normalizeText(unit);
  if (!sourceUnit) return value;
  if (sourceUnit === normalizeText(material?.base_unit)) return value;
  if (sourceUnit === normalizeText(material?.purchase_unit)) {
    return value * numberValue(material?.purchase_to_base_factor ?? 1);
  }
  return value;
}

function aggregateItems(items, materialById, targetIndex, missingRows) {
  const byIngredient = new Map();
  for (const item of items) {
    const material = materialById.get(item.material_id);
    const ingredient = targetIngredientForMaterial(material, targetIndex);
    if (!material || !ingredient) {
      addMissingMaterialRow(missingRows, material, item.material_id);
      continue;
    }
    const key = ingredient.id;
    const existing =
      byIngredient.get(key) ??
      {
        ingredient_id: ingredient.id,
        material_id: material.id,
        name: ingredient.name,
        quantity: 0,
        unit: ingredient.unit ?? material.base_unit ?? material.purchase_unit ?? "unit",
        unit_cost: numberValue(material.cost_per_unit),
      };
    existing.quantity += numberValue(item.quantity);
    byIngredient.set(key, existing);
  }
  return [...byIngredient.values()].filter((row) => row.quantity > 0);
}

function transferLineSignature(items) {
  return items
    .map((item) => `${item.material_id}:${numberValue(item.quantity)}`)
    .sort()
    .join("|");
}

function findKitchenPassthroughs({ sourceWarehouseById, transferItemsByTransfer, transfers }) {
  const inboundByKitchen = new Map();
  const pairedInboundIds = new Set();
  const passthroughByOutboundId = new Map();
  const received = transfers
    .filter((transfer) => transfer.status === "received")
    .sort((a, b) => String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")));

  for (const transfer of received) {
    const toWarehouse = sourceWarehouseById.get(transfer.to_warehouse_id);
    if (sourceWarehouseRole(toWarehouse) !== "branch_kitchen_endpoint") continue;
    const signature = transferLineSignature(transferItemsByTransfer.get(transfer.id) ?? []);
    if (!signature) continue;
    const key = `${transfer.to_warehouse_id}:${signature}`;
    const list = inboundByKitchen.get(key) ?? [];
    list.push(transfer);
    inboundByKitchen.set(key, list);
  }

  for (const transfer of received) {
    const fromWarehouse = sourceWarehouseById.get(transfer.from_warehouse_id);
    if (sourceWarehouseRole(fromWarehouse) !== "branch_kitchen_endpoint") continue;
    const signature = transferLineSignature(transferItemsByTransfer.get(transfer.id) ?? []);
    if (!signature) continue;
    const key = `${transfer.from_warehouse_id}:${signature}`;
    const candidates = inboundByKitchen.get(key) ?? [];
    const inbound = candidates
      .filter((candidate) => !pairedInboundIds.has(candidate.id))
      .filter((candidate) => String(candidate.created_at ?? "") <= String(transfer.created_at ?? ""))
      .at(-1);
    if (!inbound) continue;
    pairedInboundIds.add(inbound.id);
    passthroughByOutboundId.set(transfer.id, { inbound });
  }

  return { pairedInboundIds, passthroughByOutboundId };
}

function classifyTransfer({ transfer, sourceWarehouseById, sourceBranchById, targetIndex }) {
  const from = sourceWarehouseById.get(transfer.from_warehouse_id);
  const to = sourceWarehouseById.get(transfer.to_warehouse_id);
  const fromTarget = sourceWarehouseTarget(from, sourceBranchById, targetIndex);
  const toTarget = sourceWarehouseTarget(to, sourceBranchById, targetIndex);
  const base = {
    fromCode: from?.code ?? null,
    fromRole: fromTarget.role,
    fromTarget,
    toCode: to?.code ?? null,
    toRole: toTarget.role,
    toTarget,
  };

  if (transfer.status !== "received") return { ...base, class: "ignored_not_received" };
  if (toTarget.role === "branch_kitchen_endpoint") return { ...base, class: "branch_sale_consumption" };
  if (fromTarget.role === "branch_kitchen_endpoint") {
    return { ...base, class: "ignored_legacy_branch_kitchen_source" };
  }
  if (fromTarget.location && toTarget.location) {
    if (fromTarget.location.id === toTarget.location.id || fromTarget.branch?.id === toTarget.branch?.id) {
      return { ...base, class: "ignored_same_target_site" };
    }
    if (!isAllowedTargetTransferDirection(fromTarget.branch?.branch_kind, toTarget.branch?.branch_kind)) {
      return { ...base, class: "manual_review_disallowed_direction" };
    }
    return { ...base, class: "real_transfer" };
  }
  return { ...base, class: "manual_review_missing_target" };
}

function transferCost(lines) {
  return lines.reduce((sum, row) => sum + costValue(row.quantity, row.unit_cost), 0);
}

function indexBy(rows, keyFn) {
  const out = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    const list = out.get(key) ?? [];
    list.push(row);
    out.set(key, list);
  }
  return out;
}

function buildPlan(source, target, options = {}) {
  const tenant = getTargetTenant(target);
  const actor = selectActor(target, tenant.id, options.actorId ?? "");
  const targetIndex = makeTargetIndex(target, tenant.id);
  const sourceBranchById = new Map(source.branches.map((branch) => [branch.id, branch]));
  const sourceWarehouseById = new Map(source.warehouses.map((warehouse) => [warehouse.id, warehouse]));
  const materialById = new Map(source.materials.map((material) => [material.id, material]));
  const goodsReceiptItemsByReceipt = indexBy(source.goodsReceiptItems ?? [], (item) => item.receipt_id);
  const recipesById = new Map((source.recipes ?? []).map((recipe) => [recipe.id, recipe]));
  const recipeItemsByRecipe = indexBy(source.recipeItems ?? [], (item) => item.recipe_id);
  const transferItemsByTransfer = new Map();
  for (const item of source.transferItems) {
    const list = transferItemsByTransfer.get(item.transfer_id) ?? [];
    list.push(item);
    transferItemsByTransfer.set(item.transfer_id, list);
  }
  const { pairedInboundIds, passthroughByOutboundId } = findKitchenPassthroughs({
    sourceWarehouseById,
    transferItemsByTransfer,
    transfers: source.transfers,
  });

  const missingRows = [];
  const manualReview = [];
  const ignored = [];
  const realTransfers = [];
  const transferItems = [];
  const movementRows = [];
  const movementNet = new Map();
  const goodsReceiptRows = [];
  const productionConsumptionRows = [];
  const productionOutputRows = [];
  const saleConsumptionRows = [];

  const addMovement = (row) => {
    movementRows.push(row);
    addNetMovement(movementNet, row);
  };

  for (const receipt of source.goodsReceipts ?? []) {
    if (receipt.status !== "posted") {
      ignored.push({
        class: "ignored_grn_not_posted",
        id: receipt.id,
        status: receipt.status,
        transferCode: receipt.code,
      });
      continue;
    }
    const warehouse = sourceWarehouseById.get(receipt.warehouse_id);
    const targetRef = sourceWarehouseTarget(warehouse, sourceBranchById, targetIndex);
    if (!targetRef.branch || !targetRef.location) {
      manualReview.push({
        class: "manual_review_missing_grn_target",
        fromCode: warehouse?.code ?? null,
        id: receipt.id,
        status: receipt.status,
        transferCode: receipt.code,
      });
      continue;
    }
    for (const item of goodsReceiptItemsByReceipt.get(receipt.id) ?? []) {
      const material = materialById.get(item.material_id);
      const ingredient = targetIngredientForMaterial(material, targetIndex);
      if (!material || !ingredient) {
        addMissingMaterialRow(missingRows, material, item.material_id, warehouse?.code ?? null);
        continue;
      }
      const quantity = numberValue(item.qty_base ?? item.quantity);
      if (quantity <= 0) continue;
      const row = {
        branch_id: targetRef.branch.id,
        created_at: receipt.posted_at ?? receipt.received_at ?? receipt.created_at,
        created_by: actor.id,
        ingredient_id: ingredient.id,
        location_id: targetRef.location.id,
        movement_subtype: null,
        quantity_change: quantity,
        reason: `matu-platform import:grn_receipt:${receipt.code}:${receipt.id}`,
        source_transfer_number: null,
        tenant_id: tenant.id,
        type: "grn_receipt",
        unit_cost: numberValue(item.unit_cost_base ?? item.unit_cost ?? material.cost_per_unit),
      };
      goodsReceiptRows.push(row);
      addMovement(row);
    }
  }

  for (const run of source.productionRuns ?? []) {
    if (run.status !== "completed") {
      ignored.push({
        class: "ignored_production_not_completed",
        id: run.id,
        status: run.status,
        transferCode: run.code,
      });
      continue;
    }
    const recipe = recipesById.get(run.recipe_id);
    const outputMaterial = materialById.get(recipe?.output_material_id);
    const outputIngredient = targetIngredientForMaterial(outputMaterial, targetIndex);
    const consumeWarehouse = sourceWarehouseById.get(run.consume_warehouse_id);
    const outputWarehouse = sourceWarehouseById.get(run.output_warehouse_id);
    const consumeTarget = sourceWarehouseTarget(consumeWarehouse, sourceBranchById, targetIndex);
    const outputTarget = sourceWarehouseTarget(outputWarehouse, sourceBranchById, targetIndex);
    const recipeItems = recipeItemsByRecipe.get(run.recipe_id) ?? [];
    if (!recipe || !outputMaterial || !outputIngredient) {
      addMissingMaterialRow(missingRows, outputMaterial, recipe?.output_material_id, outputWarehouse?.code ?? null);
      continue;
    }
    if (!consumeTarget.branch || !consumeTarget.location || !outputTarget.branch || !outputTarget.location) {
      manualReview.push({
        class: "manual_review_missing_production_target",
        fromCode: consumeWarehouse?.code ?? null,
        id: run.id,
        status: run.status,
        toCode: outputWarehouse?.code ?? null,
        transferCode: run.code,
      });
      continue;
    }

    const ratio = numberValue(run.actual_quantity) / (numberValue(recipe.output_quantity) || 1);
    let inputCost = 0;
    for (const item of recipeItems) {
      const material = materialById.get(item.material_id);
      const ingredient = targetIngredientForMaterial(material, targetIndex);
      if (!material || !ingredient) {
        addMissingMaterialRow(missingRows, material, item.material_id, consumeWarehouse?.code ?? null);
        continue;
      }
      const quantity = numberValue(item.quantity) * ratio;
      if (quantity <= 0) continue;
      const unitCost = numberValue(material.cost_per_unit);
      inputCost += quantity * unitCost;
      const row = {
        branch_id: consumeTarget.branch.id,
        created_at: run.completed_at ?? run.created_at,
        created_by: actor.id,
        ingredient_id: ingredient.id,
        location_id: consumeTarget.location.id,
        movement_subtype: null,
        quantity_change: -quantity,
        reason: `matu-platform import:production_consumption:${run.code}:${run.id}`,
        source_transfer_number: null,
        tenant_id: tenant.id,
        type: "production_consumption",
        unit_cost: unitCost,
      };
      productionConsumptionRows.push(row);
      addMovement(row);
    }

    const outputQuantity = sourceQuantityToBase(outputMaterial, run.actual_quantity, recipe.output_unit);
    if (outputQuantity <= 0) continue;
    const row = {
      branch_id: outputTarget.branch.id,
      created_at: run.completed_at ?? run.created_at,
      created_by: actor.id,
      ingredient_id: outputIngredient.id,
      location_id: outputTarget.location.id,
      movement_subtype: null,
      quantity_change: outputQuantity,
      reason: `matu-platform import:production_output:${run.code}:${run.id}`,
      source_transfer_number: null,
      tenant_id: tenant.id,
      type: "production_output",
      unit_cost: inputCost > 0 ? inputCost / outputQuantity : numberValue(outputMaterial.cost_per_unit),
    };
    productionOutputRows.push(row);
    addMovement(row);
  }

  for (const transfer of source.transfers) {
    const pairedInbound = pairedInboundIds.has(transfer.id);
    if (pairedInbound) {
      const from = sourceWarehouseById.get(transfer.from_warehouse_id);
      const to = sourceWarehouseById.get(transfer.to_warehouse_id);
      ignored.push({
        class: "ignored_kitchen_passthrough_inbound",
        cost: moneyValue(
          transferCost(
            aggregateItems(
              transferItemsByTransfer.get(transfer.id) ?? [],
              materialById,
              targetIndex,
              missingRows,
            ),
          ),
        ),
        fromCode: from?.code ?? null,
        id: transfer.id,
        lineCount: (transferItemsByTransfer.get(transfer.id) ?? []).length,
        status: transfer.status,
        toCode: to?.code ?? null,
        transferCode: transfer.code,
      });
      continue;
    }

    const passthrough = passthroughByOutboundId.get(transfer.id);
    const classified = passthrough
      ? classifyTransfer({
          sourceBranchById,
          sourceWarehouseById,
          targetIndex,
          transfer: {
            ...transfer,
            from_warehouse_id: passthrough.inbound.from_warehouse_id,
          },
        })
      : classifyTransfer({
          sourceBranchById,
          sourceWarehouseById,
          targetIndex,
          transfer,
        });
    if (passthrough) {
      classified.class =
        classified.class === "real_transfer" ? "kitchen_passthrough_transfer" : classified.class;
      classified.inboundTransfer = passthrough.inbound;
    }
    const lines = aggregateItems(
      transferItemsByTransfer.get(transfer.id) ?? [],
      materialById,
      targetIndex,
      missingRows,
    );
    const cost = transferCost(lines);
    const sample = {
      class: classified.class,
      cost: moneyValue(cost),
      fromCode: classified.fromCode,
      id: transfer.id,
      lineCount: lines.length,
      status: transfer.status,
      toCode: classified.toCode,
      transferCode: transfer.code,
    };

    if (classified.class === "ignored_not_received") {
      ignored.push(sample);
      continue;
    }
    if (classified.class.startsWith("ignored_")) {
      ignored.push(sample);
      continue;
    }
    if (
      classified.class !== "real_transfer" &&
      classified.class !== "kitchen_passthrough_transfer" &&
      classified.class !== "branch_sale_consumption"
    ) {
      manualReview.push(sample);
      continue;
    }

    if (classified.class === "real_transfer" || classified.class === "kitchen_passthrough_transfer") {
      const sourceTransfer = classified.inboundTransfer ?? transfer;
      const transferClass =
        classified.class === "kitchen_passthrough_transfer" ? "kitchen_passthrough" : "real_transfer";
      const transferRow = {
        created_at: sourceTransfer.created_at,
        created_by: actor.id,
        from_branch_id: classified.fromTarget.branch.id,
        from_location_id: classified.fromTarget.location.id,
        notes:
          classified.class === "kitchen_passthrough_transfer"
            ? `matu-platform import:${transferClass}:${sourceTransfer.id}->${transfer.id}`
            : `matu-platform import:${transferClass}:${transfer.id}`,
        received_at: transfer.received_at ?? transfer.sent_at ?? transfer.created_at,
        shipped_at: sourceTransfer.sent_at ?? sourceTransfer.created_at,
        status: "received",
        tenant_id: tenant.id,
        to_branch_id: classified.toTarget.branch.id,
        to_location_id: classified.toTarget.location.id,
        transfer_number: transfer.code,
        updated_at: transfer.received_at ?? transfer.sent_at ?? transfer.created_at,
        vehicle_info: null,
      };
      realTransfers.push({ ...transferRow, cost: moneyValue(cost), lineCount: lines.length });
      for (const line of lines) {
        transferItems.push({
          ingredient_id: line.ingredient_id,
          quantity: line.quantity,
          quantity_received: line.quantity,
          receive_note: null,
          tenant_id: tenant.id,
          transfer_number: transfer.code,
          unit: line.unit,
          unit_cost_at_ship: line.unit_cost,
        });
        addMovement({
          branch_id: classified.fromTarget.branch.id,
          created_at: sourceTransfer.sent_at ?? sourceTransfer.created_at,
          created_by: actor.id,
          ingredient_id: line.ingredient_id,
          location_id: classified.fromTarget.location.id,
          movement_subtype: null,
          quantity_change: -line.quantity,
          reason: `matu-platform import:${transferClass}:${transfer.code}:transfer_out`,
          source_transfer_number: transfer.code,
          tenant_id: tenant.id,
          type: "transfer_out",
          unit_cost: line.unit_cost,
        });
        addMovement({
          branch_id: classified.toTarget.branch.id,
          created_at: transfer.received_at ?? transfer.sent_at ?? transfer.created_at,
          created_by: actor.id,
          ingredient_id: line.ingredient_id,
          location_id: classified.toTarget.location.id,
          movement_subtype: null,
          quantity_change: line.quantity,
          reason: `matu-platform import:${transferClass}:${transfer.code}:transfer_in`,
          source_transfer_number: transfer.code,
          tenant_id: tenant.id,
          type: "transfer_in",
          unit_cost: line.unit_cost,
        });
      }
      continue;
    }

    const branch = classified.toTarget.branch;
    const location = branch ? targetIndex.stockLocationForBranch(branch.id) : null;
    if (!branch || !location) {
      manualReview.push({ ...sample, class: "manual_review_missing_consumption_location" });
      continue;
    }
    for (const line of lines) {
      const row = {
        branch_id: branch.id,
        created_at: transfer.received_at ?? transfer.sent_at ?? transfer.created_at,
        created_by: actor.id,
        ingredient_id: line.ingredient_id,
        location_id: location.id,
        movement_subtype: "sale_consumption",
        quantity_change: -line.quantity,
        reason: `matu-platform import:sale_consumption:${transfer.code}:${transfer.id}`,
        source_transfer_number: null,
        tenant_id: tenant.id,
        type: "consumption",
        unit_cost: line.unit_cost,
      };
      saleConsumptionRows.push({ ...row, sourceBranchCode: branch.code });
      addMovement(row);
    }
  }

  const desiredStock = new Map();
  const phantomKitchenStock = [];
  for (const stock of source.stockItems) {
    const quantity = numberValue(stock.quantity);
    if (quantity === 0) continue;
    const warehouse = sourceWarehouseById.get(stock.warehouse_id);
    const targetRef = sourceWarehouseTarget(warehouse, sourceBranchById, targetIndex);
    const material = materialById.get(stock.material_id);
    const ingredient = targetIngredientForMaterial(material, targetIndex);
    const value = costValue(quantity, material?.cost_per_unit);

    if (targetRef.role === "branch_kitchen_endpoint") {
      phantomKitchenStock.push({
        materialSku: material?.sku ?? null,
        quantity,
        sourceWarehouseCode: warehouse?.code ?? null,
        value,
      });
      continue;
    }
    if (!targetRef.branch || !targetRef.location || !ingredient) {
      addMissingMaterialRow(missingRows, material, stock.material_id, warehouse?.code ?? null);
      continue;
    }
    addDesiredStock(desiredStock, {
      branch_id: targetRef.branch.id,
      ingredient_id: ingredient.id,
      location_id: targetRef.location.id,
      quantity,
      sourceWarehouseCode: warehouse?.code ?? null,
      unit_cost: numberValue(material?.cost_per_unit ?? ingredient.unit_cost),
    });
  }

  const balanceAt = options.balanceAt ?? new Date().toISOString();
  const balanceAdjustments = [];
  const balanceKeys = new Set([...desiredStock.keys(), ...movementNet.keys()]);
  for (const key of balanceKeys) {
    const desired = desiredStock.get(key);
    const net = movementNet.get(key);
    const basis = desired ?? net;
    const delta = numberValue(desired?.quantity) - numberValue(net?.quantity_change);
    if (Math.abs(delta) < 0.000001) continue;
    balanceAdjustments.push({
      branch_id: basis.branch_id,
      created_at: balanceAt,
      created_by: actor.id,
      ingredient_id: basis.ingredient_id,
      location_id: basis.location_id,
      movement_subtype: null,
      quantity_change: delta,
      reason: "matu-platform import:balance_adjustment",
      source_transfer_number: null,
      tenant_id: tenant.id,
      type: "count_adjustment",
      unit_cost: numberValue(basis.unit_cost),
    });
  }
  movementRows.push(...balanceAdjustments);

  const duplicateTransferNumbers = Object.entries(countBy(realTransfers, (row) => row.transfer_number))
    .filter(([, count]) => count > 1)
    .map(([transferNumber]) => transferNumber);
  const existingTransferNumbers = new Set(target.transfers.map((row) => row.transfer_number));
  const targetDuplicates = realTransfers
    .filter((row) => existingTransferNumbers.has(row.transfer_number))
    .map((row) => row.transfer_number);

  const blockers = [];
  if (!targetIndex.centralSupply) blockers.push("missing target central_supply");
  if (!targetIndex.centralKitchen) blockers.push("missing target central_kitchen");
  if (target.ingredients.length === 0) blockers.push("target ingredients empty");
  if (target.transfers.length > 0 || target.movements.length > 0 || (target.levels ?? []).length > 0) {
    blockers.push("target operational inventory is not empty");
  }
  if (missingRows.length > 0) blockers.push("missing target mapping rows");
  if (duplicateTransferNumbers.length > 0) blockers.push("duplicate source transfer numbers");
  if (targetDuplicates.length > 0) blockers.push("target transfer number already exists");
  if (manualReview.length > 0 && !options.allowManualReviewSkip) {
    blockers.push("manual review rows require owner decision");
  }

  const sqlRows = { movements: movementRows, transferItems, transfers: realTransfers };
  const report = {
    generatedAt: new Date().toISOString(),
    mode: "dry-run",
    actor: { id: actor.id, fullName: actor.full_name ?? null },
    blockers,
    ignored: {
      count: ignored.length,
      byClass: countBy(ignored, (row) => row.class),
      samples: ignored.slice(0, 10),
    },
    manualReview: {
      count: manualReview.length,
      samples: manualReview.slice(0, 20),
    },
    missingRows: {
      count: missingRows.length,
      samples: missingRows.slice(0, 20),
    },
    operationalPlan: {
      balanceAdjustments: {
        count: balanceAdjustments.length,
        estimatedAbsValue: moneyValue(
          balanceAdjustments.reduce(
            (sum, row) => sum + costValue(Math.abs(row.quantity_change), row.unit_cost),
            0,
          ),
        ),
      },
      phantomKitchenStock: {
        count: phantomKitchenStock.length,
        estimatedValue: moneyValue(phantomKitchenStock.reduce((sum, row) => sum + row.value, 0)),
        byWarehouse: sumBy(phantomKitchenStock, (row) => row.sourceWarehouseCode, (row) => row.value),
      },
      realTransfers: {
        count: realTransfers.length,
        estimatedCost: moneyValue(realTransfers.reduce((sum, row) => sum + row.cost, 0)),
        itemRows: transferItems.length,
      },
      goodsReceipts: {
        movementRows: goodsReceiptRows.length,
        estimatedCost: moneyValue(
          goodsReceiptRows.reduce(
            (sum, row) => sum + costValue(row.quantity_change, row.unit_cost),
            0,
          ),
        ),
      },
      production: {
        consumptionRows: productionConsumptionRows.length,
        outputRows: productionOutputRows.length,
        estimatedConsumptionCost: moneyValue(
          productionConsumptionRows.reduce(
            (sum, row) => sum + costValue(Math.abs(row.quantity_change), row.unit_cost),
            0,
          ),
        ),
        estimatedOutputCost: moneyValue(
          productionOutputRows.reduce(
            (sum, row) => sum + costValue(row.quantity_change, row.unit_cost),
            0,
          ),
        ),
      },
      saleConsumption: {
        movementRows: saleConsumptionRows.length,
        estimatedCost: moneyValue(
          saleConsumptionRows.reduce(
            (sum, row) => sum + costValue(Math.abs(row.quantity_change), row.unit_cost),
            0,
          ),
        ),
        byBranch: sumBy(
          saleConsumptionRows,
          (row) => row.sourceBranchCode ?? "unmapped",
          (row) => costValue(Math.abs(row.quantity_change), row.unit_cost),
        ),
      },
      stockMovementRows: movementRows.length,
    },
    sql: {
      canWrite: blockers.length === 0,
      requiresAllowManualReviewSkip: manualReview.length > 0,
      transferRows: realTransfers.length,
      transferItemRows: transferItems.length,
      movementRows: movementRows.length,
    },
    reset: buildResetPlan(target),
    target: {
      branches: target.branches.length,
      ingredients: target.ingredients.length,
      locations: target.locations.length,
      stockIssues: (target.issues ?? []).length,
      stockLevels: (target.levels ?? []).length,
      stockMovements: target.movements.length,
      stocktakes: (target.stocktakes ?? []).length,
      stockTransferItems: (target.transferItems ?? []).length,
      stockTransfers: target.transfers.length,
    },
  };
  if (options.includeRows) report.plannedRows = sqlRows;
  return { report, sqlRows };
}

function isImportReason(row) {
  return String(row?.reason ?? "").startsWith("matu-platform import:");
}

function isImportTransfer(row) {
  return String(row?.notes ?? "").startsWith("matu-platform import:");
}

function buildResetPlan(target) {
  const movements = target.movements ?? [];
  const transfers = target.transfers ?? [];
  const transferItems = target.transferItems ?? [];
  const levels = target.levels ?? [];
  const issues = target.issues ?? [];
  const stocktakes = target.stocktakes ?? [];
  const transferById = new Map(transfers.map((row) => [row.id, row]));
  const nonImportMovements = movements.filter((row) => !isImportReason(row));
  const nonImportTransfers = transfers.filter((row) => !isImportTransfer(row));
  const orphanTransferItems = transferItems.filter((row) => !transferById.has(row.transfer_id));
  const nonImportTransferItems = transferItems.filter((row) => {
    const transfer = transferById.get(row.transfer_id);
    return transfer && !isImportTransfer(transfer);
  });
  const blockers = [];

  if (nonImportMovements.length > 0) blockers.push("target has non-import stock movements");
  if (nonImportTransfers.length > 0) blockers.push("target has non-import stock transfers");
  if (orphanTransferItems.length > 0) blockers.push("target has orphan stock transfer items");
  if (nonImportTransferItems.length > 0) blockers.push("target has non-import stock transfer items");
  if (issues.length > 0) blockers.push("target has stock issues");
  if (stocktakes.length > 0) blockers.push("target has stocktakes");
  if (levels.length > 0 && movements.length === 0 && transfers.length === 0) {
    blockers.push("target has stock levels without import ledger");
  }

  return {
    blockers,
    canWrite: blockers.length === 0,
    counts: {
      importStockMovements: movements.length - nonImportMovements.length,
      importStockTransfers: transfers.length - nonImportTransfers.length,
      orphanTransferItems: orphanTransferItems.length,
      stockIssues: issues.length,
      stockLevels: levels.length,
      stockMovements: movements.length,
      stockTransferItems: transferItems.length,
      stockTransfers: transfers.length,
      stocktakes: stocktakes.length,
      nonImportStockMovements: nonImportMovements.length,
      nonImportStockTransferItems: nonImportTransferItems.length,
      nonImportStockTransfers: nonImportTransfers.length,
    },
  };
}

function jsonSql(tag, rows) {
  return `$${tag}$${JSON.stringify(rows)}$${tag}$::jsonb`;
}

function generateResetSql() {
  return `BEGIN;

SET LOCAL statement_timeout = '30s';

DO $guard$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.stock_movements
    WHERE reason IS NULL
       OR reason NOT LIKE 'matu-platform import:%'
  ) THEN
    RAISE EXCEPTION 'target_has_non_import_stock_movements';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.stock_transfers
    WHERE notes IS NULL
       OR notes NOT LIKE 'matu-platform import:%'
  ) THEN
    RAISE EXCEPTION 'target_has_non_import_stock_transfers';
  END IF;

  IF EXISTS (SELECT 1 FROM public.stock_issues) THEN
    RAISE EXCEPTION 'target_has_stock_issues';
  END IF;

  IF EXISTS (SELECT 1 FROM public.stocktake_sessions) THEN
    RAISE EXCEPTION 'target_has_stocktakes';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.stock_transfer_items sti
    LEFT JOIN public.stock_transfers st ON st.id = sti.transfer_id
    WHERE st.id IS NULL
       OR st.notes NOT LIKE 'matu-platform import:%'
  ) THEN
    RAISE EXCEPTION 'target_has_non_import_stock_transfer_items';
  END IF;

  IF EXISTS (SELECT 1 FROM public.stock_levels)
     AND NOT EXISTS (
       SELECT 1
       FROM public.stock_movements
       WHERE reason LIKE 'matu-platform import:%'
     )
     AND NOT EXISTS (
       SELECT 1
       FROM public.stock_transfers
       WHERE notes LIKE 'matu-platform import:%'
     ) THEN
    RAISE EXCEPTION 'target_has_stock_levels_without_import_ledger';
  END IF;
END
$guard$;

ALTER TABLE public.stock_movements DISABLE TRIGGER trg_stock_movement_update_levels;

DELETE FROM public.stock_levels;

DELETE FROM public.stock_movements
WHERE reason LIKE 'matu-platform import:%';

DELETE FROM public.stock_transfer_items sti
USING public.stock_transfers st
WHERE st.id = sti.transfer_id
  AND st.notes LIKE 'matu-platform import:%';

DELETE FROM public.stock_transfers
WHERE notes LIKE 'matu-platform import:%';

ALTER TABLE public.stock_movements ENABLE TRIGGER trg_stock_movement_update_levels;

COMMIT;
`;
}

function generateSql(rows) {
  return `BEGIN;

DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM public.stock_movements)
    OR EXISTS (SELECT 1 FROM public.stock_transfers)
    OR EXISTS (SELECT 1 FROM public.stock_levels)
  THEN
    RAISE EXCEPTION 'target_operational_inventory_not_empty';
  END IF;
END
$guard$;

CREATE TEMP TABLE tmp_matu_platform_transfers ON COMMIT DROP AS
SELECT *
FROM jsonb_to_recordset(${jsonSql("matu_transfers", rows.transfers)}) AS x(
  transfer_number text,
  tenant_id bigint,
  from_branch_id bigint,
  to_branch_id bigint,
  status text,
  notes text,
  vehicle_info text,
  created_by uuid,
  shipped_at timestamptz,
  received_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  from_location_id bigint,
  to_location_id bigint
);

CREATE TEMP TABLE tmp_matu_platform_transfer_items ON COMMIT DROP AS
SELECT *
FROM jsonb_to_recordset(${jsonSql("matu_transfer_items", rows.transferItems)}) AS x(
  transfer_number text,
  tenant_id bigint,
  ingredient_id bigint,
  quantity numeric,
  unit text,
  unit_cost_at_ship numeric,
  quantity_received numeric,
  receive_note text
);

CREATE TEMP TABLE tmp_matu_platform_movements ON COMMIT DROP AS
SELECT *
FROM jsonb_to_recordset(${jsonSql("matu_movements", rows.movements)}) AS x(
  tenant_id bigint,
  branch_id bigint,
  ingredient_id bigint,
  type text,
  quantity_change numeric,
  reason text,
  created_by uuid,
  created_at timestamptz,
  unit_cost numeric,
  location_id bigint,
  movement_subtype text,
  source_transfer_number text
);

INSERT INTO public.stock_transfers (
  tenant_id,
  from_branch_id,
  to_branch_id,
  transfer_number,
  status,
  notes,
  vehicle_info,
  created_by,
  shipped_at,
  received_at,
  created_at,
  updated_at,
  from_location_id,
  to_location_id
)
SELECT
  tenant_id,
  from_branch_id,
  to_branch_id,
  transfer_number,
  status,
  notes,
  vehicle_info,
  created_by,
  shipped_at,
  received_at,
  created_at,
  updated_at,
  from_location_id,
  to_location_id
FROM tmp_matu_platform_transfers
ORDER BY created_at, transfer_number;

INSERT INTO public.stock_transfer_items (
  tenant_id,
  transfer_id,
  ingredient_id,
  quantity,
  unit,
  unit_cost_at_ship,
  quantity_received,
  receive_note
)
SELECT
  ti.tenant_id,
  st.id,
  ti.ingredient_id,
  ti.quantity,
  ti.unit,
  ti.unit_cost_at_ship,
  ti.quantity_received,
  ti.receive_note
FROM tmp_matu_platform_transfer_items ti
JOIN public.stock_transfers st
  ON st.tenant_id = ti.tenant_id
 AND st.transfer_number = ti.transfer_number
ORDER BY ti.transfer_number, ti.ingredient_id;

ALTER TABLE public.stock_movements DISABLE TRIGGER trg_stock_movement_update_levels;

INSERT INTO public.stock_movements (
  tenant_id,
  branch_id,
  ingredient_id,
  type,
  quantity_change,
  reason,
  created_by,
  created_at,
  transfer_id,
  unit_cost,
  location_id,
  movement_subtype
)
SELECT
  m.tenant_id,
  m.branch_id,
  m.ingredient_id,
  m.type,
  m.quantity_change,
  m.reason,
  m.created_by,
  m.created_at,
  st.id,
  m.unit_cost,
  m.location_id,
  m.movement_subtype
FROM tmp_matu_platform_movements m
LEFT JOIN public.stock_transfers st
  ON st.tenant_id = m.tenant_id
 AND st.transfer_number = m.source_transfer_number
ORDER BY m.created_at, m.reason, m.ingredient_id;

DO $stock_levels_nonnegative$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.stock_movements
    GROUP BY tenant_id, branch_id, ingredient_id, location_id
    HAVING round(sum(quantity_change), 3) < 0
  ) THEN
    RAISE EXCEPTION 'import_rebuilt_stock_levels_negative';
  END IF;
END
$stock_levels_nonnegative$;

INSERT INTO public.stock_levels (
  tenant_id,
  branch_id,
  ingredient_id,
  location_id,
  current_quantity,
  avg_unit_cost,
  last_counted_at
)
SELECT
  tenant_id,
  branch_id,
  ingredient_id,
  location_id,
  round(sum(quantity_change), 3) AS current_quantity,
  round(
    (array_agg(unit_cost ORDER BY CASE WHEN type = 'count_adjustment' THEN 0 ELSE 1 END, created_at DESC))[1],
    2
  ) AS avg_unit_cost,
  max(created_at) FILTER (WHERE type = 'count_adjustment') AS last_counted_at
FROM public.stock_movements
GROUP BY tenant_id, branch_id, ingredient_id, location_id
HAVING round(sum(quantity_change), 3) > 0;

ALTER TABLE public.stock_movements ENABLE TRIGGER trg_stock_movement_update_levels;

COMMIT;
`;
}

function printHuman(report) {
  console.log("Matu-platform Inventory operational import dry-run");
  console.log(`Actor: ${report.actor.fullName ?? report.actor.id}`);
  console.log(`Blockers: ${report.blockers.length ? report.blockers.join("; ") : "none"}`);
  console.log(`Reset blockers: ${report.reset.blockers.length ? report.reset.blockers.join("; ") : "none"}`);
  console.log("Operational plan:");
  console.table({
    realTransfers: report.operationalPlan.realTransfers.count,
    transferItems: report.operationalPlan.realTransfers.itemRows,
    saleConsumptionMovements: report.operationalPlan.saleConsumption.movementRows,
    balanceAdjustments: report.operationalPlan.balanceAdjustments.count,
    totalStockMovements: report.operationalPlan.stockMovementRows,
  });
  console.log("Sale consumption cost by branch:");
  console.table(report.operationalPlan.saleConsumption.byBranch);
  console.log("Phantom Bep CN stock excluded:");
  console.table(report.operationalPlan.phantomKitchenStock.byWarehouse);
  if (report.manualReview.count > 0) {
    console.log("Manual-review rows:");
    console.table(report.manualReview.samples);
  }
}

function selfTest() {
  assert.equal(
    sumBy([{ v: 0.015 }, { v: 0.015 }], () => "same", (row) => row.v).same,
    0.03,
  );

  const actorId = "a0000001-0000-4000-8000-000000000001";
  const source = {
    branches: [{ id: "b-dd", code: "DD", name: "Dat Do" }],
    warehouses: [
      { id: "kho-tong", branch_id: null, code: "KHO-TONG", name: "Kho Tong", kind: "warehouse" },
      { id: "kho-tt", branch_id: null, code: "KHO-TT", name: "Kho Trung Tam", kind: "warehouse", is_production_default: true },
      { id: "kho-dd", branch_id: "b-dd", code: "KHO-DD", name: "Kho DD", kind: "warehouse" },
      { id: "bep-dd", branch_id: "b-dd", code: "BEP-DD", name: "Bep DD", kind: "kitchen" },
    ],
    materials: [
      { id: "m1", sku: "G001", name: "Rice", cost_per_unit: 10, base_unit: "kg" },
      { id: "m2", sku: "T001", name: "Pork", cost_per_unit: 20.119, base_unit: "kg" },
    ],
    stockItems: [
      { warehouse_id: "kho-tong", material_id: "m1", quantity: 6 },
      { warehouse_id: "kho-dd", material_id: "m1", quantity: 5 },
      { warehouse_id: "bep-dd", material_id: "m2", quantity: 3 },
    ],
    goodsReceipts: [
      {
        id: "g1",
        code: "GRN-1",
        warehouse_id: "kho-tong",
        status: "posted",
        received_at: "2026-04-30T00:00:00Z",
        posted_at: "2026-04-30T01:00:00Z",
        created_at: "2026-04-30T00:00:00Z",
      },
      {
        id: "g2",
        code: "GRN-2",
        warehouse_id: "kho-tong",
        status: "cancelled",
        received_at: "2026-04-30T00:00:00Z",
        posted_at: null,
        created_at: "2026-04-30T00:00:00Z",
      },
    ],
    goodsReceiptItems: [
      { receipt_id: "g1", material_id: "m1", quantity: 2, qty_base: 2, unit_cost: 9, unit_cost_base: 9 },
      { receipt_id: "g2", material_id: "m1", quantity: 2, qty_base: 2, unit_cost: 9, unit_cost_base: 9 },
    ],
    productionRuns: [
      {
        id: "p1",
        code: "PRD-1",
        recipe_id: "r1",
        actual_quantity: 1,
        consume_warehouse_id: "kho-tong",
        output_warehouse_id: "kho-tt",
        status: "completed",
        completed_at: "2026-04-30T02:00:00Z",
        created_at: "2026-04-30T01:30:00Z",
      },
    ],
    recipes: [
      {
        id: "r1",
        name: "Pork prep",
        output_material_id: "m2",
        output_quantity: 1,
        output_unit: "kg",
      },
    ],
    recipeItems: [{ recipe_id: "r1", material_id: "m1", quantity: 2 }],
    transfers: [
      {
        id: "t1",
        code: "TR-1",
        from_warehouse_id: "kho-tong",
        to_warehouse_id: "kho-dd",
        status: "received",
        created_at: "2026-05-01T00:00:00Z",
        sent_at: "2026-05-01T01:00:00Z",
        received_at: "2026-05-01T02:00:00Z",
      },
      {
        id: "t2",
        code: "TR-2",
        from_warehouse_id: "kho-dd",
        to_warehouse_id: "bep-dd",
        status: "received",
        created_at: "2026-05-02T00:00:00Z",
        sent_at: "2026-05-02T01:00:00Z",
        received_at: "2026-05-02T02:00:00Z",
      },
      {
        id: "t3",
        code: "TR-3",
        from_warehouse_id: "bep-dd",
        to_warehouse_id: "kho-dd",
        status: "received",
        created_at: "2026-05-03T00:00:00Z",
      },
      {
        id: "t4",
        code: "TR-4",
        from_warehouse_id: "kho-tong",
        to_warehouse_id: "kho-tt",
        status: "received",
        created_at: "2026-05-04T00:00:00Z",
      },
      {
        id: "t5",
        code: "TR-5",
        from_warehouse_id: "kho-dd",
        to_warehouse_id: "kho-tong",
        status: "received",
        created_at: "2026-05-05T00:00:00Z",
      },
      {
        id: "t6",
        code: "TR-6",
        from_warehouse_id: "kho-tong",
        to_warehouse_id: "bep-dd",
        status: "received",
        created_at: "2026-05-06T00:00:00Z",
        sent_at: "2026-05-06T01:00:00Z",
        received_at: "2026-05-06T02:00:00Z",
      },
      {
        id: "t7",
        code: "TR-7",
        from_warehouse_id: "bep-dd",
        to_warehouse_id: "kho-tt",
        status: "received",
        created_at: "2026-05-06T03:00:00Z",
        sent_at: "2026-05-06T04:00:00Z",
        received_at: "2026-05-06T05:00:00Z",
      },
    ],
    transferItems: [
      { transfer_id: "t1", material_id: "m1", quantity: 4 },
      { transfer_id: "t2", material_id: "m2", quantity: 2 },
      { transfer_id: "t3", material_id: "m1", quantity: 1 },
      { transfer_id: "t4", material_id: "m1", quantity: 1 },
      { transfer_id: "t5", material_id: "m1", quantity: 1 },
      { transfer_id: "t6", material_id: "m2", quantity: 3 },
      { transfer_id: "t7", material_id: "m2", quantity: 3 },
    ],
  };
  const target = {
    tenants: [{ id: 1, slug: "comtammatu", name: "Cơm Tấm Má Tư" }],
    branches: [
      { id: 2, tenant_id: 1, code: "DD", name: "Dat Do", branch_kind: "branch" },
      { id: 15, tenant_id: 1, code: "KT", name: "Kho Tong", branch_kind: "central_supply" },
      { id: 16, tenant_id: 1, code: "BTT", name: "Bep Trung Tam", branch_kind: "central_kitchen" },
    ],
    locations: [
      {
        id: 5,
        tenant_id: 1,
        branch_id: 2,
        code: "main_warehouse",
        location_kind: "warehouse",
        is_default_issue: true,
        is_active: true,
      },
      {
        id: 9,
        tenant_id: 1,
        branch_id: 15,
        code: "main_warehouse",
        location_kind: "warehouse",
        is_default_issue: true,
        is_active: true,
      },
      {
        id: 10,
        tenant_id: 1,
        branch_id: 16,
        code: "main_warehouse",
        location_kind: "warehouse",
        is_default_issue: true,
        is_active: true,
      },
    ],
    ingredients: [
      { id: 100, tenant_id: 1, sku: "G001", name: "Rice", unit: "kg", unit_cost: 10 },
      { id: 200, tenant_id: 1, sku: "T001", name: "Pork", unit: "kg", unit_cost: 20.119 },
    ],
    movements: [],
    profiles: [{ id: actorId, tenant_id: 1, branch_id: null, full_name: "Owner", is_active: true }],
    transferItems: [],
    transfers: [],
    levels: [],
    issues: [],
    stocktakes: [],
  };
  const blocked = buildPlan(source, target, {
    actorId,
    balanceAt: "2026-06-01T00:00:00Z",
  }).report;
  assert.equal(blocked.operationalPlan.realTransfers.count, 4);
  assert.equal(blocked.operationalPlan.saleConsumption.movementRows, 1);
  assert.equal(blocked.manualReview.count, 0);
  assert.equal(blocked.ignored.byClass.ignored_legacy_branch_kitchen_source, 1);
  assert.equal(blocked.ignored.byClass.ignored_kitchen_passthrough_inbound, 1);
  assert.ok(!blocked.blockers.includes("manual review rows require owner decision"));

  const { report, sqlRows } = buildPlan(source, target, {
    actorId,
    allowManualReviewSkip: true,
    balanceAt: "2026-06-01T00:00:00Z",
    includeRows: true,
  });
  assert.equal(report.blockers.length, 0);
  assert.equal(report.plannedRows.movements.length, report.operationalPlan.stockMovementRows);
  assert.equal(report.plannedRows.transfers.length, report.operationalPlan.realTransfers.count);
  assert.equal(report.plannedRows.transferItems.length, report.operationalPlan.realTransfers.itemRows);
  assert.equal(report.operationalPlan.goodsReceipts.movementRows, 1);
  assert.equal(report.operationalPlan.production.consumptionRows, 1);
  assert.equal(report.operationalPlan.production.outputRows, 1);
  assert.equal(report.ignored.byClass.ignored_grn_not_posted, 1);
  assert.equal(report.operationalPlan.realTransfers.estimatedCost, 120.36);
  assert.equal(report.operationalPlan.saleConsumption.estimatedCost, 40.24);
  assert.equal(report.operationalPlan.saleConsumption.byBranch.DD, 40.24);
  const sql = generateSql(sqlRows);
  assert.match(sql, /BEGIN;/);
  assert.match(sql, /grn_receipt/);
  assert.match(sql, /kitchen_passthrough/);
  assert.match(sql, /production_consumption/);
  assert.match(sql, /production_output/);
  assert.match(sql, /sale_consumption/);
  assert.match(sql, /balance_adjustment/);

  const resetTarget = {
    ...target,
    movements: [{ id: 1, type: "count_adjustment", reason: "matu-platform import:balance_adjustment" }],
    transferItems: [{ id: 1, transfer_id: 1 }],
    transfers: [
      { id: 1, transfer_number: "TR-OLD", notes: "matu-platform import:real_transfer:old" },
    ],
    levels: [{ id: 1 }],
  };
  const resetPlan = buildResetPlan(resetTarget);
  assert.equal(resetPlan.canWrite, true);
  assert.equal(resetPlan.counts.importStockMovements, 1);
  assert.equal(resetPlan.counts.importStockTransfers, 1);
  const resetSql = generateResetSql();
  assert.match(resetSql, /target_has_non_import_stock_movements/);
  assert.match(resetSql, /DELETE FROM public.stock_levels/);
  assert.match(resetSql, /DELETE FROM public.stock_transfer_items/);

  const dirtyResetPlan = buildResetPlan({
    ...target,
    movements: [{ id: 2, type: "consumption", reason: null }],
  });
  assert.equal(dirtyResetPlan.canWrite, false);
  assert.deepEqual(dirtyResetPlan.blockers, ["target has non-import stock movements"]);
  console.log("self-test ok");
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  printHelp();
} else if (args.selfTest) {
  selfTest();
} else {
  if (!args.sourceUrl || !args.sourceKey || !args.targetUrl || !args.targetKey) {
    throw new Error("Missing source/target Supabase env");
  }
  if (args.writeSql && args.writeResetSql) {
    throw new Error("Choose either --write-sql or --write-reset-sql");
  }
  assertProjectUrl(args.sourceUrl, SOURCE_REF, "Source");
  assertProjectUrl(args.targetUrl, TARGET_REF, "Target");

  const [source, target] = await Promise.all([
    loadSource({ baseUrl: args.sourceUrl, key: args.sourceKey }),
    loadTarget({ baseUrl: args.targetUrl, key: args.targetKey }),
  ]);
  const { report, sqlRows } = buildPlan(source, target, args);
  if (args.writeResetSql) {
    if (report.reset.blockers.length > 0) {
      throw new Error(`Cannot write reset SQL while blockers remain: ${report.reset.blockers.join("; ")}`);
    }
    writeFileSync(args.writeResetSql, generateResetSql());
    report.reset.writtenTo = args.writeResetSql;
  }
  if (args.writeSql) {
    if (report.blockers.length > 0) {
      throw new Error(`Cannot write SQL while blockers remain: ${report.blockers.join("; ")}`);
    }
    writeFileSync(args.writeSql, generateSql(sqlRows));
    report.sql.writtenTo = args.writeSql;
  }

  if (args.json) console.log(JSON.stringify(report, null, 2));
  else printHuman(report);
}
