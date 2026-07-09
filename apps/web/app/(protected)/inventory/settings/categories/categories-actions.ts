"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@comtammatu/shared/types";
import { VALIDATION_VI } from "@comtammatu/shared/messages";
import { INVENTORY_CATALOG_ROLES } from "@comtammatu/shared/auth";
import { withAction } from "@/_lib/with-action";
import { messages } from "@lib/messages";
import { getAuthContextWithAnyPermission } from "../../_lib/auth";
import { CATALOG_MANAGE_PERMISSIONS } from "../../_lib/catalog-permissions";
import { PG_ERR } from "../../_lib/constants";

const CATEGORIES_PATH = "/inventory/settings/categories";

export interface CategoryRow {
  id: number;
  name: string;
  tone_class: string | null;
  sort_order: number;
  is_active: boolean;
}

const categoryCreateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { error: VALIDATION_VI.required("Tên nhóm") }),
  sort_order: z.coerce.number().int().min(0).default(0),
  is_active: z.boolean().default(true),
});

const categoryUpdateSchema = z.object({
  id: z.coerce.number().int().positive({ error: "ID không hợp lệ" }),
  name: z
    .string()
    .trim()
    .min(1, { error: VALIDATION_VI.required("Tên nhóm") }),
  sort_order: z.coerce.number().int().min(0).default(0),
  is_active: z.boolean().default(true),
});

const categoryDeleteSchema = z.object({
  id: z.coerce.number().int().positive({ error: "ID không hợp lệ" }),
});

export async function fetchCategories(): Promise<ActionResult<CategoryRow[]>> {
  const ctx = await getAuthContextWithAnyPermission(
    INVENTORY_CATALOG_ROLES,
    CATALOG_MANAGE_PERMISSIONS,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  const { data, error } = await supabase
    .from("ingredient_categories")
    .select("id, name, tone_class, sort_order, is_active")
    .eq("tenant_id", claims.tenant_id)
    .order("sort_order")
    .order("name");

  if (error) {
    return {
      success: false,
      error: messages.inventory.settings.categories.loadFailed,
    };
  }

  return { success: true, data: data ?? [] };
}

export const createCategory = withAction(
  {
    roles: INVENTORY_CATALOG_ROLES,
    schema: categoryCreateSchema,
    anyPermission: CATALOG_MANAGE_PERMISSIONS,
  },
  async (data, { supabase, claims }) => {
    const { error } = await supabase.from("ingredient_categories").insert({
      tenant_id: claims.tenant_id,
      name: data.name,
      tone_class: null,
      sort_order: data.sort_order,
      is_active: data.is_active,
    });

    if (error) {
      if (error.code === PG_ERR.UNIQUE_VIOLATION) {
        return { success: false, error: "Tên nhóm này đã tồn tại." };
      }
      return { success: false, error: "Không thể tạo nhóm." };
    }

    revalidatePath(CATEGORIES_PATH);
    return { success: true };
  },
);

export const updateCategory = withAction(
  {
    roles: INVENTORY_CATALOG_ROLES,
    schema: categoryUpdateSchema,
    anyPermission: CATALOG_MANAGE_PERMISSIONS,
  },
  async (data, { supabase, claims }) => {
    const { error } = await supabase
      .from("ingredient_categories")
      .update({
        name: data.name,
        tone_class: null,
        sort_order: data.sort_order,
        is_active: data.is_active,
      })
      .eq("id", data.id)
      .eq("tenant_id", claims.tenant_id);

    if (error) {
      if (error.code === PG_ERR.UNIQUE_VIOLATION) {
        return { success: false, error: "Tên nhóm này đã tồn tại." };
      }
      return { success: false, error: "Không thể cập nhật nhóm." };
    }

    revalidatePath(CATEGORIES_PATH);
    return { success: true };
  },
);

export const deleteCategory = withAction(
  {
    roles: INVENTORY_CATALOG_ROLES,
    schema: categoryDeleteSchema,
    anyPermission: CATALOG_MANAGE_PERMISSIONS,
  },
  async (data, { supabase, claims }) => {
    // ingredients.category_id is ON DELETE SET NULL, so a delete never blocks
    // on referencing ingredients.
    const { error } = await supabase
      .from("ingredient_categories")
      .delete()
      .eq("id", data.id)
      .eq("tenant_id", claims.tenant_id);

    if (error) {
      return { success: false, error: "Không thể xoá nhóm." };
    }

    revalidatePath(CATEGORIES_PATH);
    return { success: true };
  },
);
