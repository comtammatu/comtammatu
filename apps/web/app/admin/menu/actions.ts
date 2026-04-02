"use server";

import { z } from "zod";
import { createClient } from "@comtammatu/database/supabase/server";
import { extractClaims } from "@comtammatu/shared/auth";

interface ActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

async function getAuthContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { supabase, tenantId: null };

  const claims = extractClaims(user.app_metadata);
  return { supabase, tenantId: claims?.tenant_id ?? null };
}

// ─── Categories ───────────────────────────────────────────────────────────────

export type Category = {
  id: number;
  tenant_id: number;
  name: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

const categorySchema = z.object({
  name: z.string().min(1, { error: "Tên danh mục không được để trống" }),
  sort_order: z.number().int().min(0).optional(),
  is_active: z.boolean().optional(),
});

export type CategoryInput = z.infer<typeof categorySchema>;

export async function getCategories(): Promise<ActionResult<Category[]>> {
  const { supabase, tenantId } = await getAuthContext();
  if (!tenantId) return { success: false, error: "Không có quyền truy cập" };

  const { data, error } = await supabase
    .from("menu_categories")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("sort_order", { ascending: true });

  if (error) return { success: false, error: "Không thể tải danh mục" };
  return { success: true, data: data ?? [] };
}

export async function createCategory(
  formData: CategoryInput,
): Promise<ActionResult<Category>> {
  const { supabase, tenantId } = await getAuthContext();
  if (!tenantId) return { success: false, error: "Không có quyền truy cập" };

  const parsed = categorySchema.safeParse(formData);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const { data, error } = await supabase
    .from("menu_categories")
    .insert({
      tenant_id: tenantId,
      name: parsed.data.name,
      sort_order: parsed.data.sort_order ?? 0,
      is_active: parsed.data.is_active ?? true,
    })
    .select()
    .single();

  if (error) return { success: false, error: "Không thể tạo danh mục" };
  return { success: true, data };
}

export async function updateCategory(
  id: number,
  formData: CategoryInput,
): Promise<ActionResult<Category>> {
  const { supabase, tenantId } = await getAuthContext();
  if (!tenantId) return { success: false, error: "Không có quyền truy cập" };

  const parsed = categorySchema.safeParse(formData);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const { data, error } = await supabase
    .from("menu_categories")
    .update({
      name: parsed.data.name,
      sort_order: parsed.data.sort_order ?? 0,
      is_active: parsed.data.is_active ?? true,
    })
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select()
    .single();

  if (error) return { success: false, error: "Không thể cập nhật danh mục" };
  return { success: true, data };
}

export async function deleteCategory(id: number): Promise<ActionResult> {
  const { supabase, tenantId } = await getAuthContext();
  if (!tenantId) return { success: false, error: "Không có quyền truy cập" };

  const { error } = await supabase
    .from("menu_categories")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId);

  if (error) return { success: false, error: "Không thể xóa danh mục" };
  return { success: true };
}

// ─── Menu Items ───────────────────────────────────────────────────────────────

export type MenuItem = {
  id: number;
  tenant_id: number;
  category_id: number;
  name: string;
  description: string | null;
  base_price: number;
  image_url: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  variants_count?: number;
  modifiers_count?: number;
};

const menuItemSchema = z.object({
  name: z.string().min(1, { error: "Tên món không được để trống" }),
  description: z.string().optional(),
  base_price: z.number().min(0, { error: "Giá không hợp lệ" }),
  category_id: z.number().int().positive({ error: "Danh mục không hợp lệ" }),
  sort_order: z.number().int().min(0).optional(),
  is_active: z.boolean().optional(),
});

export type MenuItemInput = z.infer<typeof menuItemSchema>;

export async function getMenuItems(
  categoryId?: number,
): Promise<ActionResult<MenuItem[]>> {
  const { supabase, tenantId } = await getAuthContext();
  if (!tenantId) return { success: false, error: "Không có quyền truy cập" };

  let query = supabase
    .from("menu_items")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("sort_order", { ascending: true });

  if (categoryId !== undefined) {
    query = query.eq("category_id", categoryId);
  }

  const { data, error } = await query;
  if (error) return { success: false, error: "Không thể tải danh sách món" };
  return { success: true, data: data ?? [] };
}

