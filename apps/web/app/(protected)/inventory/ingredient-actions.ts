"use server";

import { z } from "zod";
import type { Database } from "@comtammatu/database";
import type { ActionResult } from "@comtammatu/shared/types";
import { VALIDATION_VI } from "@comtammatu/shared/messages";
import { getVNDateString } from "@comtammatu/shared/time";
import {
  INVENTORY_CATALOG_ROLES,
  INVENTORY_OPS_ROLES,
} from "@comtammatu/shared/auth";
import {
  getAuthContext,
  getAuthContextWithAnyPermission,
} from "./_lib/auth";
import { withAction } from "@/_lib/with-action";
import { CATALOG_MANAGE_PERMISSIONS } from "./_lib/catalog-permissions";
import {
  STORAGE_TYPE_BY_LABEL,
  ITEM_KIND_BY_LABEL,
  STORAGE_LABELS,
  ITEM_KIND_LABELS,
  PG_ERR,
} from "./_lib/constants";
import type {
  CategoryOption,
  IngredientUnitRow,
  UnitOption,
} from "./_lib/types";
import { fetchUnits } from "./settings/units/units-actions";
import { fetchCategories } from "./settings/categories/categories-actions";
import {
  buildCsv,
  buildXlsx,
  bufferToBase64,
  MAX_ROWS_PER_SHEET,
  parseSpreadsheetFile,
  stringToBase64,
  type SheetDef,
} from "@/_lib/spreadsheet";

/* ─── Ingredient catalog (CRUD via upsert_ingredient_catalog RPC) ─── */

const unitRowSchema = z.object({
  unit_id: z.coerce.number().int().positive({ error: "Đơn vị không hợp lệ" }),
  to_base_factor: z.coerce
    .number()
    .positive({ error: "Hệ số quy đổi phải lớn hơn 0" }),
  is_base: z.boolean(),
  allow_purchase: z.boolean(),
  allow_issue: z.boolean(),
  allow_production: z.boolean(),
});

const ingredientBaseSchema = z.object({
  name: z.string().trim().min(1, { error: VALIDATION_VI.required("Tên nguyên liệu") }),
  sku: z.string().trim().optional(),
  category_id: z.coerce.number().int().positive().nullable().optional(),
  unit_cost: z.coerce.number().min(0).optional(),
  item_kind: z.enum(["raw_material", "finished_good"]).default("raw_material"),
  min_stock_level: z.coerce.number().min(0).default(0),
  max_stock_level: z.coerce.number().min(0).optional(),
  reorder_point: z.coerce.number().min(0).optional(),
  storage_type: z
    .enum(["ambient", "refrigerated", "frozen"])
    .default("ambient"),
  shelf_life_days: z.coerce.number().int().positive().optional(),
  units: z.array(unitRowSchema).min(1, { error: "Cần ít nhất 1 đơn vị" }),
});

function refineUnits(
  units: z.infer<typeof unitRowSchema>[],
  ctx: z.RefinementCtx,
) {
  const baseRows = units.filter((u) => u.is_base);
  if (baseRows.length !== 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["units"],
      message: "Phải có đúng 1 đơn vị gốc",
    });
  }
  const baseRow = baseRows[0];
  if (baseRow && baseRow.to_base_factor !== 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["units"],
      message: "Đơn vị gốc phải có hệ số = 1",
    });
  }
  const unitIds = units.map((u) => u.unit_id);
  if (new Set(unitIds).size !== unitIds.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["units"],
      message: "Đơn vị không được trùng nhau",
    });
  }
}

const ingredientCreateSchema = ingredientBaseSchema.superRefine((data, ctx) => {
  refineUnits(data.units, ctx);
});

const ingredientUpdateSchema = ingredientBaseSchema.superRefine((data, ctx) => {
  refineUnits(data.units, ctx);
});

type IngredientInput = z.infer<typeof ingredientBaseSchema>;

function mapCatalogRpcError(code: string | undefined): string {
  switch (code) {
    case PG_ERR.INSUFFICIENT_PRIVILEGE:
      return "Không có quyền";
    case PG_ERR.CHECK_VIOLATION:
      return "Dữ liệu đơn vị không hợp lệ";
    case PG_ERR.FK_VIOLATION:
      return "Đơn vị gốc không hợp lệ";
    case PG_ERR.UNIQUE_VIOLATION:
      return "Tên/đơn vị bị trùng";
    default:
      return "Không thể lưu nguyên liệu.";
  }
}

