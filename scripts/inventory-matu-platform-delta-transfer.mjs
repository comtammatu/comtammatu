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
    help: false,
    json: false,
    selfTest: false,
    sourceKey: process.env.MATU_PLATFORM_SUPABASE_SERVICE_ROLE_KEY ?? "",
    sourceUrl: process.env.MATU_PLATFORM_SUPABASE_URL ?? "",
    targetKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    targetUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "",
    transferCode: "",
    writeSql: "",
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--") continue;
    if (arg === "--actor-id") out.actorId = argv[++i] ?? "";
    else if (arg === "--help" || arg === "-h") out.help = true;
    else if (arg === "--json") out.json = true;
    else if (arg === "--self-test") out.selfTest = true;
    else if (arg === "--transfer-code") out.transferCode = argv[++i] ?? "";
    else if (arg === "--write-sql") out.writeSql = argv[++i] ?? "";
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return out;
}

function printHelp() {
  console.log(`Usage:
  pnpm inventory:matu-platform:delta-transfer -- --transfer-code TRF-... [--json]
  pnpm inventory:matu-platform:delta-transfer -- --transfer-code TRF-... --write-sql /tmp/delta.sql

Builds a guarded SQL file for one received stock-bearing matu-platform transfer.
It does not apply SQL.`);
}

function assertProjectUrl(url, ref, label) {
  if (!url.includes(ref)) throw new Error(`${label} URL must target ${ref}`);
}