export async function createMenuItem(
  formData: MenuItemInput,
): Promise<ActionResult<MenuItem>> {
  const { supabase, tenantId } = await getAuthContext();
  if (!tenantId) return { success: false, error: "Không có quyền truy cập" };

  const parsed = menuItemSchema.safeParse(formData);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const { data, error } = await supabase
    .from("menu_items")
    .insert({
      tenant_id: tenantId,
      category_id: parsed.data.category_id,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      base_price: parsed.data.base_price,
      sort_order: parsed.data.sort_order ?? 0,
      is_active: parsed.data.is_active ?? true,
    })
    .select()
    .single();

  if (error) return { success: false, error: "Không thể tạo món ăn" };
  return { success: true, data };
}

export async function updateMenuItem(
  id: number,
  formData: MenuItemInput,
): Promise<ActionResult<MenuItem>> {
  const { supabase, tenantId } = await getAuthContext();
  if (!tenantId) return { success: false, error: "Không có quyền truy cập" };

  const parsed = menuItemSchema.safeParse(formData);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const { data, error } = await supabase
    .from("menu_items")
    .update({
      category_id: parsed.data.category_id,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      base_price: parsed.data.base_price,
      sort_order: parsed.data.sort_order ?? 0,
      is_active: parsed.data.is_active ?? true,
    })
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select()
    .single();

  if (error) return { success: false, error: "Không thể cập nhật món ăn" };
  return { success: true, data };
}

export async function deleteMenuItem(id: number): Promise<ActionResult> {
  const { supabase, tenantId } = await getAuthContext();
  if (!tenantId) return { success: false, error: "Không có quyền truy cập" };

  const { error } = await supabase
    .from("menu_items")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId);

  if (error) return { success: false, error: "Không thể xóa món ăn" };
  return { success: true };
}

// ─── Item Details ─────────────────────────────────────────────────────────────

export type Variant = {
  id: number;
  tenant_id: number;
  menu_item_id: number;
  name: string;
  price_adjustment: number;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type Modifier = {
  id: number;
  tenant_id: number;
  menu_item_id: number;
  name: string;
  price: number;
  is_default: boolean;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type AvailableSide = {
  id: number;
  side_item_id: number;
};

export type ItemDetails = MenuItem & {
  variants: Variant[];
  modifiers: Modifier[];
  available_sides: AvailableSide[];
};

export async function getItemDetails(
  id: number,
): Promise<ActionResult<ItemDetails>> {
  const { supabase, tenantId } = await getAuthContext();
  if (!tenantId) return { success: false, error: "Không có quyền truy cập" };

  const [itemResult, variantsResult, modifiersResult, sidesResult] =
    await Promise.all([
      supabase
        .from("menu_items")
        .select("*")
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .single(),
      supabase
        .from("menu_item_variants")
        .select("*")
        .eq("menu_item_id", id)
        .eq("tenant_id", tenantId)
        .order("sort_order"),
      supabase
        .from("menu_item_modifiers")
        .select("*")
        .eq("menu_item_id", id)
        .eq("tenant_id", tenantId)
        .order("sort_order"),
      supabase
        .from("menu_item_available_sides")
        .select("id, side_item_id")
        .eq("menu_item_id", id)
        .eq("tenant_id", tenantId),
    ]);

  if (itemResult.error || !itemResult.data) {
    return { success: false, error: "Không tìm thấy món ăn" };
  }

  return {
    success: true,
    data: {
      ...itemResult.data,
      variants: variantsResult.data ?? [],
      modifiers: modifiersResult.data ?? [],
      available_sides: sidesResult.data ?? [],
    },
  };
}

// ─── Variants ─────────────────────────────────────────────────────────────────

const variantSchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().min(1, { error: "Tên biến thể không được để trống" }),
  price_adjustment: z.number(),
  sort_order: z.number().int().min(0).optional(),
  is_active: z.boolean().optional(),
});

export type VariantInput = z.infer<typeof variantSchema>;

