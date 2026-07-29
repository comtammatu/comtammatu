"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PERMISSION_KEYS, PROCUREMENT_ROLES } from "@comtammatu/shared/auth";
import { withAction } from "@/_lib/with-action";
import { PG_ERR } from "../../../_lib/constants";

const supplierItemInputSchema = z.object({
  ingredientId: z.coerce.number().int().positive(),
});

const createSupplierItemsSchema = z
  .object({
    supplierId: z.coerce.number().int().positive(),
    items: z.array(supplierItemInputSchema).min(1).max(500),
  })
  .superRefine(({ items }, context) => {
    const ingredientIds = new Set<number>();

    items.forEach((item, index) => {
      if (ingredientIds.has(item.ingredientId)) {
        context.addIssue({
          code: "custom",
          path: ["items", index, "ingredientId"],
          message: "Nguyên liệu bị trùng.",
        });
      }
      ingredientIds.add(item.ingredientId);
    });
  });

const deleteSupplierItemSchema = z.object({
  supplierId: z.coerce.number().int().positive(),
  itemId: z.coerce.number().int().positive(),
});

export const createSupplierItems = withAction(
  {
    roles: PROCUREMENT_ROLES,
    schema: createSupplierItemsSchema,
    permission: PERMISSION_KEYS.PROCUREMENT_PRICE_LIST_WRITE,
  },
  async (data, { supabase }) => {
    const { error } = await supabase.rpc("bulk_create_supplier_items", {
      p_supplier_id: data.supplierId,
      p_items: data.items.map((item) => ({
        ingredient_id: item.ingredientId,
      })),
    });

    if (error) {
      if (error.code === PG_ERR.UNIQUE_VIOLATION) {
        return {
          success: false,
          error: "Nguyên liệu đã được gán cho nhà cung cấp.",
        };
      }
      if (error.code === "42501") {
        return { success: false, error: "Không có quyền gán nguyên liệu." };
      }
      return { success: false, error: "Không thể gán các nguyên liệu." };
    }

    revalidatePath(`/inventory/suppliers/${data.supplierId}/items`);
    revalidatePath("/inventory/suppliers");
    revalidatePath("/inventory/purchase-orders");
    return { success: true };
  },
);

const setPreferredSchema = z.object({
  supplierId: z.coerce.number().int().positive(),
  itemId: z.coerce.number().int().positive(),
  isPreferred: z.boolean(),
});

export const setSupplierItemPreferred = withAction(
  {
    roles: PROCUREMENT_ROLES,
    schema: setPreferredSchema,
    permission: PERMISSION_KEYS.PROCUREMENT_PRICE_LIST_WRITE,
  },
  async (data, { supabase, claims }) => {
    const { data: item, error: itemError } = await supabase
      .from("supplier_items")
      .select("id, supplier_id")
      .eq("id", data.itemId)
      .eq("supplier_id", data.supplierId)
      .eq("tenant_id", claims.tenant_id)
      .eq("is_active", true)
      .maybeSingle();
    if (itemError || !item) {
      return { success: false, error: "Không tìm thấy nguyên liệu đã gán." };
    }

    const { error } = await supabase.rpc("set_supplier_item_preferred", {
      p_item_id: data.itemId,
      p_is_preferred: data.isPreferred,
    });
    if (error) {
      if (error.code === "42501") {
        return {
          success: false,
          error: "Không có quyền cập nhật NCC ưu tiên.",
        };
      }
      return { success: false, error: "Không thể cập nhật NCC ưu tiên." };
    }

    revalidatePath(`/inventory/suppliers/${data.supplierId}/items`);
    revalidatePath("/inventory/grn/new");
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
    revalidatePath("/inventory/suppliers");
    revalidatePath("/inventory/purchase-orders");
    return { success: true };
  },
);
