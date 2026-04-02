"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { StaffRole } from "@comtammatu/shared/auth";
import { getAuthContext } from "../_lib/auth";

/* ─── Types ─── */

interface ActionResult {
  success: boolean;
  error?: string;
}

/* ─── Helpers ─── */

const MENU_MANAGER_ROLES: StaffRole[] = [
  "owner",
  "super_manager",
  "area_manager",
  "branch_manager",
];

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

  const { supabase, claims } = ctx;

  // TODO: Use toggle_category_active RPC after migration applied + pnpm db:types
  const { data: cat } = await supabase
    .from("menu_categories")
    .select("is_active")
    .eq("id", parsedId.data)
    .eq("tenant_id", claims.tenant_id)
    .single();

  if (!cat) {
    return { success: false, error: "Danh mục không tồn tại" };
  }

  const { error } = await supabase
    .from("menu_categories")
    .update({ is_active: !cat.is_active })
    .eq("id", parsedId.data)
    .eq("tenant_id", claims.tenant_id);

  if (error) {
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

  const { supabase, claims } = ctx;

  // TODO: Use toggle_item_active RPC after migration applied + pnpm db:types
  const { data: item } = await supabase
    .from("menu_items")
    .select("is_active")
    .eq("id", parsedId.data)
    .eq("tenant_id", claims.tenant_id)
    .single();

  if (!item) {
    return { success: false, error: "Món ăn không tồn tại" };
  }

  const { error } = await supabase
    .from("menu_items")
    .update({ is_active: !item.is_active })
    .eq("id", parsedId.data)
    .eq("tenant_id", claims.tenant_id);

  if (error) {
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

  const { supabase, claims } = ctx;

  // TODO: After db:types → supabase.rpc("save_item_variants", { p_item_id, p_variants })
  // Verify item belongs to tenant
  const { data: item } = await supabase
    .from("menu_items")
    .select("id")
    .eq("id", parsedId.data)
    .eq("tenant_id", claims.tenant_id)
    .single();

  if (!item) {
    return { success: false, error: "Món ăn không tồn tại" };
  }

  // Non-atomic: delete+insert (RPC save_item_variants is atomic alternative)
  const { error: delError } = await supabase
    .from("menu_item_variants")
    .delete()
    .eq("item_id", parsedId.data)
    .eq("tenant_id", claims.tenant_id);

  if (delError) {
    return { success: false, error: mapDbError(delError.code) };
  }

  if (parsed.data.length > 0) {
    const { error: insError } = await supabase
      .from("menu_item_variants")
      .insert(
        parsed.data.map((v, idx) => ({
          tenant_id: claims.tenant_id,
          item_id: parsedId.data,
          name: v.name,
          price_adjustment: v.price_adjustment,
          sort_order: v.sort_order ?? idx,
        })),
      );

    if (insError) {
      return { success: false, error: mapDbError(insError.code) };
    }
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

  const { supabase, claims } = ctx;

  // TODO: After db:types → supabase.rpc("save_item_modifiers", { p_item_id, p_modifiers })
  // Verify item belongs to tenant
  const { data: item } = await supabase
    .from("menu_items")
    .select("id")
    .eq("id", parsedId.data)
    .eq("tenant_id", claims.tenant_id)
    .single();

  if (!item) {
    return { success: false, error: "Món ăn không tồn tại" };
  }

  // Non-atomic: delete+insert (RPC save_item_modifiers is atomic alternative)
  const { error: delError } = await supabase
    .from("menu_item_modifiers")
    .delete()
    .eq("item_id", parsedId.data)
    .eq("tenant_id", claims.tenant_id);

  if (delError) {
    return { success: false, error: mapDbError(delError.code) };
  }

  if (parsed.data.length > 0) {
    const { error: insError } = await supabase
      .from("menu_item_modifiers")
      .insert(
        parsed.data.map((m, idx) => ({
          tenant_id: claims.tenant_id,
          item_id: parsedId.data,
          name: m.name,
          price: m.price,
          sort_order: m.sort_order ?? idx,
        })),
      );

    if (insError) {
      return { success: false, error: mapDbError(insError.code) };
    }
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

  const { supabase, claims } = ctx;

  // TODO: After db:types → supabase.rpc("save_item_sides", { p_main_item_id, p_sides })
  const validatedItemId = parsed.data.mainItemId;
  const validatedSides = parsed.data.sideItemIds;

  // Non-atomic: delete+insert (RPC save_item_sides is atomic alternative)
  // Verify main item belongs to tenant
  const { data: item } = await supabase
    .from("menu_items")
    .select("id")
    .eq("id", validatedItemId)
    .eq("tenant_id", claims.tenant_id)
    .single();

  if (!item) {
    return { success: false, error: "Món ăn không tồn tại" };
  }

  // Delete all existing sides for this item, then insert fresh
  const { error: delError } = await supabase
    .from("menu_item_available_sides")
    .delete()
    .eq("main_item_id", validatedItemId)
    .eq("tenant_id", claims.tenant_id);

  if (delError) {
    return { success: false, error: mapDbError(delError.code) };
  }

  if (validatedSides.length > 0) {
    const { error: insError } = await supabase
      .from("menu_item_available_sides")
      .insert(
        validatedSides.map((s) => ({
          tenant_id: claims.tenant_id,
          main_item_id: validatedItemId,
          side_item_id: s.id,
          is_default: s.is_default,
        })),
      );

    if (insError) {
      return { success: false, error: mapDbError(insError.code) };
    }
  }

  revalidatePath("/admin/menu");
  return { success: true };
}
