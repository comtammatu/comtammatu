"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ADMIN_ROLES } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getAuthContext } from "../_lib/auth";

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

/* ─── Variant/Modifier Schemas ─── */

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

/* ─── Shared Validation ─── */

const idSchema = z.coerce.number().int().positive({ error: "ID không hợp lệ" });

/* ─── Category Actions ─── */

export async function createCategory(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = createCategorySchema.safeParse({
    name: formData.get("name"),
    type: formData.get("type"),
    sort_order: formData.get("sort_order") || 0,
  });

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const ctx = await getAuthContext(MENU_MANAGER_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  const { error } = await supabase.from("menu_categories").insert({
    tenant_id: claims.tenant_id,
    name: parsed.data.name,
    type: parsed.data.type,
    sort_order: parsed.data.sort_order,
  });

  if (error) {
    return { success: false, error: mapDbError(error.code) };
  }

  revalidatePath("/admin/menu");
  return { success: true };
}

export async function updateCategory(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = updateCategorySchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    type: formData.get("type"),
    sort_order: formData.get("sort_order") || 0,
  });

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const ctx = await getAuthContext(MENU_MANAGER_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  const { error } = await supabase
    .from("menu_categories")
    .update({
      name: parsed.data.name,
      type: parsed.data.type,
      sort_order: parsed.data.sort_order,
    })
    .eq("id", parsed.data.id)
    .eq("tenant_id", claims.tenant_id);

  if (error) {
    return { success: false, error: mapDbError(error.code) };
  }

  revalidatePath("/admin/menu");
  return { success: true };
}

export async function toggleCategoryActive(
  categoryId: number,
): Promise<ActionResult> {
  const parsedId = idSchema.safeParse(categoryId);
  if (!parsedId.success) return { success: false, error: "ID không hợp lệ" };

  const ctx = await getAuthContext(MENU_MANAGER_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase } = ctx;

  const { error } = await supabase.rpc("toggle_category_active", {
    p_id: parsedId.data,
  });

  if (error) {
    if (error.message?.includes("not_found")) {
      return { success: false, error: "Danh mục không tồn tại" };
    }
    return { success: false, error: mapDbError(error.code) };
  }

  revalidatePath("/admin/menu");
  return { success: true };
}

/* ─── Item Actions ─── */

export async function createItem(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = createItemSchema.safeParse({
    name: formData.get("name"),
    category_id: formData.get("category_id"),
    base_price: formData.get("base_price"),
    description: formData.get("description"),
  });

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const ctx = await getAuthContext(MENU_MANAGER_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  const { error } = await supabase.from("menu_items").insert({
    tenant_id: claims.tenant_id,
    category_id: parsed.data.category_id,
    name: parsed.data.name,
    base_price: parsed.data.base_price,
    description: parsed.data.description || null,
  });

  if (error) {
    return { success: false, error: mapDbError(error.code) };
  }

  revalidatePath("/admin/menu");
  return { success: true };
}

export async function updateItem(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = updateItemSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    category_id: formData.get("category_id"),
    base_price: formData.get("base_price"),
    description: formData.get("description"),
  });

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const ctx = await getAuthContext(MENU_MANAGER_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  const { error } = await supabase
    .from("menu_items")
    .update({
      name: parsed.data.name,
      category_id: parsed.data.category_id,
      base_price: parsed.data.base_price,
      description: parsed.data.description || null,
    })
    .eq("id", parsed.data.id)
    .eq("tenant_id", claims.tenant_id);

  if (error) {
    return { success: false, error: mapDbError(error.code) };
  }

  revalidatePath("/admin/menu");
  return { success: true };
}

export async function toggleItemActive(itemId: number): Promise<ActionResult> {
  const parsedId = idSchema.safeParse(itemId);
  if (!parsedId.success) return { success: false, error: "ID không hợp lệ" };

  const ctx = await getAuthContext(MENU_MANAGER_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase } = ctx;

  const { error } = await supabase.rpc("toggle_item_active", {
    p_id: parsedId.data,
  });

  if (error) {
    if (error.message?.includes("not_found")) {
      return { success: false, error: "Món ăn không tồn tại" };
    }
    return { success: false, error: mapDbError(error.code) };
  }

  revalidatePath("/admin/menu");
  return { success: true };
}

