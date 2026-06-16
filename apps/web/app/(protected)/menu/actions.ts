"use server";

import { z } from "zod";
import { MODULE_ACL, PERMISSION_KEYS } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getVNDateString } from "@comtammatu/shared/time";
import { getAuthContextWithPermission } from "@/_lib/auth";
import { updateTag } from "next/cache";
import { revalidateSurfacePath } from "@/_lib/revalidate-surface";
import { withAction, withFormAction } from "@/_lib/with-action";
import {
  buildCsv,
  buildXlsx,
  bufferToBase64,
  MAX_ROWS_PER_SHEET,
  parseSpreadsheetFile,
  stringToBase64,
  type SheetDef,
} from "@/_lib/spreadsheet";

/* ─── Helpers ─── */

const MENU_MANAGER_ROLES = MODULE_ACL.menu.allowedRoles;

const CATEGORY_TYPES = ["main_dish", "side_dish", "drink", "dessert"] as const;

function mapDbError(code: string | undefined): string {
  if (code === "23505") return "Tên đã tồn tại";
  if (code === "23503") return "Dữ liệu tham chiếu không hợp lệ";
  return "Không thể thực hiện. Vui lòng thử lại.";
}

/* ─── Category Schemas ─── */

const createCategorySchema = z.object({
  name: z.string().min(1, { error: "Tên danh mục không được để trống" }),
  type: z.enum(CATEGORY_TYPES, { error: "Loại danh mục không hợp lệ" }),
  sort_order: z.coerce.number().int().min(0).default(0),
});

const updateCategorySchema = z.object({
  id: z.coerce.number().int().positive(),
  name: z.string().min(1, { error: "Tên danh mục không được để trống" }),
  type: z.enum(CATEGORY_TYPES, { error: "Loại danh mục không hợp lệ" }),
  sort_order: z.coerce.number().int().min(0).default(0),
});

/* ─── Item Schemas ─── */

const imageUrlField = z
  .string()
  .trim()
  .max(500, { error: "URL ảnh quá dài" })
  .refine((v) => v === "" || /^https?:\/\//i.test(v), {
    error: "URL ảnh không hợp lệ",
  })
  .optional()
  .default("");

const createItemSchema = z.object({
  name: z
    .string()
    .min(1, { error: "Tên món không được để trống" })
    .max(100, { error: "Tên món tối đa 100 ký tự" }),
  category_id: z.coerce.number().int().positive({ error: "Chọn danh mục" }),
  base_price: z.coerce.number().min(0, { error: "Giá không hợp lệ" }),
  description: z
    .string()
    .max(500, { error: "Mô tả tối đa 500 ký tự" })
    .optional()
    .default(""),
  image_url: imageUrlField,
});

const updateItemSchema = z.object({
  id: z.coerce.number().int().positive(),
  name: z
    .string()
    .min(1, { error: "Tên món không được để trống" })
    .max(100, { error: "Tên món tối đa 100 ký tự" }),
  category_id: z.coerce.number().int().positive({ error: "Chọn danh mục" }),
  base_price: z.coerce.number().min(0, { error: "Giá không hợp lệ" }),
  description: z
    .string()
    .max(500, { error: "Mô tả tối đa 500 ký tự" })
    .optional()
    .default(""),
  image_url: imageUrlField,
});

/* ─── Variant/Modifier/Sides Schemas ─── */

const variantEntrySchema = z.object({
  id: z.number().optional(),
  name: z.string().min(1),
  price_adjustment: z.number(),
  sort_order: z.number().int().min(0).default(0),
});

const modifierEntrySchema = z.object({
  id: z.number().optional(),
  name: z.string().min(1),
  price: z.number().min(0),
  sort_order: z.number().int().min(0).default(0),
});

const sideItemSchema = z.object({
  id: z.number().int().positive(),
  is_default: z.boolean(),
});

const toggleIdSchema = z.object({
  id: z.coerce.number().int().positive({ error: "ID không hợp lệ" }),
});

const saveVariantsSchema = z.object({
  itemId: z.coerce.number().int().positive({ error: "ID không hợp lệ" }),
  variants: z.array(variantEntrySchema),
});

const saveModifiersSchema = z.object({
  itemId: z.coerce.number().int().positive({ error: "ID không hợp lệ" }),
  modifiers: z.array(modifierEntrySchema),
});

const saveSidesSchema = z.object({
  mainItemId: z.number().int().positive(),
  sideItemIds: z.array(sideItemSchema),
});

/* ─── Category Actions ─── */

export const createCategory = withFormAction(
  {
    roles: MENU_MANAGER_ROLES,
    schema: createCategorySchema,
    extract: (fd) => ({
      name: fd.get("name"),
      type: fd.get("type"),
      sort_order: fd.get("sort_order") || 0,
    }),
  },
  async (data, { supabase, claims }) => {
    const { error } = await supabase.from("menu_categories").insert({
      tenant_id: claims.tenant_id,
      name: data.name,
      type: data.type,
      sort_order: data.sort_order,
    });

    if (error) {
      return { success: false, error: mapDbError(error.code) };
    }

    revalidateSurfacePath("/menu");
    // Bust POS cached menu structure (apps/web/app/(protected)/br/[branchId]/pos/menu-actions.ts).
    updateTag("menu-structure");
    return { success: true };
  },
);