function buildRpcUnits(units: IngredientInput["units"]) {
  return units.map((u, index) => ({
    unit_id: u.unit_id,
    to_base_factor: u.is_base ? 1 : u.to_base_factor,
    is_base: u.is_base,
    allow_purchase: u.allow_purchase,
    allow_issue: u.allow_issue,
    allow_production: u.allow_production,
    sort_order: index,
  }));
}

type UpsertCatalogArgs =
  Database["public"]["Functions"]["upsert_ingredient_catalog"]["Args"];

// The RPC accepts NULL for the nullable params (p_ingredient_id, p_category_id,
// thresholds, …) but the generated Args type marks them non-nullable. Cast the
// nullable scalars through `never` to satisfy the call signature.
function rpcCatalogArgs(
  ingredientId: number | null,
  data: IngredientInput,
): UpsertCatalogArgs {
  return {
    p_ingredient_id: ingredientId as never,
    p_name: data.name,
    p_sku: (data.sku?.trim() ? data.sku.trim() : null) as never,
    p_category_id: (data.category_id ?? null) as never,
    p_unit_cost: (data.unit_cost ?? null) as never,
    p_item_kind: data.item_kind,
    p_storage_type: data.storage_type,
    p_min_stock_level: data.min_stock_level,
    p_max_stock_level: (data.max_stock_level ?? null) as never,
    p_reorder_point: (data.reorder_point ?? null) as never,
    p_shelf_life_days: (data.shelf_life_days ?? null) as never,
    p_units: buildRpcUnits(data.units) as never,
  };
}

/* ─── fetchIngredients (full catalog — SM manages it; ops view by workflow) ─── */

export async function fetchIngredients(limit = 2000): Promise<ActionResult> {
  const ctx = await getAuthContext(INVENTORY_OPS_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 5000);

  const { data, error } = await supabase
    .from("ingredients")
    .select(
      "*, ingredient_categories(name), ingredient_units(id, unit_id, to_base_factor, is_base, allow_purchase, allow_issue, allow_production, sort_order, units(code))",
    )
    .eq("tenant_id", claims.tenant_id)
    .order("name")
    .limit(safeLimit);

  if (error) {
    return { success: false, error: "Không thể tải danh sách nguyên liệu." };
  }

  const rows = (data ?? []).map((row) => {
    const { ingredient_categories, ingredient_units, ...rest } = row;
    const units: IngredientUnitRow[] = (ingredient_units ?? [])
      .map((u) => ({
        id: u.id,
        unit_id: u.unit_id,
        unit_code: u.units?.code ?? "",
        to_base_factor: Number(u.to_base_factor ?? 1),
        is_base: u.is_base,
        allow_purchase: u.allow_purchase,
        allow_issue: u.allow_issue,
        allow_production: u.allow_production,
        sort_order: u.sort_order,
      }))
      .sort((a, b) => a.sort_order - b.sort_order);

    return {
      ...rest,
      category_name: ingredient_categories?.name ?? null,
      units,
    };
  });

  return { success: true, data: rows };
}

/* ─── Option fetchers for the dialog dropdowns ─── */

export async function fetchUnitOptions(): Promise<ActionResult<UnitOption[]>> {
  const result = await fetchUnits();
  if (!result.success) return result;
  const options = (result.data ?? [])
    .filter((u) => u.is_active)
    .map((u) => ({ id: u.id, code: u.code, name: u.name }));
  return { success: true, data: options };
}

export async function fetchCategoryOptions(): Promise<
  ActionResult<CategoryOption[]>
> {
  const result = await fetchCategories();
  if (!result.success) return result;
  const options = (result.data ?? [])
    .filter((c) => c.is_active)
    .map((c) => ({ id: c.id, name: c.name, tone_class: c.tone_class }));
  return { success: true, data: options };
}

/* ─── createIngredient ─── */

