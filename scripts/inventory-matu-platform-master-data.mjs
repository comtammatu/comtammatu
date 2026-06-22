#!/usr/bin/env node
import assert from "node:assert/strict";

const SOURCE_REF = "dyksphedgzqsqjqgxzog";
const TARGET_REF = "iexwsuaqqenyjiskawoj";
const PAGE_SIZE = 1000;

function numberValue(value, fallback = 0) {
  const n = Number(value ?? fallback);
  return Number.isFinite(n) ? n : fallback;
}

function parseArgs(argv) {
  const out = {
    apply: false,
    help: false,
    json: false,
    selfTest: false,
    sourceKey: process.env.MATU_PLATFORM_SUPABASE_SERVICE_ROLE_KEY ?? "",
    sourceUrl: process.env.MATU_PLATFORM_SUPABASE_URL ?? "",
    targetKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    targetUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--") continue;
    if (arg === "--apply") out.apply = true;
    else if (arg === "--help" || arg === "-h") out.help = true;
    else if (arg === "--json") out.json = true;
    else if (arg === "--self-test") out.selfTest = true;
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
  pnpm inventory:matu-platform:master-data -- [--json]
  pnpm inventory:matu-platform:master-data -- --apply [--json]

Imports only master data:
  - central_supply / central_kitchen branches and stock-bearing locations
  - matu-platform materials as comtammatu ingredients by SKU`);
}

function assertProjectUrl(url, ref, label) {
  if (!url.includes(ref)) {
    throw new Error(`${label} URL must target ${ref}`);
  }
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

async function postRows(ctx, table, rows) {
  if (rows.length === 0) return [];
  const url = new URL(`/rest/v1/${table}`, ctx.baseUrl);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      apikey: ctx.key,
      authorization: `Bearer ${ctx.key}`,
      "content-type": "application/json",
      prefer: "return=representation",
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${table} insert failed: ${res.status} ${text}`);
  }
  return res.json();
}

async function loadSource(ctx) {
  const [materials, categories] = await Promise.all([
    fetchAll({
      ...ctx,
      table: "materials",
      select:
        "id,sku,name,kind,cost_per_unit,min_stock,is_active,base_unit,purchase_unit,purchase_to_base_factor,category_id",
    }),
    fetchAll({
      ...ctx,
      table: "material_categories",
      select: "id,name,is_active,sort_order",
    }),
  ]);
  return { categories, materials };
}

async function loadTarget(ctx) {
  const [tenants, branches, locations, ingredients] = await Promise.all([
    fetchAll({ ...ctx, table: "tenants", select: "id,slug,name" }),
    fetchAll({ ...ctx, table: "branches", select: "id,tenant_id,code,name,branch_kind" }),
    fetchAll({
      ...ctx,
      table: "inventory_locations",
      select: "id,tenant_id,branch_id,code,name,location_kind,is_default_issue,is_default_receive",
    }),
    fetchAll({ ...ctx, table: "ingredients", select: "id,tenant_id,sku,name" }),
  ]);
  return { branches, ingredients, locations, tenants };
}

function getTargetTenant(target) {
  const tenant = target.tenants.find((row) => row.slug === "comtammatu") ?? target.tenants[0];
  if (!tenant) throw new Error("Target tenant not found");
  return tenant;
}

function storageTypeForCategory(categoryName) {
  if (["Thịt", "Rau, củ", "Thành Phẩm"].includes(categoryName ?? "")) {
    return "refrigerated";
  }
  return "ambient";
}

function mapMaterialToIngredient(material, categoryById, tenantId) {
  const category = categoryById.get(material.category_id)?.name ?? null;
  const unit = material.base_unit || material.purchase_unit || "unit";
  const purchaseUnit = material.purchase_unit || unit;
  const factor = numberValue(material.purchase_to_base_factor, 1);
  return {
    category,
    is_active: material.is_active !== false,
    item_kind: material.kind === "semi_finished" ? "finished_good" : "raw_material",
    max_stock_level: null,
    measure_unit: unit,
    min_stock_level: Math.max(0, numberValue(material.min_stock, 0)),
    name: material.name,
    purchase_to_measure_factor: factor > 0 ? factor : 1,
    purchase_unit: purchaseUnit,
    reorder_point: Math.max(0, numberValue(material.min_stock, 0)),
    review_override: false,
    shelf_life_days: null,
    sku: material.sku,
    storage_type: storageTypeForCategory(category),
    tenant_id: tenantId,
    unit,
    unit_cost: numberValue(material.cost_per_unit, 0),
  };
}