export const updateCategory = withFormAction(
  {
    roles: MENU_MANAGER_ROLES,
    schema: updateCategorySchema,
    extract: (fd) => ({
      id: fd.get("id"),
      name: fd.get("name"),
      type: fd.get("type"),
      sort_order: fd.get("sort_order") || 0,
    }),
  },
  async (data, { supabase, claims }) => {
    const { error } = await supabase
      .from("menu_categories")
      .update({
        name: data.name,
        type: data.type,
        sort_order: data.sort_order,
      })
      .eq("id", data.id)
      .eq("tenant_id", claims.tenant_id);

    if (error) {
      return { success: false, error: mapDbError(error.code) };
    }

    revalidateSurfacePath("/menu");
    // Bust POS cached menu structure (apps/web/app/(protected)/br/[branchId]/pos/menu-actions.ts).
    updateTag("menu-structure");
    return { success: true };
  },
);

export const toggleCategoryActive = withAction(
  {
    roles: MENU_MANAGER_ROLES,
    schema: toggleIdSchema,
    permission: PERMISSION_KEYS.MENU_WRITE,
  },
  async (data, { supabase }) => {
    const { error } = await supabase.rpc("toggle_category_active", {
      p_id: data.id,
    });

    if (error) {
      if (error.message?.includes("not_found")) {
        return { success: false, error: "Danh mục không tồn tại" };
      }
      return { success: false, error: mapDbError(error.code) };
    }

    revalidateSurfacePath("/menu");
    // Bust POS cached menu structure (apps/web/app/(protected)/br/[branchId]/pos/menu-actions.ts).
    updateTag("menu-structure");
    return { success: true };
  },
);

/* ─── Item Actions ─── */

export const createItem = withFormAction(
  {
    roles: MENU_MANAGER_ROLES,
    schema: createItemSchema,
    extract: (fd) => ({
      name: fd.get("name"),
      category_id: fd.get("category_id"),
      base_price: fd.get("base_price"),
      description: fd.get("description") ?? "",
      image_url: fd.get("image_url") ?? "",
    }),
  },
  async (data, { supabase, claims }) => {
    const { error } = await supabase.from("menu_items").insert({
      tenant_id: claims.tenant_id,
      category_id: data.category_id,
      name: data.name,
      base_price: data.base_price,
      description: data.description || null,
      image_url: data.image_url || null,
    });

    if (error) {
      return { success: false, error: mapDbError(error.code) };
    }

    revalidateSurfacePath("/menu");
    // Bust POS cached menu structure (apps/web/app/(protected)/br/[branchId]/pos/menu-actions.ts).
    updateTag("menu-structure");
    return { success: true };
  },
);

export const updateItem = withFormAction(
  {
    roles: MENU_MANAGER_ROLES,
    schema: updateItemSchema,
    extract: (fd) => ({
      id: fd.get("id"),
      name: fd.get("name"),
      category_id: fd.get("category_id"),
      base_price: fd.get("base_price"),
      description: fd.get("description") ?? "",
      image_url: fd.get("image_url") ?? "",
    }),
  },
  async (data, { supabase, claims }) => {
    const { error } = await supabase
      .from("menu_items")
      .update({
        name: data.name,
        category_id: data.category_id,
        base_price: data.base_price,
        description: data.description || null,
        image_url: data.image_url || null,
      })
      .eq("id", data.id)
      .eq("tenant_id", claims.tenant_id);

    if (error) {
      return { success: false, error: mapDbError(error.code) };
    }

    revalidateSurfacePath("/menu");
    // Bust POS cached menu structure (apps/web/app/(protected)/br/[branchId]/pos/menu-actions.ts).
    updateTag("menu-structure");
    return { success: true };
  },
);

export const toggleItemActive = withAction(
  {
    roles: MENU_MANAGER_ROLES,
    schema: toggleIdSchema,
    permission: PERMISSION_KEYS.MENU_WRITE,
  },
  async (data, { supabase }) => {
    const { error } = await supabase.rpc("toggle_item_active", {
      p_id: data.id,
    });

    if (error) {
      if (error.message?.includes("not_found")) {
        return { success: false, error: "Món ăn không tồn tại" };
      }
      return { success: false, error: mapDbError(error.code) };
    }

    revalidateSurfacePath("/menu");
    // Bust POS cached menu structure (apps/web/app/(protected)/br/[branchId]/pos/menu-actions.ts).
    updateTag("menu-structure");
    return { success: true };
  },
);

/* ─── Variants ─── */

export const saveVariants = withAction(
  {
    roles: MENU_MANAGER_ROLES,
    schema: saveVariantsSchema,
    permission: PERMISSION_KEYS.MENU_WRITE,
  },
  async (data, { supabase }) => {
    const { error } = await supabase.rpc("save_item_variants", {
      p_item_id: data.itemId,
      p_variants: data.variants.map((v, idx) => ({
        name: v.name,
        price_adjustment: v.price_adjustment,
        sort_order: v.sort_order ?? idx,
      })),
    });

    if (error) {
      if (error.message === "item not found") {
        return { success: false, error: "Món ăn không tồn tại" };
      }
      return { success: false, error: mapDbError(error.code) };
    }

    revalidateSurfacePath("/menu");
    // Bust POS cached menu structure (apps/web/app/(protected)/br/[branchId]/pos/menu-actions.ts).
    updateTag("menu-structure");
    return { success: true };
  },
);

