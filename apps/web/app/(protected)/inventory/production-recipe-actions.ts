"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@comtammatu/shared/types";
import { PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { parseVietnameseNumericImport } from "@comtammatu/shared/format";
import { getVNDateString } from "@comtammatu/shared/time";
import { getAuthContextWithAnyPermission } from "./_lib/auth";
import { withAction } from "@/_lib/with-action";
import { PG_ERR } from "./_lib/constants";
import {
  buildCsv,
  buildXlsx,
  bufferToBase64,
  MAX_ROWS_PER_SHEET,
  parseSpreadsheetFile,
  stringToBase64,
  type SheetDef,
} from "@/_lib/spreadsheet";
import { messages } from "@lib/messages";
import {
  idSchema,
  PRODUCTION_ROLES,
  requireProductionAccess,
  type RpcClient,
} from "./_lib/production-shared";

const PRODUCTION_RECIPE_READ_PERMISSIONS = [
  PERMISSION_KEYS.INVENTORY_PRODUCTION_CREATE,
  PERMISSION_KEYS.INVENTORY_PRODUCTION_CONFIRM,
  PERMISSION_KEYS.MENU_READ,
  PERMISSION_KEYS.MENU_WRITE,
] as const;

const PRODUCTION_RECIPE_MANAGE_PERMISSIONS = [
  PERMISSION_KEYS.INVENTORY_PRODUCTION_CREATE,
  PERMISSION_KEYS.INVENTORY_PRODUCTION_CONFIRM,
  PERMISSION_KEYS.MENU_WRITE,
] as const;

const productionRecipeLineUpsertSchema = z.object({
  ingredientId: z.coerce.number().int().positive(),
  quantity: z.coerce.number().positive(),
  entryUnitId: z.coerce.number().int().positive().nullable().optional(),
  yieldFactor: z.coerce.number().positive().default(1),
  note: z.string().optional(),
});

const productionRecipeLinesSchema = z
  .object({
    finishedGoodId: z.coerce.number().int().positive(),
    oldFinishedGoodId: z.coerce.number().int().positive().optional().nullable(),
    lines: z.array(productionRecipeLineUpsertSchema).min(1, {
      error: "Cần ít nhất một nguyên liệu trong công thức.",
    }),
  })
  .superRefine((value, ctx) => {
    const seen = new Set<number>();
    value.lines.forEach((line, index) => {
      if (seen.has(line.ingredientId)) {
        ctx.addIssue({
          code: "custom",
          path: ["lines", index, "ingredientId"],
          message: "Nguyên liệu bị trùng trong công thức.",
        });
      }
      seen.add(line.ingredientId);
    });
  });

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
  entryUnitId: z.number().int().positive().nullable(),
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

type BulkImportProductionRecipesRpcResult = {
  recipes?: number;
  lines?: number;
};

function mapProductionRecipeImportError(
  code: string | undefined,
  message: string | undefined,
): string {
  if (
    code === PG_ERR.INSUFFICIENT_PRIVILEGE ||
    message?.includes("forbidden")
  ) {
    return "Không có quyền nhập công thức sản xuất.";
  }
  if (
    code === PG_ERR.UNIQUE_VIOLATION ||
    message?.includes("duplicate_ingredient") ||
    message?.includes("duplicate_finished_good")
  ) {
    return "File import có dòng công thức bị trùng.";
  }
  if (message?.includes("finished_good_not_found")) {
    return "Có thành phẩm không còn hợp lệ.";
  }
  if (message?.includes("ingredient_not_found")) {
    return "Có nguyên liệu không còn hợp lệ.";
  }
  if (
    code === PG_ERR.INVALID_TEXT_REPRESENTATION ||
    code === PG_ERR.CHECK_VIOLATION
  ) {
    return "Dữ liệu công thức chưa hợp lệ.";
  }
  return "Không thể nhập công thức sản xuất.";
}

type IngredientLookupRow = {
  id: number;
  name: string;
  ingredient_units?: { unit_id: number, is_base: boolean, is_active: boolean, sort_order: number, units: { code: string, name: string } | null }[];
  item_kind: string;
  is_active: boolean;
  units: Array<{
    unit_id: number;
    unit_code: string;
    unit_name: string;
    is_base: boolean;
    is_active: boolean;
    sort_order: number;
  }>;
};

type IngredientLookupQueryRow = Omit<IngredientLookupRow, "units"> & {
  ingredient_units?: Array<{
    unit_id: number;
    is_base: boolean;
    is_active: boolean;
    sort_order: number;
    units: { code: string | null; name: string | null } | null;
  }> | null;
};

function normalizeUnitKey(value: string): string {
  return value.trim().toLocaleLowerCase("vi-VN");
}

function getDefaultImportEntryUnit(
  ingredient: IngredientLookupRow,
): IngredientLookupRow["units"][number] | null {
  const activeUnits = ingredient.units
    .filter((unit) => unit.is_active && unit.unit_code)
    .sort((a, b) => {
      if (a.is_base !== b.is_base) return a.is_base ? -1 : 1;
      return a.sort_order - b.sort_order;
    });
  return activeUnits.find((unit) => unit.is_base) ?? activeUnits[0] ?? null;
}

function resolveImportEntryUnit(
  ingredient: IngredientLookupRow,
  unitText: string,
): IngredientLookupRow["units"][number] | null {
  const needle = normalizeUnitKey(unitText);
  if (!needle) return getDefaultImportEntryUnit(ingredient);

  const matches = ingredient.units.filter((unit) => {
    if (!unit.is_active) return false;
    return [unit.unit_code, unit.unit_name].some(
      (candidate) => normalizeUnitKey(candidate) === needle,
    );
  });

  return matches.length === 1 ? (matches[0] ?? null) : null;
}

export interface ProductionRecipeRow {
  id: number;
  finished_good_id: number;
  finished_good_name: string;
  ingredient_id: number;
  ingredient_name: string;
  quantity: number;
  unitLabel: string;
  entry_unit_id: number | null;
  yield_factor: number;
  note: string | null;
}

type ProductionRecipeQueryRow = {
  id: number;
  finished_good_id: number;
  ingredient_id: number;
  quantity: number | string;
  entry_unit_id: number | null;
  yield_factor: number | string | null;
  note: string | null;
  finished_good: { id: number; name: string } | null;
  ingredient: {
    id: number;
    name: string;
    ingredient_units?: Array<{
      unit_id: number;
      is_base: boolean;
      is_active: boolean;
      units: { code: string | null; name: string | null } | null;
    }> | null;
  } | null;
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
  {
    const access = await requireProductionAccess(supabase, claims);
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
      entry_unit_id,
      yield_factor,
      note,
      finished_good:ingredients!production_recipes_finished_good_id_fkey ( id, name ),
      ingredient:ingredients!production_recipes_ingredient_id_fkey (
        id,
        name,
        ingredient_units!ingredient_units_ingredient_tenant_fkey (
          unit_id,
          is_base,
          is_active,
          units!ingredient_units_unit_tenant_fkey ( code, name )
        )
      )
    `,
    )
    .eq("tenant_id", claims.tenant_id)
    .order("finished_good_id", { ascending: true })
    .order("ingredient_id", { ascending: true });

  if (error) {
    return {
      success: false,
      error: messages.inventory.productionRecipes.loadFailed,
    };
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
          ingredient_units?: Array<{
            unit_id: number;
            is_base: boolean;
            is_active: boolean;
            units: { code: string | null; name: string | null } | null;
          }> | null;
        } | null;
        const activeUnits =
          ingredient?.ingredient_units?.filter((unit) => unit.is_active) ?? [];
        const selectedUnit =
          row.entry_unit_id != null
            ? activeUnits.find((unit) => unit.unit_id === row.entry_unit_id)
            : activeUnits.find((unit) => unit.is_base);
        const unitLabel =
          selectedUnit?.units?.name?.trim() ||
          selectedUnit?.units?.code?.trim() ||
          "Đơn vị";
        return {
          id: row.id,
          finished_good_id: row.finished_good_id,
          finished_good_name: finishedGood?.name ?? "Thành phẩm",
          ingredient_id: row.ingredient_id,
          ingredient_name: ingredient?.name ?? "Nguyên liệu",
          quantity: Number(row.quantity),
          unitLabel,
          entry_unit_id: row.entry_unit_id ?? null,
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
      name: "Cong thuc san xuat",
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
    unit: recipe.unitLabel,
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
      error:
        recipesRes.error ?? messages.inventory.productionRecipes.loadFailed,
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
        filename: `cong-thuc-san-xuat-${stamp}.csv`,
        base64: stringToBase64(csv),
        format: "csv",
      },
    };
  }

  const buf = await buildXlsx(sheets);
  return {
    success: true,
    data: {
      filename: `cong-thuc-san-xuat-${stamp}.xlsx`,
      base64: bufferToBase64(buf),
      format: "xlsx",
    },
  };
}

export async function downloadProductionRecipeTemplate(): Promise<
  ActionResult<{ filename: string; base64: string; format: "xlsx" }>
> {
  const ctx = await getAuthContextWithAnyPermission(
    PRODUCTION_ROLES,
    PRODUCTION_RECIPE_MANAGE_PERMISSIONS,
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
      filename: "cong-thuc-san-xuat-template.xlsx",
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

function parseCsvNumber(raw: string, maxFractionDigits = 3): number | null {
  const parsed = parseVietnameseNumericImport(raw, { maxFractionDigits });
  return parsed.state === "valid" ? parsed.value : null;
}

function parseOptionalId(raw: string): number | null | undefined {
  if (!raw.trim()) return undefined;
  const n = parseCsvNumber(raw, 0);
  if (n == null || !Number.isSafeInteger(n) || n <= 0) return null;
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
  const ctx = await getAuthContextWithAnyPermission(
    PRODUCTION_ROLES,
    PRODUCTION_RECIPE_MANAGE_PERMISSIONS,
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
    return { success: false, error: "Không đọc được file công thức sản xuất." };
  }

  const sheet = parsed.sheets[0];
  if (!sheet || sheet.rows.length === 0) {
    return { success: false, error: "File trống" };
  }

  const { supabase, claims } = ctx;
  const { data, error } = await supabase
    .from("ingredients")
    .select(
      "id, name, item_kind, is_active, ingredient_units!ingredient_units_ingredient_tenant_fkey(unit_id, is_base, is_active, sort_order, units!ingredient_units_unit_tenant_fkey(code, name))",
    )
    .eq("tenant_id", claims.tenant_id);

  if (error) {
    return {
      success: false,
      error: messages.inventory.productionRecipes.lookupLoadFailed,
    };
  }

  const ingredients = ((data ?? []) as IngredientLookupQueryRow[])
    .filter((ingredient) => ingredient.is_active !== false)
    .map(({ ingredient_units, ...ingredient }) => ({
      ...ingredient,
      units: (ingredient_units ?? [])
        .map((unit) => ({
          unit_id: unit.unit_id,
          unit_code: unit.units?.code ?? "",
          unit_name: unit.units?.name ?? unit.units?.code ?? "",
          is_base: unit.is_base,
          is_active: unit.is_active,
          sort_order: unit.sort_order,
        }))
        .sort((a, b) => a.sort_order - b.sort_order),
    }));
  const ingredientById = new Map(ingredients.map((item) => [item.id, item]));
  const finishedGoodByName = new Map<string, IngredientLookupRow[]>();
  const rawIngredientByName = new Map<string, IngredientLookupRow[]>();

  for (const ingredient of ingredients) {
    if (ingredient.item_kind === "finished_good") {
      addNameLookup(finishedGoodByName, ingredient);
    }
    if (
      ingredient.item_kind === "raw_material" ||
      ingredient.item_kind === "finished_good"
    ) {
      addNameLookup(rawIngredientByName, ingredient);
    }
  }

  const issues: ImportProductionRecipeIssue[] = [];
  const groups = new Map<
    number,
    {
      lines: Array<{
        ingredientId: number;
        quantity: number;
        entryUnitId: number | null;
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
    if (
      !ingredient ||
      (ingredient.item_kind !== "raw_material" &&
        ingredient.item_kind !== "finished_good")
    ) {
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
        message: "Nguyên liệu bị trùng trong cùng một công thức sản xuất.",
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

    const unitRaw = readCell(raw, "Đơn vị", "unit");
    const entryUnit = resolveImportEntryUnit(ingredient, unitRaw);
    if (!entryUnit) {
      issues.push({
        row: rowNumber,
        field: "Đơn vị",
        message: "Đơn vị không thuộc nguyên liệu trong danh mục.",
      });
      return;
    }

    const parsedRow = importProductionRecipeRowSchema.safeParse({
      finishedGoodId: finishedGood.id,
      ingredientId: ingredient.id,
      quantity,
      entryUnitId: entryUnit.unit_id,
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
      lines: [],
    };
    group.lines.push({
      ingredientId: parsedRow.data.ingredientId,
      quantity: parsedRow.data.quantity,
      entryUnitId: parsedRow.data.entryUnitId,
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
  const { data: rpcData, error: rpcError } = await sb.rpc(
    "bulk_import_production_recipes",
    {
      p_groups: [...groups].map(([finishedGoodId, group]) => ({
        finished_good_id: finishedGoodId,
        lines: group.lines.map((line) => ({
          ingredient_id: line.ingredientId,
          quantity: line.quantity,
          entry_unit_id: line.entryUnitId,
          note: line.note,
          yield_factor: line.yieldFactor,
        })),
      })),
    },
  );

  if (rpcError) {
    console.error("inventory.production_recipes.bulk_import_failed", {
      code: rpcError.code,
      message: rpcError.message,
    });
    return {
      success: false,
      error: mapProductionRecipeImportError(rpcError.code, rpcError.message),
    };
  }

  const summary = (rpcData ?? {}) as BulkImportProductionRecipesRpcResult;
  revalidatePath("/inventory/production");
  return {
    success: true,
    data: {
      summary: {
        recipes: Number(summary.recipes ?? groups.size),
        lines: Number(
          summary.lines ??
            [...groups.values()].reduce(
              (total, group) => total + group.lines.length,
              0,
            ),
        ),
      },
    },
  };
}

export const upsertProductionRecipeLines = withAction(
  {
    roles: PRODUCTION_ROLES,
    schema: productionRecipeLinesSchema,
    anyPermission: PRODUCTION_RECIPE_MANAGE_PERMISSIONS,
  },
  async (data, ctx) => {
    const { supabase, claims } = ctx;
    {
      const access = await requireProductionAccess(supabase, claims);
      if (!access.ok) {
        return { success: false, error: access.error };
      }
    }

    const lines = data.lines.map((line) => ({
      ingredient_id: line.ingredientId,
      quantity: line.quantity,
      entry_unit_id: line.entryUnitId ?? null,
      note: line.note?.trim() ? line.note.trim() : null,
      yield_factor: line.yieldFactor,
    }));

    const sb = supabase as unknown as RpcClient;
    const { error } = await sb.rpc("upsert_production_recipe_lines", {
      p_finished_good_id: data.finishedGoodId,
      p_lines: lines,
      p_old_finished_good_id: data.oldFinishedGoodId ?? null,
    });

    if (error) {
      const message = error.message ?? "";
      if (
        error.code === PG_ERR.UNIQUE_VIOLATION ||
        message.includes("duplicate_ingredient")
      ) {
        return {
          success: false,
          error: "Nguyên liệu bị trùng trong công thức.",
        };
      }
      if (error.code === PG_ERR.INSUFFICIENT_PRIVILEGE) {
        return {
          success: false,
          error: "Không có quyền lưu công thức sản xuất.",
        };
      }
      if (error.code === PG_ERR.INVALID_TEXT_REPRESENTATION) {
        return { success: false, error: "Dữ liệu công thức chưa hợp lệ." };
      }
      if (message.includes("finished_good_not_found")) {
        return { success: false, error: "Thành phẩm không còn hợp lệ." };
      }
      if (message.includes("ingredient_not_found")) {
        return { success: false, error: "Có nguyên liệu không còn hợp lệ." };
      }
      return { success: false, error: "Không thể lưu công thức sản xuất." };
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

  const ctx = await getAuthContextWithAnyPermission(
    PRODUCTION_ROLES,
    PRODUCTION_RECIPE_MANAGE_PERMISSIONS,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;
  {
    const access = await requireProductionAccess(supabase, claims);
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

  const ctx = await getAuthContextWithAnyPermission(
    PRODUCTION_ROLES,
    PRODUCTION_RECIPE_MANAGE_PERMISSIONS,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;
  {
    const access = await requireProductionAccess(supabase, claims);
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
