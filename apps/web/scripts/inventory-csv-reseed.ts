#!/usr/bin/env tsx
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { canonicalizeImportedUnitCode } from "../lib/inventory/unit-codes";

type Args = {
  ingredients: string;
  productionRecipes: string;
  out: string;
  catalogOnly: boolean;
  selfTest: boolean;
  help: boolean;
};

type CsvRow = Record<string, string>;

type UnitRow = {
  code: string;
  name: string;
  factor: number;
  isBase: boolean;
};

type IngredientRow = {
  id: number;
  name: string;
  sku: string | null;
  category: string;
  itemKind: "raw_material" | "finished_good";
  storageType: "ambient" | "refrigerated" | "frozen";
  unitCost: number | null;
  minStock: number;
  maxStock: number | null;
  reorderPoint: number | null;
  active: boolean;
  units: UnitRow[];
};

type RecipeRow = {
  finishedGoodId: number;
  ingredientId: number;
  quantity: number;
  unitCode: string;
  yieldFactor: number;
  note: string | null;
};

type Issue = {
  file: string;
  row: number;
  message: string;
};

const DEFAULT_INGREDIENTS = "~/Downloads/nguyen_lieu.csv";
const DEFAULT_RECIPES = "~/Downloads/cong_thuc_san_xuat.csv";

const OPERATIONAL_DELETE_TABLES = [
  "branch_menu_item_daily_holds",
  "branch_menu_item_daily_limits",
  "attendance_consumption_report_lines",
  "attendance_consumption_reports",
  "inventory_count_slip_lines",
  "inventory_count_slips",
  "inventory_count_assignments",
  "stocktake_zone_locks",
  "stocktake_conflicts",
  "stocktake_lines",
  "stocktake_sessions",
  "stock_movements",
  "production_runs",
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
  "stock_transfer_items",
  "stock_transfers",
  "stock_issue_items",
  "stock_issues",
  "stock_levels",
] as const;

const MASTER_DELETE_TABLES = [
  "recipes",
  "production_recipes",
  "shift_checklist_consumption_default_items",
  "ingredient_abc_class",
  "supplier_price_list",
  "supplier_items",
  "suppliers",
  "ingredient_units",
  "ingredients",
  "ingredient_category_review_policy",
  "ingredient_categories",
  "units",
] as const;

const NON_TENANT_DELETES: Record<string, string> = {
  branch_daily_waste_cap:
    "branch_id IN (SELECT id FROM public.branches WHERE tenant_id IN (SELECT id FROM target_tenants))",
  stocktake_drafts: "TRUE",
};
const NON_TENANT_DELETE_TABLES = Object.keys(NON_TENANT_DELETES);

const STANDARD_UNITS: Record<
  string,
  { dimension: "mass" | "volume"; standardFactor: number }
> = {
  g: { dimension: "mass", standardFactor: 1 },
  kg: { dimension: "mass", standardFactor: 1000 },
  mg: { dimension: "mass", standardFactor: 0.001 },
  ml: { dimension: "volume", standardFactor: 1 },
  l: { dimension: "volume", standardFactor: 1000 },
  cl: { dimension: "volume", standardFactor: 10 },
};

