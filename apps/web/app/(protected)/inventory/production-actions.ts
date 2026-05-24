"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@comtammatu/shared/types";
import { PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { getVNDateString } from "@comtammatu/shared/time";
import {
  getAuthContextWithAnyPermission,
  getAuthContextWithPermission,
} from "./_lib/auth";
import { withAction } from "@/_lib/with-action";
import { PG_ERR } from "./_lib/constants";
import {
  isProductionBranchScopedRole,
  PRODUCTION_OPERATOR_ROLES,
} from "./_lib/production-roles";
import {
  buildCsv,
  buildXlsx,
  bufferToBase64,
  MAX_ROWS_PER_SHEET,
  parseSpreadsheetFile,
  stringToBase64,
  type SheetDef,
} from "@/_lib/spreadsheet";
import { PRODUCTION_ERROR_CODES } from "./production-types";
import type { ProductionShortageRow } from "./production-types";

/**
 * Route-level fast gate for the production (central kitchen) surface. Fine-grained
 * authz is enforced at RLS via `has_permission(branch_id, 'inventory:production_create' |
 * 'inventory:production_confirm')` and `has_permission_any('menu:write')` — so this
 * list only controls "who can reach the surface at all".
 *
 * Manual permission grants do not broaden this role contract: production is
 * operated by owner/super_manager/production_manager only.
 */
const PRODUCTION_ROLES = PRODUCTION_OPERATOR_ROLES;

const PRODUCTION_ORDER_PERMISSIONS = [
  PERMISSION_KEYS.INVENTORY_PRODUCTION_CREATE,
  PERMISSION_KEYS.INVENTORY_PRODUCTION_CONFIRM,
] as const;

const PRODUCTION_RECIPE_READ_PERMISSIONS = [
  PERMISSION_KEYS.MENU_READ,
  PERMISSION_KEYS.MENU_WRITE,
] as const;

/**
 * Roles whose operational context is a single branch and therefore must be
 * pinned to a `central_kitchen` branch when acting on production surfaces.
 * Tenant-wide roles (owner, super_manager) bypass this check because their
 * scope is broader than a single site.
 */
const isCentralKitchenScopedRole = isProductionBranchScopedRole;

const productionLineSchema = z.object({
  finishedGoodId: z.coerce.number().int().positive(),
  quantity: z.coerce.number().positive(),
  unit: z.string().min(1, { error: "Đơn vị không được để trống" }),
});

const productionRecipeSchema = z.object({
  finishedGoodId: z.coerce.number().int().positive(),
  ingredientId: z.coerce.number().int().positive(),
  quantity: z.coerce.number().positive(),
  unit: z.string().min(1, { error: "Đơn vị không được để trống" }),
  yieldFactor: z.coerce.number().positive().default(1),
  note: z.string().optional(),
});

const productionRecipeLineUpsertSchema = z.object({
  ingredientId: z.coerce.number().int().positive(),
  quantity: z.coerce.number().positive(),
  unit: z.string().min(1, { error: "Đơn vị không được để trống" }),
  yieldFactor: z.coerce.number().positive().default(1),
  note: z.string().optional(),
});

const productionRecipeLinesSchema = z
  .object({
    finishedGoodId: z.coerce.number().int().positive(),
    lines: z.array(productionRecipeLineUpsertSchema).min(1, {
      error: "Cần ít nhất một nguyên liệu trong BOM.",
    }),
  })
  .superRefine((value, ctx) => {
    const seen = new Set<number>();
    value.lines.forEach((line, index) => {
      if (seen.has(line.ingredientId)) {
        ctx.addIssue({
          code: "custom",
          path: ["lines", index, "ingredientId"],
          message: "Nguyên liệu bị trùng trong BOM.",
        });
      }
      seen.add(line.ingredientId);
    });
  });

const createProductionOrderSchema = z.object({
  branchId: z.coerce.number().int().positive(),
  productionNumber: z.string().min(1, {
    error: "Số lệnh sản xuất không được để trống",
  }),
  notes: z.string().optional(),
  items: z.array(productionLineSchema).min(1, {
    error: "Cần ít nhất một thành phẩm",
  }),
});

const idSchema = z.coerce.number().int().positive();

type RpcClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{
    data: unknown;
    error: {
      code?: string;
      message?: string;
      details?: string | null;
    } | null;
  }>;
};

const productionShortageListSchema = z.array(
  z.object({
    ingredient_id: z.coerce.number().int().positive(),
    ingredient_name: z.string(),
    unit: z.string(),
    needed: z.coerce.number(),
    on_hand: z.coerce.number(),
    missing: z.coerce.number(),
  }),
);

function parseShortagesDetail(
  details: string | null | undefined,
): ProductionShortageRow[] {
  if (!details) return [];
  try {
    const parsed = JSON.parse(details);
    const result = productionShortageListSchema.safeParse(parsed);
    return result.success ? result.data : [];
  } catch {
    return [];
  }
}

type ProductionRecipeSheetRow = {
  finished_good_id: number | "";
  finished_good_name: string;
  ingredient_id: number | "";
  ingredient_name: string;
  quantity: number | "";
  unit: string;
  yield_factor: number | "";
  note: string;
};

type ExportProductionRecipesResult =
  | {
      success: true;
      data: { filename: string; base64: string; format: "xlsx" | "csv" };
    }
  | { success: false; error: string };

