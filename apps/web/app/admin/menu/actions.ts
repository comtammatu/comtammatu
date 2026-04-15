"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ADMIN_ROLES } from "@comtammatu/shared/auth";
import { withAction, withFormAction } from "@/_lib/with-action";

/* ─── Helpers ─── */

const MENU_MANAGER_ROLES = ADMIN_ROLES;

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

const createItemSchema = z.object({
  name: z.string().min(1, { error: "Tên món không được để trống" }),
  category_id: z.coerce.number().int().positive({ error: "Chọn danh mục" }),
  base_price: z.coerce.number().min(0, { error: "Giá không hợp lệ" }),
  description: z.string().optional().default(""),
});

const updateItemSchema = z.object({
  id: z.coerce.number().int().positive(),
  name: z.string().min(1, { error: "Tên món không được để trống" }),
  category_id: z.coerce.number().int().positive({ error: "Chọn danh mục" }),
  base_price: z.coerce.number().min(0, { error: "Giá không hợp lệ" }),
  description: z.string().optional().default(""),
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

    revalidatePath("/admin/menu");
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

    revalidatePath("/admin/menu");
    return { success: true };
  },
);

export const toggleCategoryActive = withAction(
  { roles: MENU_MANAGER_ROLES, schema: toggleIdSchema },
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

    revalidatePath("/admin/menu");
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
      description: fd.get("description"),
    }),
  },
  async (data, { supabase, claims }) => {
    const { error } = await supabase.from("menu_items").insert({
      tenant_id: claims.tenant_id,
      category_id: data.category_id,
      name: data.name,
      base_price: data.base_price,
      description: data.description || null,
    });

    if (error) {
      return { success: false, error: mapDbError(error.code) };
    }

    revalidatePath("/admin/menu");
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
      description: fd.get("description"),
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
      })
      .eq("id", data.id)
      .eq("tenant_id", claims.tenant_id);

    if (error) {
      return { success: false, error: mapDbError(error.code) };
    }

    revalidatePath("/admin/menu");
    return { success: true };
  },
);

export const toggleItemActive = withAction(
  { roles: MENU_MANAGER_ROLES, schema: toggleIdSchema },
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

    revalidatePath("/admin/menu");
    return { success: true };
  },
);

/* ─── Variants ─── */

export const saveVariants = withAction(
  { roles: MENU_MANAGER_ROLES, schema: saveVariantsSchema },
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

    revalidatePath("/admin/menu");
    return { success: true };
  },
);

/* ─── Modifiers ─── */

export const saveModifiers = withAction(
  { roles: MENU_MANAGER_ROLES, schema: saveModifiersSchema },
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

    revalidatePath("/admin/menu");
    return { success: true };
  },
);

/* ─── Available Sides ─── */

export const saveSides = withAction(
  { roles: MENU_MANAGER_ROLES, schema: saveSidesSchema },
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

    revalidatePath("/admin/menu");
    return { success: true };
  },
);
