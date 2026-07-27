"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PERMISSION_KEYS, PROCUREMENT_ROLES } from "@comtammatu/shared/auth";
import { withAction } from "@/_lib/with-action";
import { PG_ERR } from "../../../_lib/constants";

const createSupplierItemSchema = z.object({
  supplierId: z.coerce.number().int().positive(),
  ingredientId: z.coerce.number().int().positive(),
  supplierSkuCode: z.string().trim().min(1).max(100),
});

const deleteSupplierItemSchema = z.object({
  supplierId: z.coerce.number().int().positive(),
  itemId: z.coerce.number().int().positive(),
});

export const createSupplierItem = withAction(
  {
    roles: PROCUREMENT_ROLES,
    schema: createSupplierItemSchema,
    permission: PERMISSION_KEYS.PROCUREMENT_PRICE_LIST_WRITE,
  },
  async (data, { supabase, claims, user }) => {
    const [{ data: supplier }, { data: ingredient }, { data: existing }] =
      await Promise.all([
        supabase
          .from("suppliers")
          .select("id")
          .eq("id", data.supplierId)
          .eq("tenant_id", claims.tenant_id)
          .eq("is_active", true)
          .maybeSingle(),
        supabase
          .from("ingredients")
          .select("id")
          .eq("id", data.ingredientId)
          .eq("tenant_id", claims.tenant_id)
          .eq("is_active", true)
          .maybeSingle(),
        supabase
          .from("supplier_items")
          .select("id")
          .eq("tenant_id", claims.tenant_id)
          .eq("supplier_id", data.supplierId)
          .eq("ingredient_id", data.ingredientId)
          .eq("is_active", true)
          .limit(1)
          .maybeSingle(),
      ]);

    if (!supplier || !ingredient) {
      return {
        success: false,
        error: "Nhà cung cấp hoặc nguyên liệu không hợp lệ.",
      };
    }
    if (existing) {
      return {
        success: false,
        error: "Nguyên liệu đã được gán cho nhà cung cấp.",
      };
    }

    const { error } = await supabase.from("supplier_items").insert({
      tenant_id: claims.tenant_id,
      supplier_id: data.supplierId,
      ingredient_id: data.ingredientId,
      supplier_sku_code: data.supplierSkuCode,
      created_by: user.id,
    });

    if (error) {
      if (error.code === PG_ERR.UNIQUE_VIOLATION) {
        return { success: false, error: "Mã hàng NCC đã được sử dụng." };
      }
      return { success: false, error: "Không thể gán nguyên liệu." };
    }

    revalidatePath(`/inventory/suppliers/${data.supplierId}/items`);
    revalidatePath("/inventory/purchase-orders");
    return { success: true };
  },
);

export const deleteSupplierItem = withAction(
  {
    roles: PROCUREMENT_ROLES,
    schema: deleteSupplierItemSchema,
    permission: PERMISSION_KEYS.PROCUREMENT_PRICE_LIST_WRITE,
  },
  async (data, { supabase, claims }) => {
    const { data: deleted, error } = await supabase
      .from("supplier_items")
      .delete()
      .eq("id", data.itemId)
      .eq("supplier_id", data.supplierId)
      .eq("tenant_id", claims.tenant_id)
      .select("id")
      .maybeSingle();

    if (error || !deleted) {
      return { success: false, error: "Không thể bỏ gán nguyên liệu." };
    }

    revalidatePath(`/inventory/suppliers/${data.supplierId}/items`);
    revalidatePath("/inventory/purchase-orders");
    return { success: true };
  },
);