const importProductionRecipeRowSchema = z.object({
  finishedGoodId: z.number().int().positive(),
  ingredientId: z.number().int().positive(),
  quantity: z.number().positive({ error: "Số lượng phải lớn hơn 0" }),
  unit: z.string().trim().min(1, { error: "Thiếu đơn vị" }),
  yieldFactor: z.number().positive({ error: "Yield phải lớn hơn 0" }),
  note: z.string().trim().optional(),
});

export interface ImportProductionRecipeIssue {
  row: number;
  field?: string;
  message: string;
}

export interface ImportProductionRecipeSummary {
  recipes: number;
  lines: number;
}

type ImportProductionRecipesResult =
  | {
      success: true;
      data: { summary: ImportProductionRecipeSummary };
    }
  | {
      success: false;
      error: string;
      issues?: ImportProductionRecipeIssue[];
    };

type IngredientLookupRow = {
  id: number;
  name: string;
  unit: string;
  measure_unit: string;
  item_kind: string;
  is_active: boolean;
};

async function requireCentralKitchenBranch(
  supabase: unknown,
  tenantId: number,
  branchId: number,
) {
  const client = supabase as {
    from: (table: "branches") => {
      select: (columns: string) => {
        eq: (
          column: string,
          value: unknown,
        ) => {
          eq: (
            column: string,
            value: unknown,
          ) => {
            maybeSingle: () => PromiseLike<{
              data: { branch_kind: string | null } | null;
              error: { code?: string; message?: string } | null;
            }>;
          };
          maybeSingle: () => PromiseLike<{
            data: { branch_kind: string | null } | null;
            error: { code?: string; message?: string } | null;
          }>;
        };
      };
    };
  };

  const { data, error } = await client
    .from("branches")
    .select("branch_kind")
    .eq("tenant_id", tenantId)
    .eq("id", branchId)
    .maybeSingle();

  if (error?.code === "42703") {
    return {
      ok: false,
      error:
        "Cần áp dụng migration `branch_kind` trước khi dùng màn Bếp trung tâm.",
    };
  }

  if (error) {
    return {
      ok: false,
      error: "Không thể kiểm tra quyền truy cập bếp trung tâm.",
    };
  }

  if (data?.branch_kind !== "central_kitchen") {
    return {
      ok: false,
      error: "Chỉ bếp trung tâm mới được phép thao tác ở màn này.",
    };
  }

  return { ok: true };
}

export interface ProductionOrderItemRow {
  id: number;
  finished_good_id: number;
  finished_good_name: string;
  quantity: number;
  unit: string;
  unit_cost_at_production: number | null;
}

export interface ProductionOrderRow {
  id: number;
  branch_id: number;
  branch_name: string;
  production_number: string;
  status: string;
  notes: string | null;
  completed_at: string | null;
  created_at: string;
  items: ProductionOrderItemRow[];
  total_cost: number;
}

export interface ProductionRecipeRow {
  id: number;
  finished_good_id: number;
  finished_good_name: string;
  ingredient_id: number;
  ingredient_name: string;
  quantity: number;
  unit: string;
  yield_factor: number;
  note: string | null;
}

type ProductionRecipeQueryRow = {
  id: number;
  finished_good_id: number;
  ingredient_id: number;
  quantity: number | string;
  unit: string;
  yield_factor: number | string | null;
  note: string | null;
  finished_good: { id: number; name: string } | null;
  ingredient: { id: number; name: string } | null;
};

type ProductionRecipeQueryClient = {
  from: (table: "production_recipes") => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: unknown,
      ) => {
        order: (
          column: string,
          options?: { ascending?: boolean },
        ) => {
          order: (
            column: string,
            options?: { ascending?: boolean },
          ) => PromiseLike<{
            data: ProductionRecipeQueryRow[] | null;
            error: { code?: string; message?: string } | null;
          }>;
        };
      };
    };
  };
};

export async function fetchProductionRecipes(): Promise<
  ActionResult<ProductionRecipeRow[]>