/* ─── Variants ─── */

export async function saveVariants(
  itemId: number,
  variants: z.infer<typeof variantEntrySchema>[],
): Promise<ActionResult> {
  const parsedId = idSchema.safeParse(itemId);
  if (!parsedId.success) return { success: false, error: "ID không hợp lệ" };

  const parsed = z.array(variantEntrySchema).safeParse(variants);
  if (!parsed.success) {
    return { success: false, error: "Dữ liệu biến thể không hợp lệ" };
  }

  const ctx = await getAuthContext(MENU_MANAGER_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase } = ctx;

  // RPC types available after migration applied + pnpm db:types
  const { error } = await (supabase.rpc as CallableFunction)(
    "save_item_variants",
    {
      p_item_id: parsedId.data,
      p_variants: JSON.stringify(
        parsed.data.map((v, idx) => ({
          name: v.name,
          price_adjustment: v.price_adjustment,
          sort_order: v.sort_order ?? idx,
        })),
      ),
    },
  );

  if (error) {
    if (error.message === "item not found") {
      return { success: false, error: "Món ăn không tồn tại" };
    }
    return { success: false, error: mapDbError(error.code) };
  }

  revalidatePath("/admin/menu");
  return { success: true };
}

/* ─── Modifiers ─── */

export async function saveModifiers(
  itemId: number,
  modifiers: z.infer<typeof modifierEntrySchema>[],
): Promise<ActionResult> {
  const parsedId = idSchema.safeParse(itemId);
  if (!parsedId.success) return { success: false, error: "ID không hợp lệ" };

  const parsed = z.array(modifierEntrySchema).safeParse(modifiers);
  if (!parsed.success) {
    return { success: false, error: "Dữ liệu tùy chọn không hợp lệ" };
  }

  const ctx = await getAuthContext(MENU_MANAGER_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase } = ctx;

  // RPC types available after migration applied + pnpm db:types
  const { error } = await (supabase.rpc as CallableFunction)(
    "save_item_modifiers",
    {
      p_item_id: parsedId.data,
      p_modifiers: JSON.stringify(
        parsed.data.map((m, idx) => ({
          name: m.name,
          price: m.price,
          sort_order: m.sort_order ?? idx,
        })),
      ),
    },
  );

  if (error) {
    if (error.message === "item not found") {
      return { success: false, error: "Món ăn không tồn tại" };
    }
    return { success: false, error: mapDbError(error.code) };
  }

  revalidatePath("/admin/menu");
  return { success: true };
}

/* ─── Available Sides ─── */

const sideItemSchema = z.object({
  id: z.number().int().positive(),
  is_default: z.boolean(),
});

const saveSidesSchema = z.object({
  mainItemId: z.number().int().positive(),
  sideItemIds: z.array(sideItemSchema),
});

export async function saveSides(
  mainItemId: number,
  sideItemIds: { id: number; is_default: boolean }[],
): Promise<ActionResult> {
  const parsed = saveSidesSchema.safeParse({ mainItemId, sideItemIds });
  if (!parsed.success) {
    return { success: false, error: "Dữ liệu không hợp lệ" };
  }

  const ctx = await getAuthContext(MENU_MANAGER_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase } = ctx;

  const validatedItemId = parsed.data.mainItemId;
  const validatedSides = parsed.data.sideItemIds;

  // RPC types available after migration applied + pnpm db:types
  const { error } = await (supabase.rpc as CallableFunction)(
    "save_item_sides",
    {
      p_main_item_id: validatedItemId,
      p_sides: JSON.stringify(
        validatedSides.map((s) => ({
          side_item_id: s.id,
          is_default: s.is_default,
        })),
      ),
    },
  );

  if (error) {
    if (error.message === "item not found") {
      return { success: false, error: "Món ăn không tồn tại" };
    }
    return { success: false, error: mapDbError(error.code) };
  }

  revalidatePath("/admin/menu");
  return { success: true };
}