/* ─── Modifiers ─── */

export const saveModifiers = withAction(
  {
    roles: MENU_MANAGER_ROLES,
    schema: saveModifiersSchema,
    permission: PERMISSION_KEYS.MENU_WRITE,
  },
  async (data, { supabase }) => {
    const { error } = await supabase.rpc("save_item_modifiers", {
      p_item_id: data.itemId,
      p_modifiers: data.modifiers.map((m, idx) => ({
        name: m.name,
        price: m.price,
        sort_order: m.sort_order ?? idx,
      })),
    });

    if (error) {
      if (error.message === "item not found") {
        return { success: false, error: "Món ăn không tồn tại" };
      }
      return { success: false, error: mapDbError(error.code) };
    }

    revalidateSurfacePath("/menu");
    // Bust POS cached menu structure (apps/web/app/(protected)/br/[branchId]/pos/menu-actions.ts).
    updateTag("menu-structure");
    return { success: true };
  },
);

/* ─── Available Sides ─── */

export const saveSides = withAction(
  {
    roles: MENU_MANAGER_ROLES,
    schema: saveSidesSchema,
    permission: PERMISSION_KEYS.MENU_WRITE,
  },
  async (data, { supabase }) => {
    const { error } = await supabase.rpc("save_item_sides", {
      p_main_item_id: data.mainItemId,
      p_sides: data.sideItemIds.map((s) => ({
        side_item_id: s.id,
        is_default: s.is_default,
      })),
    });

    if (error) {
      if (error.message === "item not found") {
        return { success: false, error: "Món ăn không tồn tại" };
      }
      return { success: false, error: mapDbError(error.code) };
    }

    revalidateSurfacePath("/menu");
    // Bust POS cached menu structure (apps/web/app/(protected)/br/[branchId]/pos/menu-actions.ts).
    updateTag("menu-structure");
    return { success: true };
  },
);

/* ─── Export / Import Menu ─── */

const CATEGORY_TYPE_LABELS: Record<(typeof CATEGORY_TYPES)[number], string> = {
  main_dish: "Món chính",
  side_dish: "Món phụ",
  drink: "Thức uống",
  dessert: "Tráng miệng",
};

const CATEGORY_TYPE_BY_LABEL: Record<string, (typeof CATEGORY_TYPES)[number]> =
  {
    "món chính": "main_dish",
    main_dish: "main_dish",
    "món phụ": "side_dish",
    side_dish: "side_dish",
    "thức uống": "drink",
    nước: "drink",
    drink: "drink",
    "tráng miệng": "dessert",
    dessert: "dessert",
  };

interface MenuExportCategory {
  name: string;
  type: (typeof CATEGORY_TYPES)[number];
  sort_order: number;
  is_active: boolean;
}

interface MenuExportItem {
  name: string;
  category_name: string;
  base_price: number;
  description: string | null;
  sort_order: number;
  is_active: boolean;
}

interface MenuExportVariant {
  item_name: string;
  name: string;
  price_adjustment: number;
  sort_order: number;
}

interface MenuExportModifier {
  item_name: string;
  name: string;
  price: number;
  sort_order: number;
}

interface MenuExportSide {
  main_item_name: string;
  side_item_name: string;
  is_default: boolean;
}

function buildMenuSheets(
  categories: MenuExportCategory[],
  items: MenuExportItem[],
  variants: MenuExportVariant[] = [],
  modifiers: MenuExportModifier[] = [],
  sides: MenuExportSide[] = [],
): SheetDef[] {
  return [
    {
      name: "Danh muc",
      columns: [
        { header: "Tên danh mục", key: "name", width: 28 },
        { header: "Loại", key: "type_label", width: 16 },
        { header: "Thứ tự", key: "sort_order", width: 10 },
        { header: "Hoạt động", key: "is_active", width: 12 },
      ],
      rows: categories.map((c) => ({
        name: c.name,
        type_label: CATEGORY_TYPE_LABELS[c.type] ?? c.type,
        sort_order: c.sort_order,
        is_active: c.is_active ? "Có" : "Không",
      })),
    },
    {
      name: "Mon an",
      columns: [
        { header: "Tên món", key: "name", width: 32 },
        { header: "Danh mục", key: "category_name", width: 24 },
        { header: "Giá (VND)", key: "base_price", width: 14 },
        { header: "Mô tả", key: "description", width: 40 },
        { header: "Thứ tự", key: "sort_order", width: 10 },
        { header: "Hoạt động", key: "is_active", width: 12 },
      ],
      rows: items.map((it) => ({
        name: it.name,
        category_name: it.category_name,
        base_price: it.base_price,
        description: it.description ?? "",
        sort_order: it.sort_order,
        is_active: it.is_active ? "Có" : "Không",
      })),
    },
    {
      name: "Bien the",
      columns: [
        { header: "Tên món", key: "item_name", width: 32 },
        { header: "Tên biến thể", key: "name", width: 24 },
        { header: "Chênh lệch giá (VND)", key: "price_adjustment", width: 20 },
        { header: "Thứ tự", key: "sort_order", width: 10 },
      ],
      rows: variants.map((v) => ({
        item_name: v.item_name,
        name: v.name,
        price_adjustment: v.price_adjustment,
        sort_order: v.sort_order,
      })),
    },
    {
      name: "Topping",
      columns: [
        { header: "Tên món", key: "item_name", width: 32 },
        { header: "Tên topping", key: "name", width: 24 },
        { header: "Giá (VND)", key: "price", width: 14 },
        { header: "Thứ tự", key: "sort_order", width: 10 },
      ],
      rows: modifiers.map((m) => ({
        item_name: m.item_name,
        name: m.name,
        price: m.price,
        sort_order: m.sort_order,
      })),
    },
    {
      name: "Mon phu",
      columns: [
        { header: "Món chính", key: "main_item_name", width: 32 },
        { header: "Món phụ", key: "side_item_name", width: 32 },
        { header: "Mặc định", key: "is_default", width: 12 },
      ],
      rows: sides.map((s) => ({
        main_item_name: s.main_item_name,
        side_item_name: s.side_item_name,
        is_default: s.is_default ? "Có" : "Không",
      })),
    },
  ];
}