function buildPlan(source, target) {
  const tenant = getTargetTenant(target);
  const categoryById = new Map(source.categories.map((row) => [row.id, row]));
  const branchByKind = new Map(target.branches.map((row) => [row.branch_kind, row]));
  const locationKey = (row) => `${row.branch_id}:${row.code}`;
  const locationByKey = new Map(target.locations.map((row) => [locationKey(row), row]));
  const ingredientBySku = new Map(
    target.ingredients.filter((row) => row.sku).map((row) => [String(row.sku).toUpperCase(), row]),
  );
  const ingredientByName = new Map(target.ingredients.map((row) => [row.name, row]));

  const centralBranches = [
    { branch_kind: "central_supply", code: "KT", name: "Kho Tổng", tenant_id: tenant.id, timezone: "Asia/Ho_Chi_Minh" },
    { branch_kind: "central_kitchen", code: "BTT", name: "Bếp Trung Tâm", tenant_id: tenant.id, timezone: "Asia/Ho_Chi_Minh" },
  ].map((row) => ({ ...row, exists: Boolean(branchByKind.get(row.branch_kind)) }));

  const existingOrPlannedBranches = new Map(branchByKind);
  for (const row of centralBranches) {
    if (!existingOrPlannedBranches.has(row.branch_kind)) {
      existingOrPlannedBranches.set(row.branch_kind, row);
    }
  }

  const centralLocations = [
    { branch_kind: "central_supply", code: "main_warehouse", name: "Kho Tổng", location_kind: "warehouse" },
    { branch_kind: "central_kitchen", code: "main_warehouse", name: "Bếp Trung Tâm", location_kind: "warehouse" },
  ].map((row) => {
    const branch = branchByKind.get(row.branch_kind);
    return {
      ...row,
      branch_id: branch?.id ?? null,
      exists: branch ? Boolean(locationByKey.get(`${branch.id}:${row.code}`)) : false,
      is_default_consumption: false,
      is_default_issue: true,
      is_default_receive: true,
      tenant_id: tenant.id,
    };
  });

  const materialRows = source.materials.map((material) =>
    mapMaterialToIngredient(material, categoryById, tenant.id),
  );
  const ingredientConflicts = materialRows.filter((row) => {
    const bySku = row.sku ? ingredientBySku.get(String(row.sku).toUpperCase()) : null;
    const byName = ingredientByName.get(row.name);
    return Boolean((bySku && bySku.name !== row.name) || (byName && byName.sku !== row.sku));
  });
  const ingredientsToCreate = materialRows.filter(
    (row) => row.sku && !ingredientBySku.get(String(row.sku).toUpperCase()),
  );

  return {
    generatedAt: new Date().toISOString(),
    mode: "dry-run",
    tenant,
    centralBranches,
    centralLocations,
    ingredients: {
      source: materialRows.length,
      existing: target.ingredients.length,
      toCreate: ingredientsToCreate.length,
      conflicts: ingredientConflicts,
      storageTypes: materialRows.reduce((acc, row) => {
        acc[row.storage_type] = (acc[row.storage_type] ?? 0) + 1;
        return acc;
      }, {}),
      toCreateRows: ingredientsToCreate,
    },
  };
}