export const createIngredient = withAction<typeof ingredientCreateSchema, { id: number }>(
  {
    roles: INVENTORY_CATALOG_ROLES,
    schema: ingredientCreateSchema,
    anyPermission: CATALOG_MANAGE_PERMISSIONS,
  },
  async (data, { supabase }) => {
    const { data: id, error } = await supabase.rpc(
      "upsert_ingredient_catalog",
      rpcCatalogArgs(null, data),
    );

    if (error) {
      return { success: false, error: mapCatalogRpcError(error.code) };
    }

    return { success: true, data: { id: Number(id) } };
  },
);

/* ─── quickCreateIngredient (free-text unit/category from production BOM) ─── */

const quickCreateSchema = z.object({
  name: z.string().trim().min(1, { error: VALIDATION_VI.required("Tên") }),
  unit: z.string().trim().min(1, { error: VALIDATION_VI.required("Đơn vị") }),
  category: z.string().trim().optional(),
  item_kind: z.enum(["raw_material", "finished_good"]),
  storage_type: z.enum(["ambient", "refrigerated", "frozen"]),
});

export const quickCreateIngredient = withAction<
  typeof quickCreateSchema,
  { id: number }
>(
  {
    roles: INVENTORY_CATALOG_ROLES,
    schema: quickCreateSchema,
    anyPermission: CATALOG_MANAGE_PERMISSIONS,
  },
  async (data, { supabase, claims }) => {
    const unitCode = data.unit.trim();

    const { data: existingUnit } = await supabase
      .from("units")
      .select("id")
      .eq("tenant_id", claims.tenant_id)
      .eq("code", unitCode)
      .maybeSingle();

    let unitId: number;
    if (existingUnit) {
      unitId = existingUnit.id;
    } else {
      const { data: insertedUnit, error: unitErr } = await supabase
        .from("units")
        .insert({
          tenant_id: claims.tenant_id,
          code: unitCode,
          name: unitCode,
          is_active: true,
        })
        .select("id")
        .single();
      if (unitErr || !insertedUnit) {
        return { success: false, error: "Không thể tạo đơn vị mới." };
      }
      unitId = insertedUnit.id;
    }

    let categoryId: number | null = null;
    const categoryName = data.category?.trim();
    if (categoryName) {
      const { data: existingCat } = await supabase
        .from("ingredient_categories")
        .select("id")
        .eq("tenant_id", claims.tenant_id)
        .eq("name", categoryName)
        .maybeSingle();
      if (existingCat) {
        categoryId = existingCat.id;
      } else {
        const { data: insertedCat } = await supabase
          .from("ingredient_categories")
          .insert({ tenant_id: claims.tenant_id, name: categoryName })
          .select("id")
          .single();
        categoryId = insertedCat?.id ?? null;
      }
    }

    const { data: id, error } = await supabase.rpc(
      "upsert_ingredient_catalog",
      rpcCatalogArgs(null, {
        name: data.name,
        category_id: categoryId,
        item_kind: data.item_kind,
        storage_type: data.storage_type,
        min_stock_level: 0,
        units: [
          {
            unit_id: unitId,
            to_base_factor: 1,
            is_base: true,
            allow_purchase: true,
            allow_issue: true,
            allow_production: true,
          },
        ],
      }),
    );

    if (error) {
      return { success: false, error: mapCatalogRpcError(error.code) };
    }

    return { success: true, data: { id: Number(id) } };
  },
);

/* ─── updateIngredient ─── */