export async function upsertVariant(
  itemId: number,
  variantData: VariantInput,
): Promise<ActionResult<Variant>> {
  const { supabase, tenantId } = await getAuthContext();
  if (!tenantId) return { success: false, error: "Không có quyền truy cập" };

  const parsed = variantSchema.safeParse(variantData);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const payload = {
    tenant_id: tenantId,
    menu_item_id: itemId,
    name: parsed.data.name,
    price_adjustment: parsed.data.price_adjustment,
    sort_order: parsed.data.sort_order ?? 0,
    is_active: parsed.data.is_active ?? true,
  };

  if (parsed.data.id) {
    const { data, error } = await supabase
      .from("menu_item_variants")
      .update(payload)
      .eq("id", parsed.data.id)
      .eq("tenant_id", tenantId)
      .select()
      .single();
    if (error) return { success: false, error: "Không thể cập nhật biến thể" };
    return { success: true, data };
  }

  const { data, error } = await supabase
    .from("menu_item_variants")
    .insert(payload)
    .select()
    .single();
  if (error) return { success: false, error: "Không thể tạo biến thể" };
  return { success: true, data };
}

export async function deleteVariant(id: number): Promise<ActionResult> {
  const { supabase, tenantId } = await getAuthContext();
  if (!tenantId) return { success: false, error: "Không có quyền truy cập" };

  const { error } = await supabase
    .from("menu_item_variants")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId);

  if (error) return { success: false, error: "Không thể xóa biến thể" };
  return { success: true };
}

// ─── Modifiers ────────────────────────────────────────────────────────────────

const modifierSchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().min(1, { error: "Tên topping không được để trống" }),
  price: z.number().min(0),
  is_default: z.boolean().optional(),
  sort_order: z.number().int().min(0).optional(),
  is_active: z.boolean().optional(),
});

export type ModifierInput = z.infer<typeof modifierSchema>;

export async function upsertModifier(
  itemId: number,
  modifierData: ModifierInput,
): Promise<ActionResult<Modifier>> {
  const { supabase, tenantId } = await getAuthContext();
  if (!tenantId) return { success: false, error: "Không có quyền truy cập" };

  const parsed = modifierSchema.safeParse(modifierData);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const payload = {
    tenant_id: tenantId,
    menu_item_id: itemId,
    name: parsed.data.name,
    price: parsed.data.price,
    is_default: parsed.data.is_default ?? false,
    sort_order: parsed.data.sort_order ?? 0,
    is_active: parsed.data.is_active ?? true,
  };

  if (parsed.data.id) {
    const { data, error } = await supabase
      .from("menu_item_modifiers")
      .update(payload)
      .eq("id", parsed.data.id)
      .eq("tenant_id", tenantId)
      .select()
      .single();
    if (error) return { success: false, error: "Không thể cập nhật topping" };
    return { success: true, data };
  }

  const { data, error } = await supabase
    .from("menu_item_modifiers")
    .insert(payload)
    .select()
    .single();
  if (error) return { success: false, error: "Không thể tạo topping" };
  return { success: true, data };
}

export async function deleteModifier(id: number): Promise<ActionResult> {
  const { supabase, tenantId } = await getAuthContext();
  if (!tenantId) return { success: false, error: "Không có quyền truy cập" };

  const { error } = await supabase
    .from("menu_item_modifiers")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId);

  if (error) return { success: false, error: "Không thể xóa topping" };
  return { success: true };
}

// ─── Available Sides ──────────────────────────────────────────────────────────

export async function updateAvailableSides(
  itemId: number,
  sideItemIds: number[],
): Promise<ActionResult> {
  const { supabase, tenantId } = await getAuthContext();
  if (!tenantId) return { success: false, error: "Không có quyền truy cập" };

  // Delete all existing sides then re-insert
  const { error: deleteError } = await supabase
    .from("menu_item_available_sides")
    .delete()
    .eq("menu_item_id", itemId)
    .eq("tenant_id", tenantId);

  if (deleteError)
    return { success: false, error: "Không thể cập nhật món phụ" };

  if (sideItemIds.length === 0) return { success: true };

  const { error: insertError } = await supabase
    .from("menu_item_available_sides")
    .insert(
      sideItemIds.map((sideId) => ({
        tenant_id: tenantId,
        menu_item_id: itemId,
        side_item_id: sideId,
      })),
    );

  if (insertError)
    return { success: false, error: "Không thể cập nhật món phụ" };
  return { success: true };
}
