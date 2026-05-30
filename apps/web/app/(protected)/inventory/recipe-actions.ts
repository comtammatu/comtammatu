"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PERMISSION_KEYS, PROCUREMENT_ROLES } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getVNDateString } from "@comtammatu/shared/time";
import { withAction } from "@/_lib/with-action";
import { getAuthContextWithPermission } from "./_lib/auth";
import {
  buildCsv,
  buildXlsx,
  bufferToBase64,
  MAX_ROWS_PER_SHEET,
  parseSpreadsheetFile,
  stringToBase64,
  type SheetDef,
} from "@/_lib/spreadsheet";

const ROLES = PROCUREMENT_ROLES;

/* ─── Recipes (central-kitchen WAC + menu-item recipes) ─── */

const recipeLineSchema = z.object({
  ingredientId: z.coerce.number().int().positive(),
  quantity: z.coerce.number().positive(),
  unit: z.string().min(1),
  note: z.string().optional().nullable(),
  yieldFactor: z.coerce.number().positive().default(1.0),
});

const recipeBatchSchema = z.object({
  menuItemId: z.coerce.number().int().positive(),
  lines: z.array(recipeLineSchema),
});

export async function fetchRecipes(): Promise<ActionResult> {
  const ctx = await getAuthContextWithPermission(
    ROLES,
    PERMISSION_KEYS.MENU_READ,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims } = ctx;
  const { data, error } = await supabase
    .from("menu_items")
    .select(
      `
      id, name, updated_at,
      menu_categories ( name ),
      recipes (
        ingredient_id, quantity, unit, note, yield_factor,
        ingredients ( id, name, unit, purchase_unit, unit_cost )
      )
    `,
    )
    .eq("tenant_id", claims.tenant_id)
    .eq("is_active", true)
    .order("name");
  if (error) {
    console.error("fetchRecipes", error);
    return { success: false, error: "Không thể tải định mức món bán." };
  }
  return { success: true, data: data ?? [] };
}

// WAC = giá trung bình thực tế (avg_unit_cost) ở stock_levels của bếp trung tâm.
// Một CK thường có 1 row/nguyên liệu; nếu hệ thống có 2 CK thì lấy mean across rows.
export async function fetchCentralKitchenWacMap(): Promise<
  ActionResult<Record<string, number>>
> {
  const ctx = await getAuthContextWithPermission(
    ROLES,
    PERMISSION_KEYS.MENU_READ,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims } = ctx;

  const { data, error } = await supabase
    .from("stock_levels")
    .select("ingredient_id, avg_unit_cost, branches!inner ( branch_kind )")
    .eq("tenant_id", claims.tenant_id)
    .eq("branches.branch_kind", "central_kitchen")
    .not("avg_unit_cost", "is", null);

  if (error) {
    console.error("fetchCentralKitchenWacMap", error);
    return { success: false, error: "Không thể tải WAC bếp trung tâm." };
  }

  type WacRow = {
    ingredient_id: number;
    avg_unit_cost: number | string | null;
  };
  const accum = new Map<number, { sum: number; count: number }>();
  for (const row of (data ?? []) as WacRow[]) {
    const id = Number(row.ingredient_id);
    const wac = Number(row.avg_unit_cost ?? 0);
    const entry = accum.get(id) ?? { sum: 0, count: 0 };
    entry.sum += wac;
    entry.count += 1;
    accum.set(id, entry);
  }

  const map: Record<string, number> = {};
  for (const [id, e] of accum) {
    map[String(id)] = e.sum / e.count;
  }
  return { success: true, data: map };
}

export const upsertRecipeLines = withAction(
  {
    roles: ROLES,
    schema: recipeBatchSchema,
    permission: PERMISSION_KEYS.MENU_WRITE,
  },
  async (data, { supabase }) => {
    const { error } = await supabase.rpc("upsert_recipe_lines", {
      p_menu_item_id: data.menuItemId,
      p_lines: data.lines.map((l) => ({
        ingredient_id: l.ingredientId,
        quantity: l.quantity,
        unit: l.unit,
        note: l.note ?? null,
        yield_factor: l.yieldFactor,
      })),
    });
    if (error) {
      console.error("upsertRecipeLines", error);
      return { success: false, error: "Không thể lưu định mức món bán." };
    }
    return { success: true };
  },
);