export async function updateIngredient(
  id: number,
  input: Partial<IngredientInput>,
): Promise<ActionResult> {
  const idSchema = z.coerce.number().int().positive();
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) {
    return { success: false, error: "ID không hợp lệ" };
  }

  const parsedInput = ingredientUpdateSchema.safeParse(input);
  if (!parsedInput.success) {
    return {
      success: false,
      error: parsedInput.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const ctx = await getAuthContextWithAnyPermission(
    INVENTORY_CATALOG_ROLES,
    CATALOG_MANAGE_PERMISSIONS,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase } = ctx;

  const { error } = await supabase.rpc(
    "upsert_ingredient_catalog",
    rpcCatalogArgs(parsedId.data, parsedInput.data),
  );

  if (error) {
    return { success: false, error: mapCatalogRpcError(error.code) };
  }

  return { success: true };
}

/* ─── toggleIngredientActive ─── */

const toggleIngredientIdSchema = z.object({
  id: z.coerce.number().int().positive({ error: "ID không hợp lệ" }),
});

export const toggleIngredientActive = withAction(
  {
    roles: INVENTORY_CATALOG_ROLES,
    schema: toggleIngredientIdSchema,
    anyPermission: CATALOG_MANAGE_PERMISSIONS,
  },
  async (data, { supabase }) => {
    const { error } = await supabase.rpc("toggle_ingredient_active", {
      p_id: data.id,
    });
    if (error) {
      if (error.message?.includes("not_found")) {
        return { success: false, error: "Nguyên liệu không tồn tại." };
      }
      return { success: false, error: "Không thể đổi trạng thái nguyên liệu." };
    }
    return { success: true };
  },
);

/* ─── Export ─── */

interface ExportIngredientRow {
  name: string;
  sku: string | null;
  purchase_unit: string;
  measure_unit: string;
  purchase_to_measure_factor: number;
  category: string | null;
  item_kind: string;
  unit_cost: number | null;
  min_stock_level: number;
  max_stock_level: number | null;
  reorder_point: number | null;
  storage_type: string;
  shelf_life_days: number | null;
  is_active: boolean;
  units: {
    unit_code: string;
    to_base_factor: number;
    is_base: boolean;
    allow_purchase: boolean;
    allow_issue: boolean;
    allow_production: boolean;
  }[];
}

function buildIngredientSheets(rows: ExportIngredientRow[]): SheetDef[] {
  return [
    {
      name: "Nguyen lieu",
      columns: [
        { header: "Tên nguyên liệu", key: "name", width: 32 },
        { header: "SKU", key: "sku", width: 14 },
        { header: "Đơn vị nhập", key: "purchase_unit", width: 14 },
        { header: "Đơn vị tính", key: "measure_unit", width: 14 },
        {
          header: "Tỉ lệ quy đổi",
          key: "purchase_to_measure_factor",
          width: 16,
        },
        { header: "Danh mục", key: "category", width: 18 },
        { header: "Loại hàng", key: "item_kind_label", width: 16 },
        { header: "Giá nhập (VND)", key: "unit_cost", width: 16 },
        { header: "Tồn tối thiểu", key: "min_stock_level", width: 14 },
        { header: "Tồn tối đa", key: "max_stock_level", width: 14 },
        { header: "Điểm đặt hàng", key: "reorder_point", width: 14 },
        { header: "Bảo quản", key: "storage_label", width: 14 },
        { header: "Hạn dùng (ngày)", key: "shelf_life_days", width: 14 },
        { header: "Hoạt động", key: "is_active", width: 12 },
      ],
      rows: rows.map((r) => ({
        name: r.name,
        sku: r.sku ?? "",
        purchase_unit: r.purchase_unit,
        measure_unit: r.measure_unit,
        purchase_to_measure_factor: r.purchase_to_measure_factor,
        category: r.category ?? "",
        item_kind_label: ITEM_KIND_LABELS[r.item_kind] ?? r.item_kind,
        unit_cost: r.unit_cost ?? "",
        min_stock_level: r.min_stock_level,
        max_stock_level: r.max_stock_level ?? "",
        reorder_point: r.reorder_point ?? "",
        storage_label: STORAGE_LABELS[r.storage_type] ?? r.storage_type,
        shelf_life_days: r.shelf_life_days ?? "",
        is_active: r.is_active ? "Có" : "Không",
      })),
    },
    {
      name: "Don vi",
      columns: [
        { header: "Tên nguyên liệu", key: "ingredient_name", width: 32 },
        { header: "Mã đơn vị", key: "unit_code", width: 14 },
        { header: "Hệ số quy đổi", key: "to_base_factor", width: 16 },
        { header: "Đơn vị gốc", key: "is_base", width: 12 },
        { header: "Nhập", key: "allow_purchase", width: 10 },
        { header: "Xuất", key: "allow_issue", width: 10 },
        { header: "Sản xuất", key: "allow_production", width: 12 },
      ],
      rows: rows.flatMap((r) =>
        r.units.map((u) => ({
          ingredient_name: r.name,
          unit_code: u.unit_code,
          to_base_factor: u.to_base_factor,
          is_base: u.is_base ? "Có" : "Không",
          allow_purchase: u.allow_purchase ? "Có" : "Không",
          allow_issue: u.allow_issue ? "Có" : "Không",
          allow_production: u.allow_production ? "Có" : "Không",
        })),
      ),
    },
  ];
}

type ExportIngredientsResult =
  | {
      success: true;
      data: { filename: string; base64: string; format: "xlsx" | "csv" };
    }
  | { success: false; error: string };

export async function exportIngredients(
  format: "xlsx" | "csv" = "xlsx",
): Promise<ExportIngredientsResult> {
  const ctx = await getAuthContextWithAnyPermission(
    INVENTORY_CATALOG_ROLES,
    CATALOG_MANAGE_PERMISSIONS,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  const { data, error } = await supabase
    .from("ingredients")
    .select(
      "name, sku, purchase_unit, measure_unit, purchase_to_measure_factor, category, item_kind, unit_cost, min_stock_level, max_stock_level, reorder_point, storage_type, shelf_life_days, is_active, ingredient_units(to_base_factor, is_base, allow_purchase, allow_issue, allow_production, sort_order, units(code))",
    )
    .eq("tenant_id", claims.tenant_id)
    .order("name");

  if (error) {
    return { success: false, error: "Không thể tải nguyên liệu." };
  }

  const rows: ExportIngredientRow[] = (data ?? []).map((r) => ({
    name: r.name,
    sku: r.sku,
    purchase_unit: r.purchase_unit ?? "",
    measure_unit: r.measure_unit ?? "",
    purchase_to_measure_factor: Number(r.purchase_to_measure_factor ?? 1),
    category: r.category,
    item_kind: r.item_kind ?? "raw_material",
    unit_cost: r.unit_cost != null ? Number(r.unit_cost) : null,
    min_stock_level: Number(r.min_stock_level ?? 0),
    max_stock_level:
      r.max_stock_level != null ? Number(r.max_stock_level) : null,
    reorder_point: r.reorder_point != null ? Number(r.reorder_point) : null,
    storage_type: r.storage_type ?? "ambient",
    shelf_life_days: r.shelf_life_days,
    is_active: r.is_active ?? true,
    units: (r.ingredient_units ?? [])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((u) => ({
        unit_code: u.units?.code ?? "",
        to_base_factor: Number(u.to_base_factor ?? 1),
        is_base: u.is_base,
        allow_purchase: u.allow_purchase,
        allow_issue: u.allow_issue,
        allow_production: u.allow_production,
      })),
  }));

  const sheets = buildIngredientSheets(rows);
  const stamp = getVNDateString();

  if (format === "csv") {
    const csv = buildCsv(sheets[0]!);
    return {
      success: true,
      data: {
        filename: `nguyen-lieu-${stamp}.csv`,
        base64: stringToBase64(csv),
        format: "csv",
      },
    };
  }

  const buf = await buildXlsx(sheets);
  return {
    success: true,
    data: {
      filename: `nguyen-lieu-${stamp}.xlsx`,
      base64: bufferToBase64(buf),
      format: "xlsx",
    },
  };
}

/* ─── Import ─── */

const importIngredientRowSchema = z.object({
  name: z.string().trim().min(1, { error: "Thiếu tên" }),
  sku: z.string().trim().optional(),
  purchase_unit: z.string().trim().min(1, { error: "Thiếu đơn vị nhập" }),
  measure_unit: z.string().trim().min(1, { error: "Thiếu đơn vị tính" }),
  purchase_to_measure_factor: z.coerce
    .number()
    .positive({ error: VALIDATION_VI.positive("Tỉ lệ quy đổi") })
    .default(1),
  category: z.string().trim().optional(),
  item_kind: z.enum(["raw_material", "finished_good"]).default("raw_material"),
  unit_cost: z.coerce.number().min(0).optional(),
  min_stock_level: z.coerce.number().min(0).default(0),
  max_stock_level: z.coerce.number().min(0).optional(),
  reorder_point: z.coerce.number().min(0).optional(),
  storage_type: z
    .enum(["ambient", "refrigerated", "frozen"])
    .default("ambient"),
  shelf_life_days: z.coerce.number().int().positive().optional(),
  is_active: z.boolean().default(true),
});

type ImportRow = z.infer<typeof importIngredientRowSchema>;

function parseBool(raw: string | undefined): boolean {
  if (!raw) return true;
  const s = raw.trim().toLowerCase();
  if (["", "có", "co", "true", "1", "yes", "x"].includes(s)) return true;
  if (["không", "khong", "false", "0", "no"].includes(s)) return false;
  return true;
}

function parseOptionalNumber(raw: string | undefined): number | undefined {
  if (raw == null) return undefined;
  const s = raw.toString().trim().replace(/[,\s]/g, "");
  if (s === "") return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

export interface ImportIngredientIssue {
  row: number;
  field?: string;
  message: string;
}

export interface ImportIngredientSummary {
  inserted: number;
  updated: number;
}

type ImportIngredientsResult =
  | {
      success: true;
      data: { summary: ImportIngredientSummary };
    }
  | { success: false; error: string; issues?: ImportIngredientIssue[] };

export async function importIngredients(
  formData: FormData,
): Promise<ImportIngredientsResult> {
  const ctx = await getAuthContextWithAnyPermission(
    INVENTORY_CATALOG_ROLES,
    CATALOG_MANAGE_PERMISSIONS,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { success: false, error: "Thiếu file để import" };
  }

  let parsed;
  try {
    parsed = await parseSpreadsheetFile(file, {
      maxRowsPerSheet: MAX_ROWS_PER_SHEET,
    });
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Không đọc được file",
    };
  }

  const sheet = parsed.sheets[0];
  if (!sheet || sheet.rows.length === 0) {
    return { success: false, error: "File trống" };
  }

  const { supabase, claims } = ctx;

  const issues: ImportIngredientIssue[] = [];
  const valid: ImportRow[] = [];

  sheet.rows.forEach((raw, idx) => {
    const rowNumber = idx + 2;

    const storageRaw = raw["Bảo quản"] ?? raw["storage_type"] ?? "ambient";
    const storageKey = STORAGE_TYPE_BY_LABEL[storageRaw.trim().toLowerCase()];
    if (!storageKey) {
      issues.push({
        row: rowNumber,
        field: "Bảo quản",
        message: `Kiểu bảo quản không hợp lệ: "${storageRaw}"`,
      });
      return;
    }

    const kindRaw = raw["Loại hàng"] ?? raw["item_kind"] ?? "raw_material";
    const kindKey = ITEM_KIND_BY_LABEL[kindRaw.trim().toLowerCase()];
    if (!kindKey) {
      issues.push({
        row: rowNumber,
        field: "Loại hàng",
        message: `Loại hàng không hợp lệ: "${kindRaw}"`,
      });
      return;
    }

    const unitCost = parseOptionalNumber(
      raw["Giá nhập (VND)"] ?? raw["unit_cost"],
    );
    const maxStock = parseOptionalNumber(
      raw["Tồn tối đa"] ?? raw["max_stock_level"],
    );
    const reorder = parseOptionalNumber(
      raw["Điểm đặt hàng"] ?? raw["reorder_point"],
    );
    const shelfLife = parseOptionalNumber(
      raw["Hạn dùng (ngày)"] ?? raw["shelf_life_days"],
    );
    const conversionRaw =
      raw["Tỉ lệ quy đổi"] ?? raw["purchase_to_measure_factor"];

    const parsedRow = importIngredientRowSchema.safeParse({
      name: raw["Tên nguyên liệu"] ?? raw["name"],
      sku: (raw["SKU"] ?? raw["sku"] ?? "").trim() || undefined,
      purchase_unit: raw["Đơn vị nhập"] ?? raw["purchase_unit"],
      measure_unit: raw["Đơn vị tính"] ?? raw["measure_unit"],
      purchase_to_measure_factor:
        conversionRaw && conversionRaw.trim() ? conversionRaw : undefined,
      category: (raw["Danh mục"] ?? raw["category"] ?? "").trim() || undefined,
      item_kind: kindKey,
      unit_cost: unitCost,
      min_stock_level:
        parseOptionalNumber(raw["Tồn tối thiểu"] ?? raw["min_stock_level"]) ??
        0,
      max_stock_level: maxStock,
      reorder_point: reorder,
      storage_type: storageKey,
      shelf_life_days: shelfLife,
      is_active: parseBool(raw["Hoạt động"] ?? raw["is_active"]),
    });

    if (!parsedRow.success) {
      issues.push({
        row: rowNumber,
        field: parsedRow.error.issues[0]?.path.join("."),
        message: parsedRow.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
      });
      return;
    }

    valid.push(parsedRow.data);
  });

  if (issues.length > 0) {
    return {
      success: false,
      error: `Có ${issues.length} dòng lỗi. Vui lòng sửa và thử lại.`,
      issues,
    };
  }

  if (valid.length === 0) {
    return { success: false, error: "Không có dòng hợp lệ nào để import" };
  }

  // Resolve / create the unit codes and category names referenced by the
  // import so the RPC can map them to ids.
  const unitCodes = new Set<string>();
  const categoryNames = new Set<string>();
  for (const row of valid) {
    unitCodes.add(row.purchase_unit);
    unitCodes.add(row.measure_unit);
    if (row.category) categoryNames.add(row.category);
  }

  const unitIdByCode = new Map<string, number>();
  {
    const { data: existingUnits, error: unitsErr } = await supabase
      .from("units")
      .select("id, code")
      .eq("tenant_id", claims.tenant_id);
    if (unitsErr) {
      return { success: false, error: "Không thể đọc danh mục đơn vị." };
    }
    for (const u of existingUnits ?? []) unitIdByCode.set(u.code, u.id);

    const missingUnits = [...unitCodes].filter(
      (code) => !unitIdByCode.has(code),
    );
    if (missingUnits.length > 0) {
      const { data: insertedUnits, error: insertUnitsErr } = await supabase
        .from("units")
        .insert(
          missingUnits.map((code) => ({
            tenant_id: claims.tenant_id,
            code,
            name: code,
            is_active: true,
          })),
        )
        .select("id, code");
      if (insertUnitsErr) {
        if (insertUnitsErr.code === PG_ERR.INSUFFICIENT_PRIVILEGE) {
          return {
            success: false,
            error: "Không có quyền tạo đơn vị mới khi import.",
          };
        }
        return { success: false, error: "Không thể tạo đơn vị mới khi import." };
      }
      for (const u of insertedUnits ?? []) unitIdByCode.set(u.code, u.id);
    }
  }

  const categoryIdByName = new Map<string, number>();
  if (categoryNames.size > 0) {
    const { data: existingCats, error: catsErr } = await supabase
      .from("ingredient_categories")
      .select("id, name")
      .eq("tenant_id", claims.tenant_id);
    if (catsErr) {
      return { success: false, error: "Không thể đọc danh mục nhóm." };
    }
    for (const c of existingCats ?? []) categoryIdByName.set(c.name, c.id);

    const missingCats = [...categoryNames].filter(
      (name) => !categoryIdByName.has(name),
    );
    if (missingCats.length > 0) {
      const { data: insertedCats, error: insertCatsErr } = await supabase
        .from("ingredient_categories")
        .insert(
          missingCats.map((name) => ({
            tenant_id: claims.tenant_id,
            name,
          })),
        )
        .select("id, name");
      if (insertCatsErr) {
        if (insertCatsErr.code === PG_ERR.INSUFFICIENT_PRIVILEGE) {
          return {
            success: false,
            error: "Không có quyền tạo nhóm mới khi import.",
          };
        }
        return { success: false, error: "Không thể tạo nhóm mới khi import." };
      }
      for (const c of insertedCats ?? []) categoryIdByName.set(c.name, c.id);
    }
  }

  // Names already present → counted as updates (the RPC upserts on name).
  const { data: existing } = await supabase
    .from("ingredients")
    .select("name")
    .eq("tenant_id", claims.tenant_id);
  const existingNames = new Set((existing ?? []).map((r) => r.name));

  const summary: ImportIngredientSummary = { inserted: 0, updated: 0 };

  for (let i = 0; i < valid.length; i++) {
    const row = valid[i]!;
    const rowNumber = i + 2;
    const baseUnitId = unitIdByCode.get(row.purchase_unit);
    if (baseUnitId == null) {
      issues.push({
        row: rowNumber,
        field: "Đơn vị nhập",
        message: `Không tìm thấy đơn vị "${row.purchase_unit}".`,
      });
      continue;
    }

    const units: {
      unit_id: number;
      to_base_factor: number;
      is_base: boolean;
      allow_purchase: boolean;
      allow_issue: boolean;
      allow_production: boolean;
      sort_order: number;
    }[] = [
      {
        unit_id: baseUnitId,
        to_base_factor: 1,
        is_base: true,
        allow_purchase: true,
        allow_issue: true,
        allow_production: false,
        sort_order: 0,
      },
    ];

    if (row.measure_unit !== row.purchase_unit) {
      const measureUnitId = unitIdByCode.get(row.measure_unit);
      if (measureUnitId == null) {
        issues.push({
          row: rowNumber,
          field: "Đơn vị tính",
          message: `Không tìm thấy đơn vị "${row.measure_unit}".`,
        });
        continue;
      }
      units.push({
        unit_id: measureUnitId,
        to_base_factor: 1 / row.purchase_to_measure_factor,
        is_base: false,
        allow_purchase: false,
        allow_issue: false,
        allow_production: true,
        sort_order: 1,
      });
    }

    const { error: rpcErr } = await supabase.rpc(
      "upsert_ingredient_catalog",
      rpcCatalogArgs(null, {
        name: row.name,
        sku: row.sku,
        category_id: row.category
          ? (categoryIdByName.get(row.category) ?? null)
          : null,
        unit_cost: row.unit_cost,
        item_kind: row.item_kind,
        storage_type: row.storage_type,
        min_stock_level: row.min_stock_level,
        max_stock_level: row.max_stock_level,
        reorder_point: row.reorder_point,
        shelf_life_days: row.shelf_life_days,
        units: units.map((u) => ({
          unit_id: u.unit_id,
          to_base_factor: u.to_base_factor,
          is_base: u.is_base,
          allow_purchase: u.allow_purchase,
          allow_issue: u.allow_issue,
          allow_production: u.allow_production,
        })),
      }),
    );

    if (rpcErr) {
      issues.push({
        row: rowNumber,
        message: mapCatalogRpcError(rpcErr.code),
      });
      continue;
    }

    if (existingNames.has(row.name)) summary.updated += 1;
    else {
      summary.inserted += 1;
      existingNames.add(row.name);
    }
  }

  if (issues.length > 0) {
    return {
      success: false,
      error: `Có ${issues.length} dòng lỗi khi ghi. Vui lòng kiểm tra và thử lại.`,
      issues,
    };
  }

  return { success: true, data: { summary } };
}

export async function downloadIngredientTemplate(): Promise<ActionResult> {
  const ctx = await getAuthContextWithAnyPermission(
    INVENTORY_CATALOG_ROLES,
    CATALOG_MANAGE_PERMISSIONS,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const sheets = buildIngredientSheets([
    {
      name: "Nước mắm chai (ví dụ)",
      sku: "NM-001",
      purchase_unit: "chai",
      measure_unit: "ml",
      purchase_to_measure_factor: 250,
      category: "Gia vị",
      item_kind: "raw_material",
      unit_cost: 18000,
      min_stock_level: 1000,
      max_stock_level: 10000,
      reorder_point: 2000,
      storage_type: "ambient",
      shelf_life_days: 365,
      is_active: true,
      units: [
        {
          unit_code: "chai",
          to_base_factor: 1,
          is_base: true,
          allow_purchase: true,
          allow_issue: true,
          allow_production: false,
        },
        {
          unit_code: "ml",
          to_base_factor: 1 / 250,
          is_base: false,
          allow_purchase: false,
          allow_issue: false,
          allow_production: true,
        },
      ],
    },
  ]);

  const buf = await buildXlsx(sheets);
  return {
    success: true,
    data: {
      filename: "nguyen-lieu-template.xlsx",
      base64: bufferToBase64(buf),
      format: "xlsx" as const,
    },
  };
}