function parseArgs(argv: string[]): Args {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const args: Args = {
    ingredients: DEFAULT_INGREDIENTS,
    productionRecipes: DEFAULT_RECIPES,
    out: `.tmp/inventory-reseed/${stamp}`,
    catalogOnly: false,
    selfTest: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") continue;
    if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "--self-test") args.selfTest = true;
    else if (arg === "--catalog-only") args.catalogOnly = true;
    else if (arg === "--ingredients") args.ingredients = readArg(argv, ++index, arg);
    else if (arg === "--production-recipes")
      args.productionRecipes = readArg(argv, ++index, arg);
    else if (arg === "--out") args.out = readArg(argv, ++index, arg);
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function readArg(argv: string[], index: number, name: string): string {
  const value = argv[index];
  if (!value) throw new Error(`${name} requires a value`);
  return value;
}

function printHelp() {
  console.log(`Usage:
  pnpm inventory:csv-reseed:dry-run
  pnpm inventory:csv-reseed:dry-run -- --catalog-only

Reads:
  ${DEFAULT_INGREDIENTS}
  ${DEFAULT_RECIPES} (skipped with --catalog-only)

Writes, but does not execute:
  - manifest.json
  - inventory-reseed.sql`);
}

function repoRoot(): string {
  return path.resolve(process.cwd(), "../..");
}

function resolveInsideRepo(input: string): string {
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

function expandPath(input: string): string {
  if (input === "~") return process.env["HOME"] ?? input;
  if (input.startsWith("~/")) {
    return path.join(process.env["HOME"] ?? "", input.slice(2));
  }
  return path.resolve(input);
}

function parseCsv(text: string): CsvRow[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (ch !== "\r") {
      cell += ch;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  const header = rows.shift()?.map((value) => value.trim()) ?? [];
  return rows
    .filter((values) => values.some((value) => value.trim() !== ""))
    .map((values) =>
      Object.fromEntries(header.map((key, index) => [key, values[index]?.trim() ?? ""])),
    );
}

function cleanText(value: string): string {
  return value
    .replace(/Bao bì\/Đồ dùng 1 l���n/g, "Bao bì/Đồ dùng 1 lần")
    .replace(/Gia vị\/B��t\/Nước mắm/g, "Gia vị/Bột/Nước mắm")
    .replace(/Ph��ớc Hải/g, "Phước Hải")
    .replace(/\s+/g, " ")
    .trim();
}

function unitCode(value: string): string {
  return canonicalizeImportedUnitCode(cleanText(value));
}

function parseNumber(raw: string): number | null {
  const value = raw.trim();
  if (!value) return null;
  const n = Number(value.replace(/\s/g, "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function parseBool(raw: string): boolean {
  return ["true", "1", "yes", "có", "co", "x"].includes(
    raw.trim().toLocaleLowerCase("vi-VN"),
  );
}

function parseUnits(raw: string, file: string, row: number): UnitRow[] {
  const units = raw
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const match = part.match(/^(.+?)(?:\(base\))?=f([0-9.]+)$/);
      if (!match) throw new Error(`${file}:${row}: unit shape invalid: ${part}`);
      const label = cleanText(match[1] ?? "");
      const factor = Number(match[2]);
      if (!label || !Number.isFinite(factor) || factor <= 0) {
        throw new Error(`${file}:${row}: unit factor invalid: ${part}`);
      }
      return {
        code: unitCode(label),
        name: label,
        factor,
        isBase: part.includes("(base)"),
      };
    });

  if (units.filter((unit) => unit.isBase).length !== 1) {
    throw new Error(`${file}:${row}: expected exactly one base unit`);
  }
  return units;
}

function units(...rows: Array<[string, number, boolean?]>): UnitRow[] {
  return rows.map(([name, factor, isBase = false]) => ({
    code: unitCode(name),
    name,
    factor,
    isBase,
  }));
}

function applyCatalogOverrides(ingredients: IngredientRow[]): string[] {
  const warnings: string[] = [];
  const byId = new Map(ingredients.map((row) => [row.id, row]));
  const maxId = Math.max(...ingredients.map((row) => row.id));
  let nextId = maxId + 1;

  function patch(id: number, patch: Partial<IngredientRow>) {
    const row = byId.get(id);
    if (!row) {
      warnings.push(`missing override target id=${id}`);
      return;
    }
    Object.assign(row, patch);
  }

  patch(183, {
    units: units(["thùng", 1, true], ["phần", 1 / 43.5]),
    itemKind: "finished_good",
  });
  patch(213, {
    units: units(["thùng", 1, true], ["phần", 1 / 40]),
    itemKind: "finished_good",
  });
  patch(212, {
    units: units(["kg", 1, true], ["phần", 1 / 12.5]),
    itemKind: "finished_good",
  });
  patch(214, {
    itemKind: "finished_good",
    units: units(["khay", 1, true], ["phần", 1 / 27]),
  });
  patch(216, {
    units: units(["khay", 1, true], ["phần", 1 / 52]),
    itemKind: "finished_good",
  });
  patch(208, {
    units: units(["trái", 1, true], ["vỉ", 30], ["phần", 1]),
    itemKind: "raw_material",
  });
  patch(154, { units: units(["ml", 1, true], ["l", 1000], ["ly", 200]) });
  patch(170, { units: units(["ml", 1, true], ["l", 1000], ["ly", 200]) });
  patch(153, { units: units(["ml", 1, true], ["l", 1000], ["ly", 200]) });
  patch(204, { units: units(["chai", 1, true], ["thùng", 24]) });
  patch(205, {
    itemKind: "finished_good",
    units: units(["lon", 1, true], ["thùng", 24]),
  });

  function add(row: Omit<IngredientRow, "id">) {
    ingredients.push({ id: nextId, ...row });
    nextId += 1;
  }

  add({
    name: "Tóp Mỡ",
    sku: null,
    category: "Thành phẩm",
    itemKind: "finished_good",
    storageType: "ambient",
    unitCost: null,
    minStock: 0,
    maxStock: null,
    reorderPoint: null,
    active: true,
    units: units(["kg", 1, true], ["phần", 0.1]),
  });

  return warnings;
}

function readIngredients(rows: CsvRow[]): IngredientRow[] {
  return rows.map((row, index) => {
    const line = index + 2;
    const id = parseNumber(row["id"] ?? "");
    if (id == null || !Number.isInteger(id)) {
      throw new Error(`nguyen_lieu.csv:${line}: invalid id`);
    }
    const name = cleanText(row["ten_nguyen_lieu"] ?? "");
    const category = cleanText(row["danh_muc"] ?? "") || "Nguyên liệu khác";
    const unitCost = parseNumber(row["unit_cost"] ?? "");
    const minStock = parseNumber(row["min_stock"] ?? "") ?? 0;
    return {
      id,
      name,
      sku: cleanText(row["sku"] ?? "") || null,
      category,
      itemKind:
        (row["phan_loai"] ?? "").trim() === "finished_good"
          ? "finished_good"
          : "raw_material",
      storageType:
        row["storage_type"] === "refrigerated" || row["storage_type"] === "frozen"
          ? row["storage_type"]
          : "ambient",
      unitCost,
      minStock,
      maxStock: parseNumber(row["max_stock"] ?? ""),
      reorderPoint: parseNumber(row["reorder_point"] ?? ""),
      active: parseBool(row["active"] ?? "TRUE"),
      units: parseUnits(row["danh_sach_don_vi"] ?? "", "nguyen_lieu.csv", line),
    };
  });
}

function readRecipes(rows: CsvRow[]): RecipeRow[] {
  return rows.map((row, index) => {
    const line = index + 2;
    const finishedGoodId = parseNumber(row["thanh_pham_id"] ?? "");
    const ingredientId = parseNumber(row["nguyen_lieu_id"] ?? "");
    const quantity = parseNumber(row["dinh_muc"] ?? "");
    const yieldFactor = parseNumber(row["yield_factor"] ?? "") ?? 1;
    const unit = unitCode(row["don_vi_nhap"] ?? "");
    if (
      finishedGoodId == null ||
      ingredientId == null ||
      quantity == null ||
      !Number.isInteger(finishedGoodId) ||
      !Number.isInteger(ingredientId) ||
      quantity <= 0 ||
      yieldFactor <= 0 ||
      !unit
    ) {
      throw new Error(`cong_thuc_san_xuat.csv:${line}: invalid recipe row`);
    }
    return {
      finishedGoodId,
      ingredientId,
      quantity,
      unitCode: unit,
      yieldFactor,
      note: cleanText(row["ghi_chu"] ?? "") || null,
    };
  });
}

function validate(
  ingredients: IngredientRow[],
  recipes: RecipeRow[],
): { issues: Issue[]; warnings: string[] } {
  const issues: Issue[] = [];
  const warnings: string[] = [];
  const byId = new Map<number, IngredientRow>();
  const names = new Map<string, number>();

  ingredients.forEach((row, index) => {
    if (byId.has(row.id)) {
      issues.push({ file: "nguyen_lieu.csv", row: index + 2, message: "Duplicate id" });
    }
    byId.set(row.id, row);
    const nameKey = row.name.toLocaleLowerCase("vi-VN");
    names.set(nameKey, (names.get(nameKey) ?? 0) + 1);
    if (row.name.includes("\uFFFD") || row.category.includes("\uFFFD")) {
      issues.push({
        file: "nguyen_lieu.csv",
        row: index + 2,
        message: "Replacement character remains after cleanup",
      });
    }
    if (row.units.filter((unit) => unit.isBase).length !== 1) {
      issues.push({
        file: "nguyen_lieu.csv",
        row: index + 2,
        message: "Ingredient must have exactly one base unit",
      });
    }
  });

  for (const [name, count] of names) {
    if (count > 1) warnings.push(`duplicate ingredient display name after cleanup: ${name}`);
  }

  const recipePairs = new Set<string>();
  recipes.forEach((row, index) => {
    const line = index + 2;
    const finishedGood = byId.get(row.finishedGoodId);
    const ingredient = byId.get(row.ingredientId);
    if (!finishedGood || finishedGood.itemKind !== "finished_good") {
      issues.push({
        file: "cong_thuc_san_xuat.csv",
        row: line,
        message: `Finished good not found or not finished_good: ${row.finishedGoodId}`,
      });
    }
    if (!ingredient) {
      issues.push({
        file: "cong_thuc_san_xuat.csv",
        row: line,
        message: `Ingredient not found: ${row.ingredientId}`,
      });
      return;
    }
    if (!ingredient.units.some((unit) => unit.code === row.unitCode)) {
      issues.push({
        file: "cong_thuc_san_xuat.csv",
        row: line,
        message: `Unit ${row.unitCode} is not configured for ingredient ${row.ingredientId}`,
      });
    }
    const key = `${row.finishedGoodId}:${row.ingredientId}`;
    if (recipePairs.has(key)) {
      issues.push({
        file: "cong_thuc_san_xuat.csv",
        row: line,
        message: "Duplicate ingredient in finished-good recipe",
      });
    }
    recipePairs.add(key);
  });

  return { issues, warnings };
}

function renumberIngredientIds(ingredients: IngredientRow[]) {
  ingredients
    .slice()
    .sort((a, b) => a.id - b.id)
    .forEach((row, index) => {
      row.id = index + 1;
    });
}

function sqlString(value: string | null): string {
  if (value == null) return "NULL";
  return `'${value.replace(/'/g, "''")}'`;
}

function sqlNumber(value: number | null): string {
  return value == null ? "NULL" : String(value);
}

function sqlBool(value: boolean): string {
  return value ? "TRUE" : "FALSE";
}

function deleteSql(table: string): string {
  const predicate =
    NON_TENANT_DELETES[table] ?? "tenant_id IN (SELECT id FROM target_tenants)";
  return `DELETE FROM public.${table} WHERE ${predicate};`;
}

function resetIdentitySql(tables: readonly string[]): string {
  const tableValues = tables.map((table) => sqlString(table)).join(", ");
  return `DO $$
DECLARE
  v_table text;
  v_seq text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[${tableValues}] LOOP
    IF EXISTS (
      SELECT 1
      FROM pg_attribute
      WHERE attrelid = format('public.%I', v_table)::regclass
        AND attname = 'id'
        AND NOT attisdropped
    ) THEN
      SELECT pg_get_serial_sequence(format('public.%I', v_table), 'id') INTO v_seq;
      IF v_seq IS NOT NULL THEN
        EXECUTE 'ALTER SEQUENCE ' || v_seq || ' RESTART WITH 1';
      END IF;
    END IF;
  END LOOP;
END $$;`;
}

function setIdentityToMaxSql(table: string): string {
  return `SELECT setval(
  pg_get_serial_sequence('public.${table}', 'id'),
  COALESCE((SELECT max(id) FROM public.${table}), 1),
  (SELECT max(id) IS NOT NULL FROM public.${table})
);`;
}

function buildSql(
  ingredients: IngredientRow[],
  recipes: RecipeRow[],
  options: { catalogOnly?: boolean } = {},
): string {
  const categories = [...new Set(ingredients.map((row) => row.category))].sort((a, b) =>
    a.localeCompare(b, "vi"),
  );
  const unitMap = new Map<string, UnitRow>();
  for (const ingredient of ingredients) {
    for (const unit of ingredient.units) unitMap.set(unit.code, unit);
  }
  const allUnits = [...unitMap.values()].sort((a, b) => a.code.localeCompare(b.code, "vi"));
  const ingredientValues = ingredients
    .slice()
    .sort((a, b) => a.id - b.id)
    .map(
      (row) =>
        `(${row.id}, ${sqlString(row.name)}, ${sqlString(row.sku)}, ${sqlString(row.category)}, ${sqlString(row.itemKind)}, ${sqlString(row.storageType)}, ${sqlNumber(row.unitCost)}, ${row.minStock}, ${sqlNumber(row.maxStock)}, ${sqlNumber(row.reorderPoint)}, ${sqlBool(row.active)})`,
    )
    .join(",\n    ");
  const unitValues = allUnits
    .map((unit) => {
      const standard = STANDARD_UNITS[unit.code] ?? null;
      return `(${sqlString(unit.code)}, ${sqlString(unit.name)}, ${sqlString(standard?.dimension ?? null)}, ${sqlBool(standard != null)}, ${sqlNumber(standard?.standardFactor ?? null)})`;
    })
    .join(",\n    ");
  const categoryValues = categories
    .map((category, index) => `(${sqlString(category)}, ${index * 10})`)
    .join(",\n    ");
  const ingredientUnitValues = ingredients
    .flatMap((ingredient) => {
      const base = ingredient.units.find((unit) => unit.isBase);
      if (!base) throw new Error(`Missing base unit: ${ingredient.name}`);
      return ingredient.units.map(
        (unit, sortOrder) =>
          `(${ingredient.id}, ${sqlString(unit.code)}, ${unit.factor}, ${sqlBool(unit.isBase)}, ${sortOrder}, ${sqlString(base.code)})`,
      );
    })
    .join(",\n    ");
  const recipeValues = recipes
    .map(
      (row) =>
        `(${row.finishedGoodId}, ${row.ingredientId}, ${row.quantity}, ${sqlString(row.unitCode)}, ${row.yieldFactor}, ${sqlString(row.note)})`,
	    )
	    .join(",\n    ");
  const productionRecipeSql = options.catalogOnly
    ? "-- production_recipes intentionally not re-imported in catalog-only mode."
    : `WITH recipe_rows(finished_good_id, ingredient_id, quantity, unit_code, yield_factor, note) AS (
  VALUES
    ${recipeValues}
)
INSERT INTO public.production_recipes (
  tenant_id, finished_good_id, ingredient_id, quantity,
  yield_factor, note, entry_unit_id
)
SELECT
  t.id,
  r.finished_good_id,
  r.ingredient_id,
  r.quantity,
  r.yield_factor,
  r.note,
  u.id
FROM target_tenants t
JOIN recipe_rows r ON TRUE
JOIN public.units u ON u.tenant_id = t.id AND u.code = r.unit_code;`;

  return `-- Generated inventory reset/import SQL.
-- Review manifest.json before applying. This resets Inventory master data and operational data.
BEGIN;

CREATE TEMP TABLE target_tenants ON COMMIT DROP AS
SELECT id FROM public.tenants;

DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM target_tenants;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'inventory_reseed_requires_single_tenant';
  END IF;
END $$;

${[...OPERATIONAL_DELETE_TABLES, ...NON_TENANT_DELETE_TABLES]
  .map((table) => deleteSql(table))
  .join("\n")}
${MASTER_DELETE_TABLES.map((table) => deleteSql(table)).join("\n")}

${resetIdentitySql([...OPERATIONAL_DELETE_TABLES, ...NON_TENANT_DELETE_TABLES, ...MASTER_DELETE_TABLES])}

WITH unit_rows(code, name, dimension, is_standard, standard_factor) AS (
  VALUES
    ${unitValues}
)
INSERT INTO public.units (tenant_id, code, name, dimension, is_standard, standard_factor, is_active)
SELECT t.id, u.code, u.name, u.dimension, u.is_standard, u.standard_factor, TRUE
FROM target_tenants t
CROSS JOIN unit_rows u;

WITH category_rows(name, sort_order) AS (
  VALUES
    ${categoryValues}
)
INSERT INTO public.ingredient_categories (tenant_id, name, sort_order, is_active)
SELECT t.id, c.name, c.sort_order, TRUE
FROM target_tenants t
CROSS JOIN category_rows c;

WITH ingredient_rows(id, name, sku, category, item_kind, storage_type, unit_cost, min_stock_level, max_stock_level, reorder_point, is_active) AS (
  VALUES
    ${ingredientValues}
)
INSERT INTO public.ingredients (
  id, tenant_id, name, sku, unit_cost, category, min_stock_level,
  max_stock_level, reorder_point, storage_type,
  is_active, item_kind, review_override, category_id
)
OVERRIDING SYSTEM VALUE
SELECT
  i.id, t.id, i.name, i.sku, i.unit_cost::numeric, i.category, i.min_stock_level::numeric,
  i.max_stock_level::numeric, i.reorder_point::numeric, i.storage_type,
  i.is_active, i.item_kind, NULL, c.id
FROM target_tenants t
CROSS JOIN ingredient_rows i
LEFT JOIN public.ingredient_categories c
  ON c.tenant_id = t.id AND c.name = i.category;

WITH ingredient_unit_rows(ingredient_id, unit_code, to_base_factor, is_base, sort_order, base_unit_code) AS (
  VALUES
    ${ingredientUnitValues}
)
INSERT INTO public.ingredient_units (
  tenant_id, ingredient_id, unit_id, to_base_factor, is_base,
  sort_order, is_active, anchor_unit_id, anchor_factor
)
SELECT
  t.id,
  r.ingredient_id,
  u.id,
  r.to_base_factor,
  r.is_base,
  r.sort_order,
  TRUE,
  CASE WHEN r.is_base THEN NULL ELSE base_u.id END,
  CASE WHEN r.is_base THEN NULL ELSE r.to_base_factor END
FROM target_tenants t
JOIN ingredient_unit_rows r ON TRUE
JOIN public.units u ON u.tenant_id = t.id AND u.code = r.unit_code
JOIN public.units base_u ON base_u.tenant_id = t.id AND base_u.code = r.base_unit_code;

${productionRecipeSql}

${setIdentityToMaxSql("units")}
${setIdentityToMaxSql("ingredient_categories")}
${setIdentityToMaxSql("ingredients")}
${setIdentityToMaxSql("ingredient_units")}
${setIdentityToMaxSql("production_recipes")}

COMMIT;
`;
}

async function run(args: Args) {
  const ingredientsPath = expandPath(args.ingredients);
  const recipesPath = expandPath(args.productionRecipes);
  const outDir = resolveInsideRepo(args.out);
  const ingredientRows = parseCsv(await readFile(ingredientsPath, "utf8"));
  const recipeRows = args.catalogOnly
    ? []
    : parseCsv(await readFile(recipesPath, "utf8"));
  const ingredients = readIngredients(ingredientRows);
  const overrideWarnings = applyCatalogOverrides(ingredients);
  const sourceMaxIngredientId = Math.max(
    ...ingredientRows.map((row) => Number(row["id"])),
  );
  const addedIngredientNames = new Set(
    ingredients
      .filter((row) => row.id > sourceMaxIngredientId)
      .map((row) => row.name),
  );
  const recipes = args.catalogOnly ? [] : readRecipes(recipeRows);
  const { issues, warnings } = validate(ingredients, recipes);

  if (issues.length > 0) {
    throw new Error(`CSV validation failed:\n${issues.map((i) => `${i.file}:${i.row} ${i.message}`).join("\n")}`);
  }

  if (args.catalogOnly) {
    renumberIngredientIds(ingredients);
  }

  const categories = [...new Set(ingredients.map((row) => row.category))];
  const unitCodes = new Set(
    ingredients.flatMap((ingredient) => ingredient.units.map((unit) => unit.code)),
  );
  const manifest = {
	    generated_at: new Date().toISOString(),
	    mode: args.catalogOnly ? "catalog_only_dry_run" : "dry_run",
	    source_files: {
	      ingredients: ingredientsPath,
	      production_recipes: args.catalogOnly ? null : recipesPath,
	    },
	    warnings: [
	      ...overrideWarnings,
	      ...warnings,
	      args.catalogOnly
	        ? "catalog-only mode renumbers ingredient ids from 1 and resets inventory table identity sequences."
	        : "ingredient ids are preserved from source CSV to keep production recipe references stable.",
	      args.catalogOnly
	        ? "public.recipes and public.production_recipes are reset and intentionally not re-imported."
	        : "public.recipes is reset but not re-imported because no menu recipe CSV was provided.",
	      "stock quantities are reset; ton_kho_theo_chi_nhanh is intentionally not imported.",
	    ],
    counts: {
      source_ingredient_rows: ingredientRows.length,
	      output_ingredients: ingredients.length,
	      categories: categories.length,
	      units: unitCodes.size,
	      source_production_recipe_rows: recipeRows.length,
	      production_recipe_lines: recipes.length,
	      production_recipe_groups: new Set(recipes.map((row) => row.finishedGoodId)).size,
    },
	    added_ingredients: ingredients
	      .filter((row) => addedIngredientNames.has(row.name))
	      .map((row) => ({ id: row.id, name: row.name })),
    delete_tables: [
      ...OPERATIONAL_DELETE_TABLES,
      ...NON_TENANT_DELETE_TABLES,
      ...MASTER_DELETE_TABLES,
    ],
  };

	  await mkdir(outDir, { recursive: true });
	  await writeFile(path.join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
	  await writeFile(
	    path.join(outDir, "inventory-reseed.sql"),
	    buildSql(ingredients, recipes, { catalogOnly: args.catalogOnly }),
	  );
  console.log(JSON.stringify({ outDir, manifest }, null, 2));
}

function selfTest() {
  assert.deepEqual(parseCsv("a,b\n1,2\n")[0], { a: "1", b: "2" });
  assert.deepEqual(parseCsv('a,b\n"1,1","x""y"\n')[0], { a: "1,1", b: 'x"y' });
  assert.equal(parseNumber("1,234.50"), 1234.5);
  assert.equal(
    parseUnits("kg(base)=f1.000 | phần=f0.1", "x", 2)[1]?.code,
    "portion",
  );
  const sampleIngredients = readIngredients([
    {
      id: "1",
      ten_nguyen_lieu: "A",
      phan_loai: "raw_material",
      danh_muc: "B",
      storage_type: "ambient",
      unit_cost: "1",
      active: "TRUE",
      min_stock: "0",
      max_stock: "",
      reorder_point: "",
      danh_sach_don_vi: "kg(base)=f1.000000000000 | g=f0.001000000000",
    },
  ]);
  assert.equal(sampleIngredients[0]?.units.length, 2);
  assert.match(buildSql(sampleIngredients, []), /DELETE FROM public\.ingredients/);
  assert.doesNotMatch(
    buildSql(sampleIngredients, [], { catalogOnly: true }),
    /INSERT INTO public\.production_recipes/,
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