type RecipeSheetRow = {
  menu_item_id: number | "";
  menu_item_name: string;
  ingredient_id: number | "";
  ingredient_name: string;
  quantity: number | "";
  unit: string;
  yield_factor: number | "";
  note: string;
};

function buildRecipeSheets(rows: RecipeSheetRow[]): SheetDef[] {
  return [
    {
      name: "Dinh muc mon ban",
      columns: [
        { header: "Mã món bán", key: "menu_item_id", width: 14 },
        { header: "Món bán", key: "menu_item_name", width: 32 },
        { header: "Mã nguyên liệu", key: "ingredient_id", width: 14 },
        { header: "Nguyên liệu", key: "ingredient_name", width: 32 },
        { header: "Số lượng", key: "quantity", width: 14 },
        { header: "Đơn vị nhập", key: "unit", width: 14 },
        { header: "Yield", key: "yield_factor", width: 10 },
        { header: "Ghi chú", key: "note", width: 28 },
      ],
      rows,
    },
  ];
}

type ExportRecipesResult =
  | {
      success: true;
      data: { filename: string; base64: string; format: "xlsx" | "csv" };
    }
  | { success: false; error: string };

type RecipeExportMenuRow = {
  id: number;
  name: string;
  recipes: Array<{
    ingredient_id: number | null;
    quantity: number | string | null;
    unit: string | null;
    note: string | null;
    yield_factor: number | string | null;
    ingredients: {
      id: number;
      name: string;
      unit: string;
      purchase_unit: string | null;
    } | null;
  }> | null;
};