async function applyPlan(ctx, plan) {
  if (plan.ingredients.conflicts.length > 0) {
    throw new Error("Ingredient conflicts must be resolved before apply");
  }

  const createdBranches = [];
  for (const row of plan.centralBranches.filter((item) => !item.exists)) {
    const [created] = await postRows(ctx, "branches", [
      {
        branch_kind: row.branch_kind,
        code: row.code,
        name: row.name,
        tenant_id: row.tenant_id,
        timezone: row.timezone,
      },
    ]);
    createdBranches.push(created);
  }

  const targetAfterBranches = await loadTarget(ctx);
  const branchByKind = new Map(targetAfterBranches.branches.map((row) => [row.branch_kind, row]));
  const locationByBranchCode = new Set(
    targetAfterBranches.locations.map((row) => `${row.branch_id}:${row.code}`),
  );
  const locationRows = [];
  for (const row of plan.centralLocations) {
    const branch = branchByKind.get(row.branch_kind);
    if (!branch) throw new Error(`Missing branch after apply: ${row.branch_kind}`);
    if (locationByBranchCode.has(`${branch.id}:${row.code}`)) continue;
    locationRows.push({
      branch_id: branch.id,
      code: row.code,
      is_default_consumption: false,
      is_default_issue: true,
      is_default_receive: true,
      location_kind: row.location_kind,
      name: row.name,
      tenant_id: row.tenant_id,
    });
  }
  const createdLocations = await postRows(ctx, "inventory_locations", locationRows);
  const createdIngredients = await postRows(ctx, "ingredients", plan.ingredients.toCreateRows);

  return {
    createdBranches: createdBranches.length,
    createdIngredients: createdIngredients.length,
    createdLocations: createdLocations.length,
  };
}

function printHuman(report) {
  console.log("Matu-platform Inventory master-data import");
  console.log(`Mode: ${report.mode}`);
  console.table(
    report.centralBranches.map((row) => ({
      kind: row.branch_kind,
      name: row.name,
      exists: row.exists,
    })),
  );
  console.table(
    report.centralLocations.map((row) => ({
      branchKind: row.branch_kind,
      code: row.code,
      exists: row.exists,
    })),
  );
  console.log(`Ingredients: source=${report.ingredients.source}, existing=${report.ingredients.existing}, toCreate=${report.ingredients.toCreate}`);
  console.table(report.ingredients.storageTypes);
  if (report.applyResult) console.log(`Applied: ${JSON.stringify(report.applyResult)}`);
}

function selfTest() {
  const source = {
    categories: [
      { id: "c1", name: "Thịt" },
      { id: "c2", name: "Gia vị" },
    ],
    materials: [
      {
        id: "m1",
        sku: "T001",
        name: "Sườn",
        kind: "raw",
        cost_per_unit: 100,
        min_stock: 2,
        is_active: true,
        base_unit: "g",
        purchase_unit: "kg",
        purchase_to_base_factor: 1000,
        category_id: "c1",
      },
      {
        id: "m2",
        sku: "TP001",
        name: "Rau củ thành phẩm",
        kind: "semi_finished",
        cost_per_unit: 200,
        min_stock: 1,
        is_active: true,
        base_unit: "g",
        purchase_unit: "kg",
        purchase_to_base_factor: 1000,
        category_id: "c2",
      },
    ],
  };
  const target = {
    tenants: [{ id: 1, slug: "comtammatu", name: "Cơm Tấm Má Tư" }],
    branches: [{ id: 2, code: "DD", name: "Đất Đỏ", branch_kind: "branch", tenant_id: 1 }],
    locations: [],
    ingredients: [],
  };
  const plan = buildPlan(source, target);
  assert.equal(plan.centralBranches.filter((row) => !row.exists).length, 2);
  assert.equal(plan.ingredients.toCreate, 2);
  assert.equal(plan.ingredients.toCreateRows[0].storage_type, "refrigerated");
  assert.equal(plan.ingredients.toCreateRows[1].item_kind, "finished_good");
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
  assertProjectUrl(args.sourceUrl, SOURCE_REF, "Source");
  assertProjectUrl(args.targetUrl, TARGET_REF, "Target");

  const sourceCtx = { baseUrl: args.sourceUrl, key: args.sourceKey };
  const targetCtx = { baseUrl: args.targetUrl, key: args.targetKey };
  const [source, target] = await Promise.all([loadSource(sourceCtx), loadTarget(targetCtx)]);
  const plan = buildPlan(source, target);
  let report = plan;

  if (args.apply) {
    const applyResult = await applyPlan(targetCtx, plan);
    const refreshedTarget = await loadTarget(targetCtx);
    report = { ...buildPlan(source, refreshedTarget), applyResult, mode: "applied" };
  }

  if (args.json) console.log(JSON.stringify(report, null, 2));
  else printHuman(report);
}