function inFilter(values) {
  return `in.(${values.join(",")})`;
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

async function loadSource(ctx, transferCode) {
  const transfers = await fetchAll({
    ...ctx,
    table: "stock_transfers",
    select:
      "id,code,from_warehouse_id,to_warehouse_id,status,created_at,sent_at,received_at",
    filters: { code: `eq.${transferCode}` },
  });
  const transfer = transfers[0];
  if (!transfer) throw new Error(`Source transfer not found: ${transferCode}`);
  const [branches, warehouses, materials, transferItems] = await Promise.all([
    fetchAll({ ...ctx, table: "branches", select: "id,code,name" }),
    fetchAll({
      ...ctx,
      table: "warehouses",
      select: "id,branch_id,code,name,kind,is_production_default",
      filters: {
        id: inFilter([transfer.from_warehouse_id, transfer.to_warehouse_id]),
      },
    }),
    fetchAll({
      ...ctx,
      table: "materials",
      select: "id,sku,name,cost_per_unit,base_unit,purchase_unit",
    }),
    fetchAll({
      ...ctx,
      table: "stock_transfer_items",
      select: "transfer_id,material_id,quantity",
      filters: { transfer_id: `eq.${transfer.id}` },
    }),
  ]);
  return { branches, materials, transfer, transferItems, warehouses };
}

async function loadTarget(ctx, transferCode) {
  const [
    tenants,
    branches,
    locations,
    ingredients,
    profiles,
    existingTransfers,
    stockLevels,
  ] = await Promise.all([
    fetchAll({ ...ctx, table: "tenants", select: "id,slug,name" }),
    fetchAll({ ...ctx, table: "branches", select: "id,tenant_id,code,name,branch_kind" }),
    fetchAll({
      ...ctx,
      table: "inventory_locations",
      select: "id,tenant_id,branch_id,code,name,location_kind,is_default_issue,is_active",
    }),
    fetchAll({ ...ctx, table: "ingredients", select: "id,tenant_id,sku,name,unit,unit_cost" }),
    fetchAll({
      ...ctx,
      table: "profiles",
      select: "id,tenant_id,branch_id,full_name,is_active,created_at",
    }),
    fetchAll({
      ...ctx,
      table: "stock_transfers",
      select: "id,transfer_number,notes",
      filters: { transfer_number: `eq.${transferCode}` },
    }),
    fetchAll({
      ...ctx,
      table: "stock_levels",
      select: "tenant_id,location_id,ingredient_id,current_quantity,avg_unit_cost",
    }),
  ]);
  return {
    branches,
    existingTransfers,
    ingredients,
    locations,
    profiles,
    stockLevels,
    tenants,
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
    .sort((a, b) => String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")))[0];
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

function makeTargetIndex(target, tenantId) {
  const branches = target.branches.filter((row) => row.tenant_id === tenantId);
  const locations = target.locations.filter((row) => row.tenant_id === tenantId);
  const ingredients = target.ingredients.filter((row) => row.tenant_id === tenantId);
  const branchByCodeKind = new Map(
    branches
      .filter((row) => row.code && row.branch_kind)
      .map((row) => [`${String(row.code).toUpperCase()}:${row.branch_kind}`, row]),
  );
  const branchByKind = new Map(branches.map((row) => [row.branch_kind, row]));
  const locationsByBranch = new Map();
  for (const loc of locations.filter((row) => row.is_active !== false)) {
    const list = locationsByBranch.get(loc.branch_id) ?? [];
    list.push(loc);
    locationsByBranch.set(loc.branch_id, list);
  }
  const stockLocationForBranch = (branchId) => {
    const list = locationsByBranch.get(branchId) ?? [];
    return (
      list.find((loc) => loc.code === "main_warehouse" && loc.location_kind === "warehouse") ??
      list.find((loc) => loc.is_default_issue && loc.location_kind === "warehouse") ??
      list.find((loc) => loc.location_kind === "warehouse") ??
      null
    );
  };
  return {
    branchByCodeKind,
    branchByKind,
    ingredientBySku: new Map(
      ingredients
        .filter((row) => row.sku)
        .map((row) => [String(row.sku).toUpperCase(), row]),
    ),
    ingredientByName: new Map(ingredients.map((row) => [normalizeText(row.name), row])),
    stockLocationForBranch,
  };
}

function sourceWarehouseTarget(warehouse, sourceBranchById, targetIndex) {
  const role = sourceWarehouseRole(warehouse);
  if (role === "central_supply" || role === "central_kitchen") {
    const branch = targetIndex.branchByKind.get(role) ?? null;
    return { branch, location: branch ? targetIndex.stockLocationForBranch(branch.id) : null, role };
  }
  const sourceBranch = sourceBranchById.get(warehouse?.branch_id);
  const branch = sourceBranch
    ? targetIndex.branchByCodeKind.get(`${String(sourceBranch.code ?? "").toUpperCase()}:branch`) ?? null
    : null;
  return {
    branch,
    location: role === "branch_warehouse" && branch ? targetIndex.stockLocationForBranch(branch.id) : null,
    role,
  };
}

function aggregateLines(items, materialById, targetIndex, missingRows) {
  const byIngredient = new Map();
  for (const item of items) {
    const material = materialById.get(item.material_id);
    const ingredient =
      targetIndex.ingredientBySku.get(String(material?.sku ?? "").toUpperCase()) ??
      targetIndex.ingredientByName.get(normalizeText(material?.name));
    if (!material || !ingredient) {
      missingRows.push({
        materialId: item.material_id,
        materialName: material?.name ?? null,
        materialSku: material?.sku ?? null,
      });
      continue;
    }
    const existing =
      byIngredient.get(ingredient.id) ??
      {
        ingredient_id: ingredient.id,
        name: ingredient.name,
        quantity: 0,
        unit: ingredient.unit ?? material.base_unit ?? material.purchase_unit ?? "unit",
        unit_cost: numberValue(material.cost_per_unit ?? ingredient.unit_cost),
      };
    existing.quantity += numberValue(item.quantity);
    byIngredient.set(ingredient.id, existing);
  }
  return [...byIngredient.values()].filter((row) => row.quantity > 0);
}

function stockLevelFor(target, tenantId, locationId, ingredientId) {
  return target.stockLevels.find(
    (row) =>
      row.tenant_id === tenantId &&
      row.location_id === locationId &&
      row.ingredient_id === ingredientId,
  );
}

function buildPlan(source, target, options) {
  const tenant = getTargetTenant(target);
  const actor = selectActor(target, tenant.id, options.actorId ?? "");
  const targetIndex = makeTargetIndex(target, tenant.id);
  const sourceBranchById = new Map(source.branches.map((row) => [row.id, row]));
  const sourceWarehouseById = new Map(source.warehouses.map((row) => [row.id, row]));
  const materialById = new Map(source.materials.map((row) => [row.id, row]));
  const transfer = source.transfer;
  const from = sourceWarehouseById.get(transfer.from_warehouse_id);
  const to = sourceWarehouseById.get(transfer.to_warehouse_id);
  const fromTarget = sourceWarehouseTarget(from, sourceBranchById, targetIndex);
  const toTarget = sourceWarehouseTarget(to, sourceBranchById, targetIndex);
  const missingRows = [];
  const lines = aggregateLines(source.transferItems, materialById, targetIndex, missingRows);
  const blockers = [];

  if (transfer.status !== "received") blockers.push("source transfer is not received");
  if (target.existingTransfers.length > 0) blockers.push("target transfer already exists");
  if (!fromTarget.location || !toTarget.location) blockers.push("missing stock-bearing target location");
  if (fromTarget.role === "branch_kitchen_endpoint" || toTarget.role === "branch_kitchen_endpoint") {
    blockers.push("branch kitchen endpoint transfer is not supported by this delta script");
  }
  if (fromTarget.location?.id === toTarget.location?.id || fromTarget.branch?.id === toTarget.branch?.id) {
    blockers.push("source transfer collapses to same target site");
  }
  if (
    !isAllowedTargetTransferDirection(
      fromTarget.branch?.branch_kind,
      toTarget.branch?.branch_kind,
    )
  ) {
    blockers.push("target transfer direction is not allowed");
  }
  if (missingRows.length > 0) blockers.push("missing ingredient mapping");
  for (const line of lines) {
    const available = numberValue(
      stockLevelFor(target, tenant.id, fromTarget.location?.id, line.ingredient_id)?.current_quantity,
    );
    if (available < line.quantity) {
      blockers.push(`insufficient source stock for ingredient ${line.ingredient_id}`);
    }
  }

  const transferRow = {
    created_at: transfer.created_at,
    created_by: actor.id,
    from_branch_id: fromTarget.branch?.id ?? null,
    from_location_id: fromTarget.location?.id ?? null,
    notes: `matu-platform import:delta_transfer:${transfer.id}`,
    received_at: transfer.received_at ?? transfer.sent_at ?? transfer.created_at,
    shipped_at: transfer.sent_at ?? transfer.created_at,
    status: "received",
    tenant_id: tenant.id,
    to_branch_id: toTarget.branch?.id ?? null,
    to_location_id: toTarget.location?.id ?? null,
    transfer_number: transfer.code,
    updated_at: transfer.received_at ?? transfer.sent_at ?? transfer.created_at,
    vehicle_info: null,
  };
  const transferItems = lines.map((line) => ({
    ingredient_id: line.ingredient_id,
    quantity: line.quantity,
    quantity_received: line.quantity,
    receive_note: null,
    tenant_id: tenant.id,
    transfer_number: transfer.code,
    unit: line.unit,
    unit_cost_at_ship: line.unit_cost,
  }));
  const movements = lines.flatMap((line) => [
    {
      branch_id: fromTarget.branch?.id ?? null,
      created_at: transfer.sent_at ?? transfer.created_at,
      created_by: actor.id,
      ingredient_id: line.ingredient_id,
      location_id: fromTarget.location?.id ?? null,
      movement_subtype: null,
      quantity_change: -line.quantity,
      reason: `matu-platform import:delta_transfer:${transfer.code}:transfer_out`,
      source_transfer_number: transfer.code,
      tenant_id: tenant.id,
      type: "transfer_out",
      unit_cost: line.unit_cost,
    },
    {
      branch_id: toTarget.branch?.id ?? null,
      created_at: transfer.received_at ?? transfer.sent_at ?? transfer.created_at,
      created_by: actor.id,
      ingredient_id: line.ingredient_id,
      location_id: toTarget.location?.id ?? null,
      movement_subtype: null,
      quantity_change: line.quantity,
      reason: `matu-platform import:delta_transfer:${transfer.code}:transfer_in`,
      source_transfer_number: transfer.code,
      tenant_id: tenant.id,
      type: "transfer_in",
      unit_cost: line.unit_cost,
    },
  ]);

  return {
    generatedAt: new Date().toISOString(),
    mode: "dry-run",
    actor: { id: actor.id, fullName: actor.full_name ?? null },
    blockers: [...new Set(blockers)],
    missingRows,
    source: {
      fromCode: from?.code ?? null,
      fromRole: fromTarget.role,
      id: transfer.id,
      status: transfer.status,
      toCode: to?.code ?? null,
      toRole: toTarget.role,
      transferCode: transfer.code,
    },
    target: {
      existingTransfers: target.existingTransfers.length,
      fromBranchId: fromTarget.branch?.id ?? null,
      fromLocationId: fromTarget.location?.id ?? null,
      toBranchId: toTarget.branch?.id ?? null,
      toLocationId: toTarget.location?.id ?? null,
    },
    operationalPlan: {
      movementRows: movements.length,
      transferItems: transferItems.length,
      transferRows: 1,
      estimatedCost: moneyValue(
        lines.reduce((sum, line) => sum + line.quantity * line.unit_cost, 0),
      ),
      lines,
    },
    sql: {
      canWrite: blockers.length === 0,
      movementRows: movements.length,
      transferItemRows: transferItems.length,
      transferRows: 1,
    },
    sqlRows: { movements, transferItems, transfers: [transferRow] },
  };
}

function jsonSql(tag, rows) {
  return `$${tag}$${JSON.stringify(rows)}$${tag}$::jsonb`;
}

function generateSql(rows) {
  return `BEGIN;

CREATE TEMP TABLE tmp_matu_delta_transfers ON COMMIT DROP AS
SELECT *
FROM jsonb_to_recordset(${jsonSql("matu_delta_transfers", rows.transfers)}) AS x(
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

CREATE TEMP TABLE tmp_matu_delta_transfer_items ON COMMIT DROP AS
SELECT *
FROM jsonb_to_recordset(${jsonSql("matu_delta_transfer_items", rows.transferItems)}) AS x(
  transfer_number text,
  tenant_id bigint,
  ingredient_id bigint,
  quantity numeric,
  unit text,
  unit_cost_at_ship numeric,
  quantity_received numeric,
  receive_note text
);

CREATE TEMP TABLE tmp_matu_delta_movements ON COMMIT DROP AS
SELECT *
FROM jsonb_to_recordset(${jsonSql("matu_delta_movements", rows.movements)}) AS x(
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

DO $guard$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.stock_transfers st
    JOIN tmp_matu_delta_transfers t
      ON t.tenant_id = st.tenant_id
     AND t.transfer_number = st.transfer_number
  ) THEN
    RAISE EXCEPTION 'delta_transfer_already_imported';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.stock_movements sm
    JOIN tmp_matu_delta_movements m
      ON m.tenant_id = sm.tenant_id
     AND m.reason = sm.reason
  ) THEN
    RAISE EXCEPTION 'delta_movement_already_imported';
  END IF;

  IF EXISTS (
    WITH needed AS (
      SELECT tenant_id, location_id, ingredient_id, abs(sum(quantity_change)) AS quantity
      FROM tmp_matu_delta_movements
      WHERE type = 'transfer_out'
      GROUP BY tenant_id, location_id, ingredient_id
    )
    SELECT 1
    FROM needed n
    LEFT JOIN public.stock_levels sl
      ON sl.tenant_id = n.tenant_id
     AND sl.location_id = n.location_id
     AND sl.ingredient_id = n.ingredient_id
    WHERE coalesce(sl.current_quantity, 0) < n.quantity
  ) THEN
    RAISE EXCEPTION 'delta_source_stock_insufficient';
  END IF;
END
$guard$;

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
FROM tmp_matu_delta_transfers;

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
FROM tmp_matu_delta_transfer_items ti
JOIN public.stock_transfers st
  ON st.tenant_id = ti.tenant_id
 AND st.transfer_number = ti.transfer_number;

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
FROM tmp_matu_delta_movements m
JOIN public.stock_transfers st
  ON st.tenant_id = m.tenant_id
 AND st.transfer_number = m.source_transfer_number
ORDER BY m.created_at, m.reason, m.ingredient_id;

COMMIT;
`;
}

function printHuman(plan) {
  console.log("Matu-platform Inventory delta transfer import");
  console.log(`Generated: ${plan.generatedAt}`);
  console.log(`Transfer: ${plan.source.transferCode} (${plan.source.fromCode} -> ${plan.source.toCode})`);
  console.log(`Blockers: ${plan.blockers.length ? plan.blockers.join("; ") : "none"}`);
  console.log(`SQL can write: ${plan.sql.canWrite}`);
  console.table(plan.operationalPlan.lines);
}

function selfTest() {
  const source = {
    branches: [],
    materials: [{ id: "m1", sku: "G001", name: "Gao", cost_per_unit: 13000, base_unit: "kg" }],
    transfer: {
      id: "t1",
      code: "TRF-1",
      from_warehouse_id: "kho-tt",
      to_warehouse_id: "kho-tong",
      status: "received",
      created_at: "2026-06-22T00:00:00Z",
      sent_at: "2026-06-22T00:00:01Z",
      received_at: "2026-06-22T00:00:02Z",
    },
    transferItems: [{ transfer_id: "t1", material_id: "m1", quantity: 200 }],
    warehouses: [
      { id: "kho-tt", branch_id: null, code: "KHO-TT", name: "Kho Trung Tam", kind: "warehouse", is_production_default: true },
      { id: "kho-tong", branch_id: null, code: "KHO-TONG", name: "Kho Tong", kind: "warehouse" },
    ],
  };
  const target = {
    branches: [
      { id: 15, tenant_id: 1, code: "KT", name: "Kho Tong", branch_kind: "central_supply" },
      { id: 16, tenant_id: 1, code: "BTT", name: "Bep Trung Tam", branch_kind: "central_kitchen" },
    ],
    existingTransfers: [],
    ingredients: [{ id: 14, tenant_id: 1, sku: "G001", name: "Gao", unit: "kg", unit_cost: 13000 }],
    locations: [
      { id: 9, tenant_id: 1, branch_id: 15, code: "main_warehouse", location_kind: "warehouse", is_active: true },
      { id: 10, tenant_id: 1, branch_id: 16, code: "main_warehouse", location_kind: "warehouse", is_active: true },
    ],
    profiles: [{ id: "00000000-0000-0000-0000-000000000001", tenant_id: 1, is_active: true, created_at: "2026-01-01" }],
    stockLevels: [{ tenant_id: 1, location_id: 10, ingredient_id: 14, current_quantity: 500 }],
    tenants: [{ id: 1, slug: "comtammatu", name: "Com Tam" }],
  };
  const plan = buildPlan(source, target, {});
  assert.deepEqual(plan.blockers, []);
  assert.equal(plan.sql.canWrite, true);
  assert.equal(plan.operationalPlan.estimatedCost, 2600000);
  assert.equal(plan.sqlRows.movements.length, 2);
  assert.match(generateSql(plan.sqlRows), /delta_source_stock_insufficient/);
  console.log("self-test ok");
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  printHelp();
} else if (args.selfTest) {
  selfTest();
} else {
  if (!args.transferCode) throw new Error("Missing --transfer-code");
  if (!args.sourceUrl || !args.sourceKey || !args.targetUrl || !args.targetKey) {
    throw new Error("Missing source/target Supabase env");
  }
  assertProjectUrl(args.sourceUrl, SOURCE_REF, "Source");
  assertProjectUrl(args.targetUrl, TARGET_REF, "Target");
  const [source, target] = await Promise.all([
    loadSource({ baseUrl: args.sourceUrl, key: args.sourceKey }, args.transferCode),
    loadTarget({ baseUrl: args.targetUrl, key: args.targetKey }, args.transferCode),
  ]);
  const plan = buildPlan(source, target, args);
  if (args.writeSql) {
    if (!plan.sql.canWrite) throw new Error(`Cannot write SQL: ${plan.blockers.join("; ")}`);
    writeFileSync(args.writeSql, generateSql(plan.sqlRows));
  }
  const report = {
    ...plan,
    sqlRows: undefined,
    ...(args.writeSql ? { sqlFile: args.writeSql } : {}),
  };
  if (args.json) console.log(JSON.stringify(report, null, 2));
  else printHuman(report);
}