export async function exportRecipes(
  format: "xlsx" | "csv" = "xlsx",
): Promise<ExportRecipesResult> {
  const ctx = await getAuthContextWithPermission(
    ROLES,
    PERMISSION_KEYS.MENU_READ,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;
  const { data, error } = await supabase
    .from("menu_items")
    .select(
      `
      id, name,
      recipes (
        ingredient_id, quantity, unit, note, yield_factor,
        ingredients ( id, name, unit, purchase_unit )
      )
    `,
    )
    .eq("tenant_id", claims.tenant_id)
    .eq("is_active", true)
    .order("name");

  if (error) {
    return { success: false, error: "Không thể tải định mức món bán." };
  }

  const rows = ((data ?? []) as RecipeExportMenuRow[])
    .flatMap((menuItem) =>
      (menuItem.recipes ?? []).map((line): RecipeSheetRow => {
        const ingredientId = line.ingredients?.id ?? line.ingredient_id;
        return {
          menu_item_id: menuItem.id,
          menu_item_name: menuItem.name,
          ingredient_id: ingredientId ?? "",
          ingredient_name: line.ingredients?.name ?? "",
          quantity: line.quantity != null ? Number(line.quantity) : "",
          unit:
            line.unit ??
            line.ingredients?.purchase_unit ??
            line.ingredients?.unit ??
            "",
          yield_factor:
            line.yield_factor != null ? Number(line.yield_factor) : 1,
          note: line.note ?? "",
        };
      }),
    )
    .sort((a, b) => {
      const byMenu = a.menu_item_name.localeCompare(b.menu_item_name);
      if (byMenu !== 0) return byMenu;
      return a.ingredient_name.localeCompare(b.ingredient_name);
    });

  const sheets = buildRecipeSheets(rows);
  const stamp = getVNDateString();
  const safeFormat = format === "csv" ? "csv" : "xlsx";

  if (safeFormat === "csv") {
    const csv = buildCsv(sheets[0]!);
    return {
      success: true,
      data: {
        filename: `dinh-muc-mon-ban-${stamp}.csv`,
        base64: stringToBase64(csv),
        format: "csv",
      },
    };
  }

  const buf = await buildXlsx(sheets);
  return {
    success: true,
    data: {
      filename: `dinh-muc-mon-ban-${stamp}.xlsx`,
      base64: bufferToBase64(buf),
      format: "xlsx",
    },
  };
}

const importRecipeRowSchema = z.object({
  menuItemId: z.number().int().positive(),
  ingredientId: z.number().int().positive(),
  quantity: z.number().positive({ error: "Số lượng phải lớn hơn 0" }),
  unit: z.string().trim().min(1, { error: "Thiếu đơn vị" }),
  yieldFactor: z.number().positive({ error: "Yield phải lớn hơn 0" }),
  note: z.string().trim().optional(),
});

export interface ImportRecipeIssue {
  row: number;
  field?: string;
  message: string;
}

export interface ImportRecipeSummary {
  recipes: number;
  lines: number;
}

type ImportRecipesResult =
  | {
      success: true;
      data: { summary: ImportRecipeSummary };
    }
  | { success: false; error: string; issues?: ImportRecipeIssue[] };

type MenuLookup = { id: number; name: string };
type IngredientLookup = {
  id: number;
  name: string;
  unit: string;
  purchase_unit: string | null;
};

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

export async function importRecipes(
  formData: FormData,
): Promise<ImportRecipesResult> {
  const ctx = await getAuthContextWithPermission(
    ROLES,
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
    return { success: false, error: "Không đọc được file định mức món bán." };
  }

  const sheet = parsed.sheets[0];
  if (!sheet || sheet.rows.length === 0) {
    return { success: false, error: "File trống" };
  }

  const { supabase, claims } = ctx;
  const [menuRes, ingredientRes] = await Promise.all([
    supabase
      .from("menu_items")
      .select("id, name")
      .eq("tenant_id", claims.tenant_id),
    supabase
      .from("ingredients")
      .select("id, name, unit, purchase_unit")
      .eq("tenant_id", claims.tenant_id),
  ]);

  if (menuRes.error || ingredientRes.error) {
    return { success: false, error: "Không thể tải dữ liệu đối chiếu." };
  }

  const menus = (menuRes.data ?? []) as MenuLookup[];
  const ingredients = (ingredientRes.data ?? []) as IngredientLookup[];
  const menuById = new Map(menus.map((item) => [item.id, item]));
  const ingredientById = new Map(ingredients.map((item) => [item.id, item]));
  const menuByName = new Map<string, MenuLookup[]>();
  const ingredientByName = new Map<string, IngredientLookup[]>();
  menus.forEach((item) => addNameLookup(menuByName, item));
  ingredients.forEach((item) => addNameLookup(ingredientByName, item));

  const issues: ImportRecipeIssue[] = [];
  const groups = new Map<
    number,
    {
      menuItemName: string;
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
    const menuIdRaw = readCell(
      raw,
      "Mã món bán",
      "Mã thành phẩm",
      "menu_item_id",
    );
    const menuNameRaw = readCell(
      raw,
      "Món bán",
      "Thành phẩm",
      "menu_item_name",
    );
    const ingredientIdRaw = readCell(raw, "Mã nguyên liệu", "ingredient_id");
    const ingredientNameRaw = readCell(raw, "Nguyên liệu", "ingredient_name");

    const menuId = parseOptionalId(menuIdRaw);
    if (menuId === null) {
      issues.push({
        row: rowNumber,
        field: "Mã món bán",
        message: "Mã món bán không hợp lệ.",
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

    let menuItem = menuId ? (menuById.get(menuId) ?? null) : null;
    if (!menuItem && menuNameRaw) {
      const resolved = resolveByName(menuByName, menuNameRaw);
      if (resolved === "ambiguous") {
        issues.push({
          row: rowNumber,
          field: "Món bán",
          message: "Tên món bán bị trùng. Vui lòng dùng Mã món bán.",
        });
        return;
      }
      menuItem = resolved;
    }
    if (!menuItem) {
      issues.push({
        row: rowNumber,
        field: "Món bán",
        message: "Không tìm thấy món bán trong menu.",
      });
      return;
    }

    let ingredient = ingredientId
      ? (ingredientById.get(ingredientId) ?? null)
      : null;
    if (!ingredient && ingredientNameRaw) {
      const resolved = resolveByName(ingredientByName, ingredientNameRaw);
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
    if (!ingredient) {
      issues.push({
        row: rowNumber,
        field: "Nguyên liệu",
        message: "Không tìm thấy nguyên liệu trong danh mục.",
      });
      return;
    }

    const duplicateKey = `${menuItem.id}:${ingredient.id}`;
    if (seenRecipeIngredient.has(duplicateKey)) {
      issues.push({
        row: rowNumber,
        field: "Nguyên liệu",
        message: "Nguyên liệu bị trùng trong cùng một định mức món bán.",
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

    const warehouseUnit = ingredient.purchase_unit || ingredient.unit;
    const importedUnit = readCell(raw, "Đơn vị nhập", "Đơn vị", "unit");
    if (importedUnit && importedUnit !== warehouseUnit) {
      issues.push({
        row: rowNumber,
        field: "Đơn vị",
        message:
          "Đơn vị món bán phải khớp Đơn vị nhập trong danh mục nguyên liệu.",
      });
      return;
    }
    const unit = warehouseUnit;
    const parsedRow = importRecipeRowSchema.safeParse({
      menuItemId: menuItem.id,
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

    const group = groups.get(parsedRow.data.menuItemId) ?? {
      menuItemName: menuItem.name,
      lines: [],
    };
    group.lines.push({
      ingredientId: parsedRow.data.ingredientId,
      quantity: parsedRow.data.quantity,
      unit: parsedRow.data.unit.trim(),
      yieldFactor: parsedRow.data.yieldFactor,
      note: parsedRow.data.note?.trim() ? parsedRow.data.note.trim() : null,
    });
    groups.set(parsedRow.data.menuItemId, group);
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

  let lineCount = 0;
  for (const [menuItemId, group] of groups) {
    lineCount += group.lines.length;
    const { error } = await supabase.rpc("upsert_recipe_lines", {
      p_menu_item_id: menuItemId,
      p_lines: group.lines.map((line) => ({
        ingredient_id: line.ingredientId,
        quantity: line.quantity,
        unit: line.unit,
        note: line.note,
        yield_factor: line.yieldFactor,
      })),
    });

    if (error) {
      return {
        success: false,
        error: `Không thể import định mức món bán "${group.menuItemName}".`,
      };
    }
  }

  revalidatePath("/inventory/recipes");
  return {
    success: true,
    data: { summary: { recipes: groups.size, lines: lineCount } },
  };
}

export async function downloadRecipeTemplate(): Promise<
  ActionResult<{ filename: string; base64: string; format: "xlsx" }>
> {
  const ctx = await getAuthContextWithPermission(
    ROLES,
    PERMISSION_KEYS.MENU_WRITE,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const sheets = buildRecipeSheets([
    {
      menu_item_id: "",
      menu_item_name: "Cơm tấm sườn (ví dụ)",
      ingredient_id: "",
      ingredient_name: "Sườn cốt lết (ví dụ)",
      quantity: 0.18,
      unit: "kg",
      yield_factor: 0.9,
      note: "Hao hụt sơ chế 10%",
    },
  ]);

  const buf = await buildXlsx(sheets);
  return {
    success: true,
    data: {
      filename: "dinh-muc-mon-ban-template.xlsx",
      base64: bufferToBase64(buf),
      format: "xlsx",
    },
  };
}

export async function fetchMenuItemsForRecipes(): Promise<ActionResult> {
  const ctx = await getAuthContextWithPermission(
    ROLES,
    PERMISSION_KEYS.MENU_READ,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims } = ctx;
  const { data, error } = await supabase
    .from("menu_items")
    .select("id, name, is_active")
    .eq("tenant_id", claims.tenant_id)
    .order("name");
  if (error) return { success: false, error: "Không thể tải món." };
  return { success: true, data: data ?? [] };
}