> {
  const ctx = await getAuthContextWithAnyPermission(
    PRODUCTION_ROLES,
    PRODUCTION_RECIPE_READ_PERMISSIONS,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;
  if (isCentralKitchenScopedRole(claims.user_role)) {
    if (claims.branch_id == null) {
      return {
        success: false,
        error: "Tài khoản chưa được gán bếp trung tâm.",
      };
    }
    const access = await requireCentralKitchenBranch(
      supabase,
      claims.tenant_id,
      claims.branch_id,
    );
    if (!access.ok) {
      return { success: false, error: access.error };
    }
  }
  const recipeClient = supabase as unknown as ProductionRecipeQueryClient;
  const { data, error } = await recipeClient
    .from("production_recipes")
    .select(
      `
      id,
      finished_good_id,
      ingredient_id,
      quantity,
      unit,
      yield_factor,
      note,
      finished_good:ingredients!production_recipes_finished_good_id_fkey ( id, name ),
      ingredient:ingredients!production_recipes_ingredient_id_fkey ( id, name )
    `,
    )
    .eq("tenant_id", claims.tenant_id)
    .order("finished_good_id", { ascending: true })
    .order("ingredient_id", { ascending: true });

  if (error) {
    return { success: false, error: "Không thể tải công thức sản xuất." };
  }

  return {
    success: true,
    data:
      (data ?? []).map((row) => {
        const finishedGood = row.finished_good as {
          id: number;
          name: string;
        } | null;
        const ingredient = row.ingredient as {
          id: number;
          name: string;
        } | null;
        return {
          id: row.id,
          finished_good_id: row.finished_good_id,
          finished_good_name: finishedGood?.name ?? "Thành phẩm",
          ingredient_id: row.ingredient_id,
          ingredient_name: ingredient?.name ?? "Nguyên liệu",
          quantity: Number(row.quantity),
          unit: row.unit,
          yield_factor: Number(row.yield_factor ?? 1),
          note: row.note ?? null,
        };
      }) ?? [],
  };
}

function buildProductionRecipeSheets(
  rows: ProductionRecipeSheetRow[],
): SheetDef[] {
  return [
    {
      name: "BOM san xuat",
      columns: [
        { header: "Mã thành phẩm", key: "finished_good_id", width: 14 },
        { header: "Thành phẩm", key: "finished_good_name", width: 32 },
        { header: "Mã nguyên liệu", key: "ingredient_id", width: 14 },
        { header: "Nguyên liệu", key: "ingredient_name", width: 32 },
        { header: "Số lượng", key: "quantity", width: 14 },
        { header: "Đơn vị", key: "unit", width: 12 },
        { header: "Yield", key: "yield_factor", width: 10 },
        { header: "Ghi chú", key: "note", width: 28 },
      ],
      rows,
    },
  ];
}

function productionRecipeToSheetRow(
  recipe: ProductionRecipeRow,
): ProductionRecipeSheetRow {
  return {
    finished_good_id: recipe.finished_good_id,
    finished_good_name: recipe.finished_good_name,
    ingredient_id: recipe.ingredient_id,
    ingredient_name: recipe.ingredient_name,
    quantity: recipe.quantity,
    unit: recipe.unit,
    yield_factor: recipe.yield_factor,
    note: recipe.note ?? "",
  };
}

export async function exportProductionRecipes(
  format: "xlsx" | "csv" = "xlsx",
): Promise<ExportProductionRecipesResult> {
  const recipesRes = await fetchProductionRecipes();
  if (!recipesRes.success) {
    return {
      success: false,
      error: recipesRes.error ?? "Không thể tải BOM sản xuất.",
    };
  }

  const rows = (recipesRes.data ?? [])
    .map(productionRecipeToSheetRow)
    .sort((a, b) => {
      const byFinishedGood = a.finished_good_name.localeCompare(
        b.finished_good_name,
        "vi",
      );
      if (byFinishedGood !== 0) return byFinishedGood;
      return a.ingredient_name.localeCompare(b.ingredient_name, "vi");
    });
  const sheets = buildProductionRecipeSheets(rows);
  const stamp = getVNDateString();
  const safeFormat = format === "csv" ? "csv" : "xlsx";

  if (safeFormat === "csv") {
    const csv = buildCsv(sheets[0]!);
    return {
      success: true,
      data: {
        filename: `bom-san-xuat-${stamp}.csv`,
        base64: stringToBase64(csv),
        format: "csv",
      },
    };
  }

  const buf = await buildXlsx(sheets);
  return {
    success: true,
    data: {
      filename: `bom-san-xuat-${stamp}.xlsx`,
      base64: bufferToBase64(buf),
      format: "xlsx",
    },
  };
}

export async function downloadProductionRecipeTemplate(): Promise<
  ActionResult<{ filename: string; base64: string; format: "xlsx" }>
> {
  const ctx = await getAuthContextWithPermission(
    PRODUCTION_ROLES,
    PERMISSION_KEYS.MENU_WRITE,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const sheets = buildProductionRecipeSheets([
    {
      finished_good_id: "",
      finished_good_name: "Sườn ướp sẵn (ví dụ)",
      ingredient_id: "",
      ingredient_name: "Sườn cốt lết sống (ví dụ)",
      quantity: 1,
      unit: "kg",
      yield_factor: 0.9,
      note: "Hao hụt sơ chế 10%",
    },
  ]);
  const buf = await buildXlsx(sheets);

  return {
    success: true,
    data: {
      filename: "bom-san-xuat-template.xlsx",
      base64: bufferToBase64(buf),
      format: "xlsx",
    },
  };
}

function readCell(raw: Record<string, string>, ...keys: string[]): string {
  for (const key of keys) {
    const value = raw[key];
    if (value != null) return value.trim();
  }
  return "";
}

function normalizeLookupKey(value: string): string {
  return value.trim().toLowerCase();
}

function parseCsvNumber(raw: string): number | null {
  const value = raw.trim();
  if (!value) return null;

  const compact = value.replace(/\s/g, "");
  const parts = compact.split(",");
  const decimalComma =
    parts.length === 2 &&
    parts[1] != null &&
    parts[1].length > 0 &&
    parts[1].length !== 3 &&
    !compact.includes(".");
  const normalized = decimalComma
    ? `${parts[0]}.${parts[1]}`
    : compact.replace(/,/g, "");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function parseOptionalId(raw: string): number | null | undefined {
  if (!raw.trim()) return undefined;
  const n = parseCsvNumber(raw);
  if (n == null || !Number.isInteger(n) || n <= 0) return null;
  return n;
}

function addNameLookup<T extends { name: string }>(
  map: Map<string, T[]>,
  item: T,
) {
  const key = normalizeLookupKey(item.name);
  const existing = map.get(key);
  if (existing) existing.push(item);
  else map.set(key, [item]);
}

function resolveByName<T extends { id: number; name: string }>(
  rowsByName: Map<string, T[]>,
  name: string,
): T | "ambiguous" | null {
  const matches = rowsByName.get(normalizeLookupKey(name)) ?? [];
  if (matches.length === 1) return matches[0]!;
  if (matches.length > 1) return "ambiguous";
  return null;
}

export async function importProductionRecipes(
  formData: FormData,
): Promise<ImportProductionRecipesResult> {
  const ctx = await getAuthContextWithPermission(
    PRODUCTION_ROLES,
    PERMISSION_KEYS.MENU_WRITE,
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
  } catch {
    return { success: false, error: "Không đọc được file BOM sản xuất." };
  }

  const sheet = parsed.sheets[0];
  if (!sheet || sheet.rows.length === 0) {
    return { success: false, error: "File trống" };
  }

  const { supabase, claims } = ctx;
  const { data, error } = await supabase
    .from("ingredients")
    .select("id, name, unit, measure_unit, item_kind, is_active")
    .eq("tenant_id", claims.tenant_id);

  if (error) {
    return { success: false, error: "Không thể tải dữ liệu đối chiếu." };
  }

  const ingredients = ((data ?? []) as IngredientLookupRow[]).filter(
    (ingredient) => ingredient.is_active !== false,
  );
  const ingredientById = new Map(ingredients.map((item) => [item.id, item]));
  const finishedGoodByName = new Map<string, IngredientLookupRow[]>();
  const rawIngredientByName = new Map<string, IngredientLookupRow[]>();

  for (const ingredient of ingredients) {
    if (ingredient.item_kind === "finished_good") {
      addNameLookup(finishedGoodByName, ingredient);
    }
    if (ingredient.item_kind === "raw_material") {
      addNameLookup(rawIngredientByName, ingredient);
    }
  }

  const issues: ImportProductionRecipeIssue[] = [];
  const groups = new Map<
    number,
    {
      finishedGoodName: string;
      lines: Array<{
        ingredientId: number;
        quantity: number;
        unit: string;
        yieldFactor: number;
        note: string | null;
      }>;
    }
  >();
  const seenRecipeIngredient = new Set<string>();

  sheet.rows.forEach((raw, idx) => {
    const rowNumber = idx + 2;
    const finishedGoodIdRaw = readCell(
      raw,
      "Mã thành phẩm",
      "finished_good_id",
    );
    const finishedGoodNameRaw = readCell(
      raw,
      "Thành phẩm",
      "finished_good_name",
    );
    const ingredientIdRaw = readCell(raw, "Mã nguyên liệu", "ingredient_id");
    const ingredientNameRaw = readCell(raw, "Nguyên liệu", "ingredient_name");

    const finishedGoodId = parseOptionalId(finishedGoodIdRaw);
    if (finishedGoodId === null) {
      issues.push({
        row: rowNumber,
        field: "Mã thành phẩm",
        message: "Mã thành phẩm không hợp lệ.",
      });
      return;
    }

    const ingredientId = parseOptionalId(ingredientIdRaw);
    if (ingredientId === null) {
      issues.push({
        row: rowNumber,
        field: "Mã nguyên liệu",
        message: "Mã nguyên liệu không hợp lệ.",
      });
      return;
    }

    let finishedGood = finishedGoodId
      ? (ingredientById.get(finishedGoodId) ?? null)
      : null;
    if (!finishedGood && finishedGoodNameRaw) {
      const resolved = resolveByName(finishedGoodByName, finishedGoodNameRaw);
      if (resolved === "ambiguous") {
        issues.push({
          row: rowNumber,
          field: "Thành phẩm",
          message: "Tên thành phẩm bị trùng. Vui lòng dùng Mã thành phẩm.",
        });
        return;
      }
      finishedGood = resolved;
    }
    if (!finishedGood || finishedGood.item_kind !== "finished_good") {
      issues.push({
        row: rowNumber,
        field: "Thành phẩm",
        message: "Không tìm thấy thành phẩm hợp lệ trong danh mục.",
      });
      return;
    }

    let ingredient = ingredientId
      ? (ingredientById.get(ingredientId) ?? null)
      : null;
    if (!ingredient && ingredientNameRaw) {
      const resolved = resolveByName(rawIngredientByName, ingredientNameRaw);
      if (resolved === "ambiguous") {
        issues.push({
          row: rowNumber,
          field: "Nguyên liệu",
          message: "Tên nguyên liệu bị trùng. Vui lòng dùng Mã nguyên liệu.",
        });
        return;
      }
      ingredient = resolved;
    }
    if (!ingredient || ingredient.item_kind !== "raw_material") {
      issues.push({
        row: rowNumber,
        field: "Nguyên liệu",
        message: "Không tìm thấy nguyên liệu đầu vào hợp lệ trong danh mục.",
      });
      return;
    }

    const duplicateKey = `${finishedGood.id}:${ingredient.id}`;
    if (seenRecipeIngredient.has(duplicateKey)) {
      issues.push({
        row: rowNumber,
        field: "Nguyên liệu",
        message: "Nguyên liệu bị trùng trong cùng một BOM sản xuất.",
      });
      return;
    }
    seenRecipeIngredient.add(duplicateKey);

    const quantityRaw = readCell(raw, "Số lượng", "quantity");
    const quantity = parseCsvNumber(quantityRaw);
    if (quantity == null) {
      issues.push({
        row: rowNumber,
        field: "Số lượng",
        message: "Số lượng không hợp lệ.",
      });
      return;
    }

    const yieldRaw = readCell(raw, "Yield", "yield_factor");
    const yieldFactor = yieldRaw ? parseCsvNumber(yieldRaw) : 1;
    if (yieldFactor == null) {
      issues.push({
        row: rowNumber,
        field: "Yield",
        message: "Yield không hợp lệ.",
      });
      return;
    }

    const unit =
      readCell(raw, "Đơn vị", "unit") ||
      ingredient.measure_unit ||
      ingredient.unit;
    const parsedRow = importProductionRecipeRowSchema.safeParse({
      finishedGoodId: finishedGood.id,
      ingredientId: ingredient.id,
      quantity,
      unit,
      yieldFactor,
      note: readCell(raw, "Ghi chú", "note") || undefined,
    });

    if (!parsedRow.success) {
      issues.push({
        row: rowNumber,
        field: parsedRow.error.issues[0]?.path.join("."),
        message: parsedRow.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
      });
      return;
    }

    const group = groups.get(parsedRow.data.finishedGoodId) ?? {
      finishedGoodName: finishedGood.name,
      lines: [],
    };
    group.lines.push({
      ingredientId: parsedRow.data.ingredientId,
      quantity: parsedRow.data.quantity,
      unit: parsedRow.data.unit.trim(),
      yieldFactor: parsedRow.data.yieldFactor,
      note: parsedRow.data.note?.trim() ? parsedRow.data.note.trim() : null,
    });
    groups.set(parsedRow.data.finishedGoodId, group);
  });

  if (issues.length > 0) {
    return {
      success: false,
      error: `Có ${issues.length} dòng lỗi. Vui lòng sửa và thử lại.`,
      issues,
    };
  }

  if (groups.size === 0) {
    return { success: false, error: "Không có dòng hợp lệ nào để import" };
  }

  const sb = supabase as unknown as RpcClient;
  let lineCount = 0;
  for (const [finishedGoodId, group] of groups) {
    lineCount += group.lines.length;
    const { error: rpcError } = await sb.rpc("upsert_production_recipe_lines", {
      p_finished_good_id: finishedGoodId,
      p_lines: group.lines.map((line) => ({
        ingredient_id: line.ingredientId,
        quantity: line.quantity,
        unit: line.unit,
        note: line.note,
        yield_factor: line.yieldFactor,
      })),
    });

    if (rpcError) {
      return {
        success: false,
        error: `Không thể import BOM sản xuất "${group.finishedGoodName}".`,
      };
    }
  }

  revalidatePath("/inventory/production");
  return {
    success: true,
    data: { summary: { recipes: groups.size, lines: lineCount } },
  };
}

export async function fetchProductionOrders(): Promise<
  ActionResult<ProductionOrderRow[]>
> {
  const ctx = await getAuthContextWithAnyPermission(
    PRODUCTION_ROLES,
    PRODUCTION_ORDER_PERMISSIONS,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;
  if (isCentralKitchenScopedRole(claims.user_role)) {
    if (claims.branch_id == null) {
      return {
        success: false,
        error: "Tài khoản chưa được gán bếp trung tâm.",
      };
    }
    const access = await requireCentralKitchenBranch(
      supabase,
      claims.tenant_id,
      claims.branch_id,
    );
    if (!access.ok) {
      return { success: false, error: access.error };
    }
  }

  let ordersQuery = supabase
    .from("production_orders")
    .select(
      `
      id,
      branch_id,
      production_number,
      status,
      notes,
      completed_at,
      created_at,
      branches ( id, name ),
      production_order_items (
        id,
        finished_good_id,
        quantity,
        unit,
        unit_cost_at_production,
        ingredients ( id, name, unit )
      )
    `,
    )
    .eq("tenant_id", claims.tenant_id)
    .order("created_at", { ascending: false });

  // Branch-scoped production managers see only their own CK branch's orders.
  // Tenant-wide roles keep full tenant visibility.
  if (
    isCentralKitchenScopedRole(claims.user_role) &&
    claims.branch_id != null
  ) {
    ordersQuery = ordersQuery.eq("branch_id", claims.branch_id);
  }

  const { data, error } = await ordersQuery;

  if (error) {
    return { success: false, error: "Không thể tải lệnh sản xuất." };
  }

  const rows: ProductionOrderRow[] = (data ?? []).map((row) => {
    const items = (row.production_order_items ?? []).map((item) => {
      const ingredient = item.ingredients as {
        id: number;
        name: string;
        unit: string;
      } | null;
      const unitCost =
        item.unit_cost_at_production == null
          ? null
          : Number(item.unit_cost_at_production);
      return {
        id: item.id,
        finished_good_id: item.finished_good_id,
        finished_good_name: ingredient?.name ?? "Thành phẩm",
        quantity: Number(item.quantity),
        unit: item.unit ?? ingredient?.unit ?? "",
        unit_cost_at_production: unitCost,
      };
    });

    return {
      id: row.id,
      branch_id: row.branch_id,
      branch_name:
        (row.branches as { id: number; name: string } | null)?.name ?? "—",
      production_number: row.production_number,
      status: row.status,
      notes: row.notes ?? null,
      completed_at: row.completed_at ?? null,
      created_at: row.created_at,
      items,
      total_cost: items.reduce(
        (sum, item) =>
          sum + item.quantity * (item.unit_cost_at_production ?? 0),
        0,
      ),
    };
  });

  // Draft orders chưa qua RPC nên unit_cost_at_production còn null. Tính tạm
  // bằng BOM × WAC tại CK (mirror logic confirm_production_order RPC) để UI
  // hiện được tổng chi phí ước tính trước khi xác nhận.
  const draftFgIds = new Set<number>();
  for (const order of rows) {
    if (order.status === "draft") {
      for (const item of order.items) draftFgIds.add(item.finished_good_id);
    }
  }

  if (draftFgIds.size > 0) {
    const fgIds = Array.from(draftFgIds);
    const [bomRes, wacRes] = await Promise.all([
      supabase
        .from("production_recipes")
        .select(
          "finished_good_id, ingredient_id, quantity, yield_factor, ingredients:ingredients!production_recipes_ingredient_id_fkey ( purchase_to_measure_factor, unit_cost )",
        )
        .in("finished_good_id", fgIds)
        .eq("tenant_id", claims.tenant_id),
      supabase
        .from("stock_levels")
        .select("ingredient_id, avg_unit_cost, branches!inner ( branch_kind )")
        .eq("tenant_id", claims.tenant_id)
        .eq("branches.branch_kind", "central_kitchen")
        .not("avg_unit_cost", "is", null),
    ]);

    const wacMap = new Map<number, number>();
    if (wacRes.data) {
      const acc = new Map<number, { sum: number; count: number }>();
      for (const w of wacRes.data as Array<{
        ingredient_id: number;
        avg_unit_cost: number | string | null;
      }>) {
        const id = Number(w.ingredient_id);
        const cost = Number(w.avg_unit_cost ?? 0);
        const e = acc.get(id) ?? { sum: 0, count: 0 };
        e.sum += cost;
        e.count += 1;
        acc.set(id, e);
      }
      for (const [id, e] of acc) wacMap.set(id, e.sum / e.count);
    }

    type BomRow = {
      finished_good_id: number;
      ingredient_id: number;
      quantity: number | string | null;
      yield_factor: number | string | null;
      ingredients: {
        purchase_to_measure_factor: number | string | null;
        unit_cost: number | string | null;
      } | null;
    };
    const costPerFg = new Map<number, number>();
    for (const bom of (bomRes.data ?? []) as BomRow[]) {
      const fgId = Number(bom.finished_good_id);
      const rawId = Number(bom.ingredient_id);
      const qty = Number(bom.quantity ?? 0);
      const yf = Number(bom.yield_factor ?? 1) || 1;
      const conv =
        Number(bom.ingredients?.purchase_to_measure_factor ?? 1) || 1;
      const wac = wacMap.get(rawId);
      const refCost =
        bom.ingredients?.unit_cost != null
          ? Number(bom.ingredients.unit_cost)
          : 0;
      const rawUnitCost = wac != null ? wac : refCost;
      const rawNeedPurchase = qty / yf / conv;
      costPerFg.set(
        fgId,
        (costPerFg.get(fgId) ?? 0) + rawNeedPurchase * rawUnitCost,
      );
    }

    for (const order of rows) {
      if (order.status !== "draft") continue;
      let total = 0;
      for (const item of order.items) {
        if (item.unit_cost_at_production == null) {
          item.unit_cost_at_production =
            costPerFg.get(item.finished_good_id) ?? 0;
        }
        total += item.quantity * (item.unit_cost_at_production ?? 0);
      }
      order.total_cost = total;
    }
  }

  return { success: true, data: rows };
}

export const createProductionOrder = withAction(
  {
    roles: PRODUCTION_ROLES,
    schema: createProductionOrderSchema,
    permission: PERMISSION_KEYS.INVENTORY_PRODUCTION_CREATE,
    permissionBranchId: (data) => data.branchId,
  },
  async (data, { supabase }) => {
    const sb = supabase as unknown as RpcClient;
    const { error } = await sb.rpc("create_production_order", {
      p_branch_id: data.branchId,
      p_production_number: data.productionNumber,
      p_notes: data.notes ?? null,
      p_items: data.items.map((item) => ({
        finishedGoodId: item.finishedGoodId,
        quantity: item.quantity,
        unit: item.unit,
      })),
    });

    if (error) {
      if (error.code === PG_ERR.UNIQUE_VIOLATION) {
        return { success: false, error: "Số lệnh sản xuất đã tồn tại." };
      }
      if (
        error.code === PG_ERR.CHECK_VIOLATION ||
        error.code === PG_ERR.INVALID_TEXT_REPRESENTATION
      ) {
        return {
          success: false,
          error: "Bếp trung tâm hoặc thành phẩm chưa hợp lệ.",
        };
      }
      if (error.code === PG_ERR.INSUFFICIENT_PRIVILEGE) {
        return { success: false, error: "Không có quyền tạo lệnh sản xuất." };
      }
      return { success: false, error: "Không thể tạo lệnh sản xuất." };
    }

    return { success: true };
  },
);

export const upsertProductionRecipe = withAction(
  {
    roles: PRODUCTION_ROLES,
    schema: productionRecipeSchema,
    permission: PERMISSION_KEYS.MENU_WRITE,
  },
  async (data, ctx) => {
    const { supabase, claims } = ctx;
    if (isCentralKitchenScopedRole(claims.user_role)) {
      if (claims.branch_id == null) {
        return {
          success: false,
          error: "Tài khoản chưa được gán bếp trung tâm.",
        };
      }
      const access = await requireCentralKitchenBranch(
        supabase,
        claims.tenant_id,
        claims.branch_id,
      );
      if (!access.ok) {
        return { success: false, error: access.error };
      }
    }
    const { data: ingredients, error: ingredientError } = await supabase
      .from("ingredients")
      .select("id, item_kind")
      .eq("tenant_id", claims.tenant_id)
      .in("id", [data.finishedGoodId, data.ingredientId]);

    if (ingredientError) {
      return { success: false, error: "Không thể kiểm tra nguyên liệu." };
    }

    const finishedGood = (ingredients ?? []).find(
      (item) => item.id === data.finishedGoodId,
    );
    const ingredient = (ingredients ?? []).find(
      (item) => item.id === data.ingredientId,
    );

    if (
      finishedGood?.item_kind !== "finished_good" ||
      ingredient?.item_kind !== "raw_material"
    ) {
      return {
        success: false,
        error: "Công thức phải nối thành phẩm với nguyên liệu.",
      };
    }

    const { error } = await supabase.from("production_recipes").upsert(
      {
        tenant_id: claims.tenant_id,
        finished_good_id: data.finishedGoodId,
        ingredient_id: data.ingredientId,
        quantity: data.quantity,
        unit: data.unit,
        yield_factor: data.yieldFactor,
        note: data.note ?? null,
      },
      { onConflict: "finished_good_id,ingredient_id,tenant_id" },
    );

    if (error) {
      return { success: false, error: "Không thể lưu công thức." };
    }

    return { success: true };
  },
);

export const upsertProductionRecipeLines = withAction(
  {
    roles: PRODUCTION_ROLES,
    schema: productionRecipeLinesSchema,
    permission: PERMISSION_KEYS.MENU_WRITE,
  },
  async (data, ctx) => {
    const { supabase, claims } = ctx;
    if (isCentralKitchenScopedRole(claims.user_role)) {
      if (claims.branch_id == null) {
        return {
          success: false,
          error: "Tài khoản chưa được gán bếp trung tâm.",
        };
      }
      const access = await requireCentralKitchenBranch(
        supabase,
        claims.tenant_id,
        claims.branch_id,
      );
      if (!access.ok) {
        return { success: false, error: access.error };
      }
    }

    const sb = supabase as unknown as RpcClient;
    const { error } = await sb.rpc("upsert_production_recipe_lines", {
      p_finished_good_id: data.finishedGoodId,
      p_lines: data.lines.map((line) => ({
        ingredient_id: line.ingredientId,
        quantity: line.quantity,
        unit: line.unit.trim(),
        note: line.note?.trim() ? line.note.trim() : null,
        yield_factor: line.yieldFactor,
      })),
    });

    if (error) {
      const message = error.message ?? "";
      if (
        error.code === PG_ERR.UNIQUE_VIOLATION ||
        message.includes("duplicate_ingredient")
      ) {
        return { success: false, error: "Nguyên liệu bị trùng trong BOM." };
      }
      if (error.code === PG_ERR.INSUFFICIENT_PRIVILEGE) {
        return { success: false, error: "Không có quyền lưu BOM sản xuất." };
      }
      if (error.code === PG_ERR.INVALID_TEXT_REPRESENTATION) {
        return { success: false, error: "Dữ liệu BOM chưa hợp lệ." };
      }
      if (message.includes("finished_good_not_found")) {
        return { success: false, error: "Thành phẩm không còn hợp lệ." };
      }
      if (message.includes("ingredient_not_found")) {
        return { success: false, error: "Có nguyên liệu không còn hợp lệ." };
      }
      return { success: false, error: "Không thể lưu BOM sản xuất." };
    }

    revalidatePath("/inventory/production");
    return { success: true };
  },
);

export async function deleteProductionRecipe(
  recipeId: number,
): Promise<ActionResult> {
  const parsed = idSchema.safeParse(recipeId);
  if (!parsed.success) return { success: false, error: "ID không hợp lệ" };

  const ctx = await getAuthContextWithPermission(
    PRODUCTION_ROLES,
    PERMISSION_KEYS.MENU_WRITE,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;
  if (isCentralKitchenScopedRole(claims.user_role)) {
    if (claims.branch_id == null) {
      return {
        success: false,
        error: "Tài khoản chưa được gán bếp trung tâm.",
      };
    }
    const access = await requireCentralKitchenBranch(
      supabase,
      claims.tenant_id,
      claims.branch_id,
    );
    if (!access.ok) {
      return { success: false, error: access.error };
    }
  }
  const { error } = await supabase
    .from("production_recipes")
    .delete()
    .eq("id", parsed.data)
    .eq("tenant_id", claims.tenant_id);

  if (error) {
    return { success: false, error: "Không thể xóa công thức." };
  }

  return { success: true };
}

export async function deleteProductionRecipeGroup(
  finishedGoodId: number,
): Promise<ActionResult> {
  const parsed = idSchema.safeParse(finishedGoodId);
  if (!parsed.success)
    return { success: false, error: "ID thành phẩm không hợp lệ" };

  const ctx = await getAuthContextWithPermission(
    PRODUCTION_ROLES,
    PERMISSION_KEYS.MENU_WRITE,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;
  if (isCentralKitchenScopedRole(claims.user_role)) {
    if (claims.branch_id == null) {
      return {
        success: false,
        error: "Tài khoản chưa được gán bếp trung tâm.",
      };
    }
    const access = await requireCentralKitchenBranch(
      supabase,
      claims.tenant_id,
      claims.branch_id,
    );
    if (!access.ok) {
      return { success: false, error: access.error };
    }
  }

  const { error } = await supabase
    .from("production_recipes")
    .delete()
    .eq("tenant_id", claims.tenant_id)
    .eq("finished_good_id", parsed.data);

  if (error) {
    return { success: false, error: "Không thể xóa công thức cũ." };
  }

  return { success: true };
}

export async function confirmProductionOrder(
  orderId: number,
): Promise<ActionResult> {
  const parsed = idSchema.safeParse(orderId);
  if (!parsed.success) return { success: false, error: "ID không hợp lệ" };

  const ctx = await getAuthContextWithPermission(
    PRODUCTION_ROLES,
    PERMISSION_KEYS.INVENTORY_PRODUCTION_CONFIRM,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase } = ctx;
  const sb = supabase as unknown as RpcClient;
  const { error } = await sb.rpc("confirm_production_order", {
    p_order_id: parsed.data,
  });

  if (error) {
    const message = error.message ?? "";

    if (error.code === PG_ERR.INSUFFICIENT_PRIVILEGE) {
      if (message.includes("branch_scope_violation")) {
        return {
          success: false,
          error:
            "Tài khoản chưa được cấp quyền xác nhận sản xuất tại bếp trung tâm này.",
        };
      }
      return {
        success: false,
        error: "Không có quyền xác nhận lệnh sản xuất.",
      };
    }

    if (error.code === "P0002") {
      if (message.includes("production_location_missing")) {
        return {
          success: false,
          error:
            "Bếp trung tâm chưa có kho nhận mặc định. Tạo Inventory Location với 'Mặc định nhận hàng'.",
        };
      }
      if (message.includes("production_order_not_found")) {
        return { success: false, error: "Không tìm thấy lệnh sản xuất." };
      }
      return { success: false, error: "Không thể xác nhận lệnh sản xuất." };
    }

    if (
      error.code === PG_ERR.CHECK_VIOLATION ||
      error.code === PG_ERR.INVALID_TEXT_REPRESENTATION ||
      error.code === "P0001"
    ) {
      if (message.includes("production_recipe_missing")) {
        return {
          success: false,
          error: "Thiếu công thức sản xuất cho thành phẩm này.",
        };
      }
      if (message.includes("insufficient_stock_for_production")) {
        const shortages = parseShortagesDetail(error.details);
        const summary =
          shortages.length > 0
            ? `Thiếu ${shortages.length} nguyên liệu trong bếp trung tâm.`
            : "Không đủ tồn kho nguyên liệu trong bếp trung tâm để sản xuất lệnh này.";
        return {
          success: false,
          error: summary,
          errorCode: PRODUCTION_ERROR_CODES.INSUFFICIENT_STOCK,
          meta: { shortages },
        };
      }
      if (message.includes("production_conversion_factor_invalid")) {
        return {
          success: false,
          error:
            "Nguyên liệu thiếu hệ số quy đổi đơn vị mua → đo. Cập nhật trong danh mục nguyên liệu.",
        };
      }
      if (message.includes("production_order_not_draft")) {
        return {
          success: false,
          error: "Lệnh đã được xác nhận hoặc hủy trước đó.",
        };
      }
      if (message.includes("production_order_empty")) {
        return { success: false, error: "Lệnh sản xuất chưa có thành phẩm." };
      }
      if (message.includes("production_cost_invalid")) {
        return {
          success: false,
          error: "Chi phí sản xuất tính ra giá trị âm.",
        };
      }
      if (message.includes("branch_must_be_central_kitchen")) {
        return {
          success: false,
          error: "Chi nhánh không phải bếp trung tâm.",
        };
      }
      if (message.includes("production_item_must_be_finished_good")) {
        return {
          success: false,
          error: "Có dòng không phải thành phẩm trong lệnh.",
        };
      }
      return {
        success: false,
        error: "Không thể xác nhận do dữ liệu sản xuất chưa hợp lệ.",
      };
    }
    return { success: false, error: "Không thể xác nhận lệnh sản xuất." };
  }

  return { success: true };
}

export async function cancelProductionOrder(
  orderId: number,
): Promise<ActionResult> {
  const parsed = idSchema.safeParse(orderId);
  if (!parsed.success) return { success: false, error: "ID không hợp lệ" };

  const ctx = await getAuthContextWithPermission(
    PRODUCTION_ROLES,
    PERMISSION_KEYS.INVENTORY_PRODUCTION_CONFIRM,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase } = ctx;
  const sb = supabase as unknown as RpcClient;
  const { error } = await sb.rpc("cancel_production_order", {
    p_order_id: parsed.data,
  });

  if (error) {
    if (error.code === PG_ERR.INSUFFICIENT_PRIVILEGE) {
      return { success: false, error: "Không có quyền hủy lệnh sản xuất." };
    }
    return { success: false, error: "Không thể hủy lệnh sản xuất." };
  }

  return { success: true };
}