type ExportMenuResult =
  | {
      success: true;
      data: { filename: string; base64: string; format: "xlsx" | "csv" };
    }
  | { success: false; error: string };

export async function exportMenu(
  format: "xlsx" | "csv" = "xlsx",
): Promise<ExportMenuResult> {
  const ctx = await getAuthContextWithPermission(
    MENU_MANAGER_ROLES,
    PERMISSION_KEYS.MENU_WRITE,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  const [catRes, itemRes, variantRes, modifierRes, sideRes] = await Promise.all(
    [
      supabase
        .from("menu_categories")
        .select("name, type, sort_order, is_active")
        .eq("tenant_id", claims.tenant_id)
        .order("sort_order")
        .order("name"),
      supabase
        .from("menu_items")
        .select(
          "name, base_price, description, sort_order, is_active, menu_categories(name)",
        )
        .eq("tenant_id", claims.tenant_id)
        .order("sort_order")
        .order("name"),
      supabase
        .from("menu_item_variants")
        .select("name, price_adjustment, sort_order, menu_items(name)")
        .eq("tenant_id", claims.tenant_id)
        .order("sort_order"),
      supabase
        .from("menu_item_modifiers")
        .select("name, price, sort_order, menu_items(name)")
        .eq("tenant_id", claims.tenant_id)
        .order("sort_order"),
      supabase
        .from("menu_item_available_sides")
        .select("is_default, main:main_item_id(name), side:side_item_id(name)")
        .eq("tenant_id", claims.tenant_id),
    ],
  );

  if (
    catRes.error ||
    itemRes.error ||
    variantRes.error ||
    modifierRes.error ||
    sideRes.error
  ) {
    return { success: false, error: "Không thể tải dữ liệu menu." };
  }

  const categories: MenuExportCategory[] = (catRes.data ?? []).map((c) => ({
    name: c.name,
    type: c.type as (typeof CATEGORY_TYPES)[number],
    sort_order: c.sort_order ?? 0,
    is_active: c.is_active ?? true,
  }));

  const items: MenuExportItem[] = (itemRes.data ?? []).map((it) => ({
    name: it.name,
    category_name: it.menu_categories?.name ?? "",
    base_price: Number(it.base_price ?? 0),
    description: it.description,
    sort_order: it.sort_order ?? 0,
    is_active: it.is_active ?? true,
  }));

  const variants: MenuExportVariant[] = (variantRes.data ?? [])
    .filter((v) => v.menu_items?.name)
    .map((v) => ({
      item_name: v.menu_items!.name,
      name: v.name,
      price_adjustment: Number(v.price_adjustment ?? 0),
      sort_order: v.sort_order ?? 0,
    }));

  const modifiers: MenuExportModifier[] = (modifierRes.data ?? [])
    .filter((m) => m.menu_items?.name)
    .map((m) => ({
      item_name: m.menu_items!.name,
      name: m.name,
      price: Number(m.price ?? 0),
      sort_order: m.sort_order ?? 0,
    }));

  const sides: MenuExportSide[] = (sideRes.data ?? [])
    .filter((s) => {
      const main = s.main as unknown as { name: string } | null;
      const side = s.side as unknown as { name: string } | null;
      return !!main?.name && !!side?.name;
    })
    .map((s) => {
      const main = s.main as unknown as { name: string };
      const side = s.side as unknown as { name: string };
      return {
        main_item_name: main.name,
        side_item_name: side.name,
        is_default: s.is_default ?? false,
      };
    });

  const sheets = buildMenuSheets(categories, items, variants, modifiers, sides);
  const stamp = getVNDateString();

  if (format === "csv") {
    const csv = buildCsv(sheets[1]!);
    return {
      success: true,
      data: {
        filename: `menu-mon-an-${stamp}.csv`,
        base64: stringToBase64(csv),
        format: "csv",
      },
    };
  }

  const buf = await buildXlsx(sheets);
  return {
    success: true,
    data: {
      filename: `menu-${stamp}.xlsx`,
      base64: bufferToBase64(buf),
      format: "xlsx",
    },
  };
}

const importCategoryRowSchema = z.object({
  name: z.string().trim().min(1, { error: "Thiếu tên danh mục" }),
  type: z.enum(CATEGORY_TYPES, { error: "Loại danh mục không hợp lệ" }),
  sort_order: z.coerce.number().int().min(0).default(0),
  is_active: z.boolean().default(true),
});

const importItemRowSchema = z.object({
  name: z.string().trim().min(1, { error: "Thiếu tên món" }),
  category_name: z.string().trim().min(1, { error: "Thiếu danh mục" }),
  base_price: z.coerce.number().min(0, { error: "Giá không hợp lệ" }),
  description: z.string().default(""),
  sort_order: z.coerce.number().int().min(0).default(0),
  is_active: z.boolean().default(true),
});

function parseBoolean(raw: string | undefined): boolean {
  if (!raw) return true;
  const s = raw.trim().toLowerCase();
  if (
    s === "" ||
    s === "có" ||
    s === "co" ||
    s === "true" ||
    s === "1" ||
    s === "yes" ||
    s === "x"
  ) {
    return true;
  }
  if (
    s === "không" ||
    s === "khong" ||
    s === "false" ||
    s === "0" ||
    s === "no"
  ) {
    return false;
  }
  return true;
}

function mapCategoryType(raw: string | undefined): string | null {
  if (!raw) return null;
  const key = raw.trim().toLowerCase();
  return CATEGORY_TYPE_BY_LABEL[key] ?? null;
}

export interface ImportIssue {
  sheet: string;
  row: number;
  field?: string;
  message: string;
}

export interface ImportMenuSummary {
  categoriesInserted: number;
  categoriesUpdated: number;
  itemsInserted: number;
  itemsUpdated: number;
  variantsItemsReplaced: number;
  modifiersItemsReplaced: number;
  sidesItemsReplaced: number;
}

const importVariantRowSchema = z.object({
  item_name: z.string().trim().min(1, { error: "Thiếu tên món" }),
  name: z.string().trim().min(1, { error: "Thiếu tên biến thể" }),
  price_adjustment: z.coerce.number(),
  sort_order: z.coerce.number().int().min(0).default(0),
});

const importModifierRowSchema = z.object({
  item_name: z.string().trim().min(1, { error: "Thiếu tên món" }),
  name: z.string().trim().min(1, { error: "Thiếu tên topping" }),
  price: z.coerce.number().min(0, { error: "Giá topping phải ≥ 0" }),
  sort_order: z.coerce.number().int().min(0).default(0),
});

const importSideRowSchema = z.object({
  main_item_name: z.string().trim().min(1, { error: "Thiếu món chính" }),
  side_item_name: z.string().trim().min(1, { error: "Thiếu món phụ" }),
  is_default: z.boolean().default(false),
});

type ImportMenuResult =
  | {
      success: true;
      data: { summary: ImportMenuSummary; warnings: ImportIssue[] };
    }
  | { success: false; error: string; issues?: ImportIssue[] };

export async function importMenu(
  formData: FormData,
): Promise<ImportMenuResult> {
  const ctx = await getAuthContextWithPermission(
    MENU_MANAGER_ROLES,
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
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Không đọc được file",
    };
  }

  const { supabase, claims } = ctx;

  let categorySheet = parsed.sheets.find((s) =>
    /danh\s*m[uụ]c|categor/i.test(s.name),
  );
  let itemSheet = parsed.sheets.find((s) =>
    /m[oó]n\s*[aă]n|^item|mon_an/i.test(s.name),
  );
  const variantSheet = parsed.sheets.find((s) =>
    /bi[eê]n\s*th[eể]|variant/i.test(s.name),
  );
  const modifierSheet = parsed.sheets.find((s) =>
    /topping|modifier/i.test(s.name),
  );
  const sideSheet = parsed.sheets.find((s) =>
    /m[oó]n\s*ph[uụ]|side/i.test(s.name),
  );

  if (parsed.format === "csv") {
    const sheet = parsed.sheets[0];
    if (!sheet) {
      return { success: false, error: "File CSV rỗng" };
    }
    const hasItemHeader = sheet.headers.some((h) =>
      /t[eê]n\s*m[oó]n|^name$/i.test(h),
    );
    const hasCategoryHeader = sheet.headers.some((h) =>
      /t[eê]n\s*danh\s*m[uụ]c/i.test(h),
    );
    if (hasItemHeader) {
      itemSheet = sheet;
      categorySheet = undefined;
    } else if (hasCategoryHeader) {
      categorySheet = sheet;
      itemSheet = undefined;
    } else {
      return {
        success: false,
        error:
          'CSV không nhận diện được. Header phải có "Tên món" (import món ăn) hoặc "Tên danh mục" (import danh mục).',
      };
    }
  }

  if (
    !categorySheet &&
    !itemSheet &&
    !variantSheet &&
    !modifierSheet &&
    !sideSheet
  ) {
    return {
      success: false,
      error:
        "Không tìm thấy sheet nào phù hợp. Vui lòng tải template để xem định dạng.",
    };
  }

  const issues: ImportIssue[] = [];
  const summary: ImportMenuSummary = {
    categoriesInserted: 0,
    categoriesUpdated: 0,
    itemsInserted: 0,
    itemsUpdated: 0,
    variantsItemsReplaced: 0,
    modifiersItemsReplaced: 0,
    sidesItemsReplaced: 0,
  };

  // ─── Phase 1: Categories (upsert) ───
  if (categorySheet) {
    const rowsToUpsert: {
      tenant_id: number;
      name: string;
      type: (typeof CATEGORY_TYPES)[number];
      sort_order: number;
      is_active: boolean;
    }[] = [];

    categorySheet.rows.forEach((raw, idx) => {
      const rowNumber = idx + 2;
      const typeKey = mapCategoryType(raw["Loại"] ?? raw["type"]);
      if (!typeKey) {
        issues.push({
          sheet: categorySheet.name,
          row: rowNumber,
          field: "Loại",
          message: `Loại không hợp lệ: "${raw["Loại"] ?? raw["type"] ?? ""}"`,
        });
        return;
      }
      const parsedRow = importCategoryRowSchema.safeParse({
        name: raw["Tên danh mục"] ?? raw["name"],
        type: typeKey,
        sort_order: raw["Thứ tự"] ?? raw["sort_order"] ?? 0,
        is_active: parseBoolean(raw["Hoạt động"] ?? raw["is_active"]),
      });
      if (!parsedRow.success) {
        issues.push({
          sheet: categorySheet.name,
          row: rowNumber,
          field: parsedRow.error.issues[0]?.path.join("."),
          message: parsedRow.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
        });
        return;
      }
      rowsToUpsert.push({
        tenant_id: claims.tenant_id,
        ...parsedRow.data,
      });
    });

    if (issues.length > 0) {
      return {
        success: false,
        error: `Có ${issues.length} dòng lỗi trong "Danh muc". Vui lòng sửa và thử lại.`,
        issues,
      };
    }

    if (rowsToUpsert.length > 0) {
      const { data: existingCats } = await supabase
        .from("menu_categories")
        .select("name")
        .eq("tenant_id", claims.tenant_id);
      const existingNames = new Set((existingCats ?? []).map((c) => c.name));

      const { error } = await supabase
        .from("menu_categories")
        .upsert(rowsToUpsert, { onConflict: "name,tenant_id" });

      if (error) {
        return {
          success: false,
          error: `Không thể ghi danh mục: ${mapDbError(error.code)}`,
        };
      }

      for (const row of rowsToUpsert) {
        if (existingNames.has(row.name)) summary.categoriesUpdated += 1;
        else summary.categoriesInserted += 1;
      }
    }
  }

  // ─── Phase 2: Items (need category_id lookup) ───
  if (itemSheet) {
    const { data: cats, error: catErr } = await supabase
      .from("menu_categories")
      .select("id, name")
      .eq("tenant_id", claims.tenant_id);

    if (catErr) {
      return { success: false, error: "Không thể tra danh mục để import món." };
    }

    const categoryIdByName = new Map<string, number>();
    for (const c of cats ?? []) {
      categoryIdByName.set(c.name.toLowerCase(), c.id);
    }

    const itemRowsToUpsert: {
      tenant_id: number;
      category_id: number;
      name: string;
      base_price: number;
      description: string | null;
      sort_order: number;
      is_active: boolean;
    }[] = [];

    itemSheet.rows.forEach((raw, idx) => {
      const rowNumber = idx + 2;
      const parsedRow = importItemRowSchema.safeParse({
        name: raw["Tên món"] ?? raw["name"],
        category_name: raw["Danh mục"] ?? raw["category_name"],
        base_price: raw["Giá (VND)"] ?? raw["base_price"] ?? 0,
        description: raw["Mô tả"] ?? raw["description"] ?? "",
        sort_order: raw["Thứ tự"] ?? raw["sort_order"] ?? 0,
        is_active: parseBoolean(raw["Hoạt động"] ?? raw["is_active"]),
      });
      if (!parsedRow.success) {
        issues.push({
          sheet: itemSheet.name,
          row: rowNumber,
          field: parsedRow.error.issues[0]?.path.join("."),
          message: parsedRow.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
        });
        return;
      }

      const categoryId = categoryIdByName.get(
        parsedRow.data.category_name.toLowerCase(),
      );
      if (!categoryId) {
        issues.push({
          sheet: itemSheet.name,
          row: rowNumber,
          field: "Danh mục",
          message: `Danh mục "${parsedRow.data.category_name}" không tồn tại. Thêm vào sheet "Danh muc" trước.`,
        });
        return;
      }

      itemRowsToUpsert.push({
        tenant_id: claims.tenant_id,
        category_id: categoryId,
        name: parsedRow.data.name,
        base_price: parsedRow.data.base_price,
        description: parsedRow.data.description || null,
        sort_order: parsedRow.data.sort_order,
        is_active: parsedRow.data.is_active,
      });
    });

    if (issues.length > 0) {
      return {
        success: false,
        error: `Có ${issues.length} dòng lỗi trong "Mon an". Vui lòng sửa và thử lại.`,
        issues,
      };
    }

    if (itemRowsToUpsert.length > 0) {
      const { data: existingItems } = await supabase
        .from("menu_items")
        .select("name")
        .eq("tenant_id", claims.tenant_id);
      const existingNames = new Set((existingItems ?? []).map((i) => i.name));

      const { error } = await supabase
        .from("menu_items")
        .upsert(itemRowsToUpsert, { onConflict: "name,tenant_id" });

      if (error) {
        return {
          success: false,
          error: `Không thể ghi món: ${mapDbError(error.code)}`,
        };
      }

      for (const row of itemRowsToUpsert) {
        if (existingNames.has(row.name)) summary.itemsUpdated += 1;
        else summary.itemsInserted += 1;
      }
    }
  }

  // ─── Phase 3+: Variants / Modifiers / Sides (per-item replace via RPC) ───
  const needsItemLookup = variantSheet || modifierSheet || sideSheet;
  let itemIdByName = new Map<string, number>();

  if (needsItemLookup) {
    const { data: allItems, error: itemErr } = await supabase
      .from("menu_items")
      .select("id, name")
      .eq("tenant_id", claims.tenant_id);
    if (itemErr) {
      return {
        success: false,
        error: "Không thể tra món để import biến thể/topping/món phụ.",
      };
    }
    itemIdByName = new Map(
      (allItems ?? []).map((it) => [it.name.toLowerCase(), it.id]),
    );
  }

  // Phase 3: Variants
  if (variantSheet) {
    const groups = new Map<
      string,
      {
        itemName: string;
        variants: {
          name: string;
          price_adjustment: number;
          sort_order: number;
        }[];
      }
    >();

    variantSheet.rows.forEach((raw, idx) => {
      const rowNumber = idx + 2;
      const parsedRow = importVariantRowSchema.safeParse({
        item_name: raw["Tên món"] ?? raw["item_name"],
        name: raw["Tên biến thể"] ?? raw["name"],
        price_adjustment:
          raw["Chênh lệch giá (VND)"] ?? raw["price_adjustment"] ?? 0,
        sort_order: raw["Thứ tự"] ?? raw["sort_order"] ?? 0,
      });
      if (!parsedRow.success) {
        issues.push({
          sheet: variantSheet.name,
          row: rowNumber,
          field: parsedRow.error.issues[0]?.path.join("."),
          message: parsedRow.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
        });
        return;
      }
      const key = parsedRow.data.item_name.toLowerCase();
      if (!itemIdByName.has(key)) {
        issues.push({
          sheet: variantSheet.name,
          row: rowNumber,
          field: "Tên món",
          message: `Món "${parsedRow.data.item_name}" không tồn tại.`,
        });
        return;
      }
      const existing = groups.get(key);
      if (existing) {
        existing.variants.push({
          name: parsedRow.data.name,
          price_adjustment: parsedRow.data.price_adjustment,
          sort_order: parsedRow.data.sort_order,
        });
      } else {
        groups.set(key, {
          itemName: parsedRow.data.item_name,
          variants: [
            {
              name: parsedRow.data.name,
              price_adjustment: parsedRow.data.price_adjustment,
              sort_order: parsedRow.data.sort_order,
            },
          ],
        });
      }
    });

    if (issues.length > 0) {
      return {
        success: false,
        error: `Có ${issues.length} dòng lỗi trong "Bien the". Vui lòng sửa và thử lại.`,
        issues,
      };
    }

    for (const [key, group] of groups) {
      const itemId = itemIdByName.get(key);
      if (!itemId) continue;
      const { error } = await supabase.rpc("save_item_variants", {
        p_item_id: itemId,
        p_variants: group.variants.map((v, i) => ({
          name: v.name,
          price_adjustment: v.price_adjustment,
          sort_order: v.sort_order ?? i,
        })),
      });
      if (error) {
        return {
          success: false,
          error: `Không thể ghi biến thể cho "${group.itemName}": ${mapDbError(error.code)}`,
        };
      }
      summary.variantsItemsReplaced += 1;
    }
  }

  // Phase 4: Modifiers (toppings)
  if (modifierSheet) {
    const groups = new Map<
      string,
      {
        itemName: string;
        modifiers: { name: string; price: number; sort_order: number }[];
      }
    >();

    modifierSheet.rows.forEach((raw, idx) => {
      const rowNumber = idx + 2;
      const parsedRow = importModifierRowSchema.safeParse({
        item_name: raw["Tên món"] ?? raw["item_name"],
        name: raw["Tên topping"] ?? raw["name"],
        price: raw["Giá (VND)"] ?? raw["price"] ?? 0,
        sort_order: raw["Thứ tự"] ?? raw["sort_order"] ?? 0,
      });
      if (!parsedRow.success) {
        issues.push({
          sheet: modifierSheet.name,
          row: rowNumber,
          field: parsedRow.error.issues[0]?.path.join("."),
          message: parsedRow.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
        });
        return;
      }
      const key = parsedRow.data.item_name.toLowerCase();
      if (!itemIdByName.has(key)) {
        issues.push({
          sheet: modifierSheet.name,
          row: rowNumber,
          field: "Tên món",
          message: `Món "${parsedRow.data.item_name}" không tồn tại.`,
        });
        return;
      }
      const existing = groups.get(key);
      const entry = {
        name: parsedRow.data.name,
        price: parsedRow.data.price,
        sort_order: parsedRow.data.sort_order,
      };
      if (existing) existing.modifiers.push(entry);
      else
        groups.set(key, {
          itemName: parsedRow.data.item_name,
          modifiers: [entry],
        });
    });

    if (issues.length > 0) {
      return {
        success: false,
        error: `Có ${issues.length} dòng lỗi trong "Topping". Vui lòng sửa và thử lại.`,
        issues,
      };
    }

    for (const [key, group] of groups) {
      const itemId = itemIdByName.get(key);
      if (!itemId) continue;
      const { error } = await supabase.rpc("save_item_modifiers", {
        p_item_id: itemId,
        p_modifiers: group.modifiers.map((m, i) => ({
          name: m.name,
          price: m.price,
          sort_order: m.sort_order ?? i,
        })),
      });
      if (error) {
        return {
          success: false,
          error: `Không thể ghi topping cho "${group.itemName}": ${mapDbError(error.code)}`,
        };
      }
      summary.modifiersItemsReplaced += 1;
    }
  }

  // Phase 5: Available sides
  if (sideSheet) {
    const groups = new Map<
      string,
      {
        mainItemName: string;
        sides: { side_item_id: number; is_default: boolean }[];
      }
    >();

    sideSheet.rows.forEach((raw, idx) => {
      const rowNumber = idx + 2;
      const parsedRow = importSideRowSchema.safeParse({
        main_item_name: raw["Món chính"] ?? raw["main_item_name"],
        side_item_name: raw["Món phụ"] ?? raw["side_item_name"],
        is_default: parseBoolean(raw["Mặc định"] ?? raw["is_default"]),
      });
      if (!parsedRow.success) {
        issues.push({
          sheet: sideSheet.name,
          row: rowNumber,
          field: parsedRow.error.issues[0]?.path.join("."),
          message: parsedRow.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
        });
        return;
      }
      const mainKey = parsedRow.data.main_item_name.toLowerCase();
      const sideKey = parsedRow.data.side_item_name.toLowerCase();
      const mainId = itemIdByName.get(mainKey);
      const sideId = itemIdByName.get(sideKey);
      if (!mainId) {
        issues.push({
          sheet: sideSheet.name,
          row: rowNumber,
          field: "Món chính",
          message: `Món chính "${parsedRow.data.main_item_name}" không tồn tại.`,
        });
        return;
      }
      if (!sideId) {
        issues.push({
          sheet: sideSheet.name,
          row: rowNumber,
          field: "Món phụ",
          message: `Món phụ "${parsedRow.data.side_item_name}" không tồn tại.`,
        });
        return;
      }
      const existing = groups.get(mainKey);
      const entry = {
        side_item_id: sideId,
        is_default: parsedRow.data.is_default,
      };
      if (existing) existing.sides.push(entry);
      else
        groups.set(mainKey, {
          mainItemName: parsedRow.data.main_item_name,
          sides: [entry],
        });
    });

    if (issues.length > 0) {
      return {
        success: false,
        error: `Có ${issues.length} dòng lỗi trong "Mon phu". Vui lòng sửa và thử lại.`,
        issues,
      };
    }

    for (const [mainKey, group] of groups) {
      const mainId = itemIdByName.get(mainKey);
      if (!mainId) continue;
      const { error } = await supabase.rpc("save_item_sides", {
        p_main_item_id: mainId,
        p_sides: group.sides,
      });
      if (error) {
        return {
          success: false,
          error: `Không thể ghi món phụ cho "${group.mainItemName}": ${mapDbError(error.code)}`,
        };
      }
      summary.sidesItemsReplaced += 1;
    }
  }

  revalidateSurfacePath("/menu");
  // Bulk import writes items/variants/modifiers/sides — bust the POS cached menu
  // structure like the single-row menu mutations do (tag: menu-structure).
  updateTag("menu-structure");
  return { success: true, data: { summary, warnings: [] } };
}

export async function downloadMenuTemplate(): Promise<ActionResult> {
  const ctx = await getAuthContextWithPermission(
    MENU_MANAGER_ROLES,
    PERMISSION_KEYS.MENU_WRITE,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const sheets = buildMenuSheets(
    [
      {
        name: "Món chính (ví dụ)",
        type: "main_dish",
        sort_order: 1,
        is_active: true,
      },
    ],
    [
      {
        name: "Cơm tấm sườn (ví dụ)",
        category_name: "Món chính (ví dụ)",
        base_price: 55000,
        description: "Mô tả tùy chọn",
        sort_order: 1,
        is_active: true,
      },
    ],
    [
      {
        item_name: "Cơm tấm sườn (ví dụ)",
        name: "Size lớn",
        price_adjustment: 10000,
        sort_order: 1,
      },
    ],
    [
      {
        item_name: "Cơm tấm sườn (ví dụ)",
        name: "Thêm trứng",
        price: 8000,
        sort_order: 1,
      },
    ],
    [],
  );

  const buf = await buildXlsx(sheets);
  return {
    success: true,
    data: {
      filename: "menu-template.xlsx",
      base64: bufferToBase64(buf),
      format: "xlsx" as const,
    },
  };
}
