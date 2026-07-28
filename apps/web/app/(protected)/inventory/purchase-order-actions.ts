"use server";

import { z } from "zod";
import {
  PERMISSION_KEYS,
  PO_MUTATE_ROLES,
  isProcurementBranchInScope,
} from "@comtammatu/shared/auth";
import { revalidateSurfacePath } from "@/_lib/revalidate-surface";
import { withAction, type ActionContext } from "@/_lib/with-action";
import { loadInventoryMonetaryAccess } from "@lib/inventory/monetary-access";

const poIdSchema = z.object({
  poId: z.coerce.number().int().positive(),
});

const poPricesSchema = poIdSchema.extend({
  lines: z
    .array(
      z.object({
        lineId: z.coerce.number().int().positive(),
        unitPrice: z.coerce.number().positive(),
      }),
    )
    .min(1),
});

async function validateSupplierIngredients(
  supabase: ActionContext["supabase"],
  tenantId: number,
  supplierId: number,
  ingredientIds: number[],
): Promise<string | null> {
  const expected = new Set(ingredientIds);
  if (expected.size === 0) return "Đơn mua chưa có nguyên liệu.";
  const { data, error } = await supabase
    .from("supplier_items")
    .select("ingredient_id")
    .eq("tenant_id", tenantId)
    .eq("supplier_id", supplierId)
    .eq("is_active", true)
    .in("ingredient_id", [...expected]);

  if (error) return "Không thể kiểm tra nguyên liệu theo nhà cung cấp.";
  const allowed = new Set((data ?? []).map((item) => item.ingredient_id));
  return [...expected].every((id) => allowed.has(id))
    ? null
    : "Có nguyên liệu chưa được gán cho nhà cung cấp.";
}

const grnIdSchema = z.object({
  grnId: z.coerce.number().int().positive(),
});

/** Create and link the draft PO required by the retrospective GRN flow. */
export const createPurchaseOrderFromGrn = withAction(
  {
    roles: PO_MUTATE_ROLES,
    schema: grnIdSchema,
    permission: PERMISSION_KEYS.PROCUREMENT_PO_CREATE,
  },
  async ({ grnId }, { supabase, claims }) => {
    const { data: grn, error: loadError } = await supabase
      .from("goods_received_notes")
      .select("id, branch_id, status, po_id")
      .eq("tenant_id", claims.tenant_id)
      .eq("id", grnId)
      .maybeSingle();

    if (loadError || !grn) {
      return { success: false, error: "Không tìm thấy phiếu nhập." };
    }
    if (
      !isProcurementBranchInScope(
        claims.user_role,
        claims.branch_id,
        grn.branch_id,
      )
    ) {
      return {
        success: false,
        error: "Phiếu nhập nằm ngoài phạm vi địa điểm của bạn.",
      };
    }
    if (grn.status !== "draft") {
      return { success: false, error: "Chỉ tạo đơn mua từ phiếu nhập nháp." };
    }
    if (grn.po_id != null) {
      return { success: false, error: "Phiếu nhập đã gắn đơn mua." };
    }

    const { data: result, error } = await supabase.rpc(
      "create_purchase_orders_from_grn",
      { p_grn_id: grnId },
    );

    if (error) {
      const errors: Record<string, string> = {
        grn_not_draft: "Chỉ tạo đơn mua từ phiếu nhập nháp.",
        grn_already_linked_to_po: "Phiếu nhập đã gắn đơn mua.",
        grn_has_no_receivable_lines: "Phiếu nhập chưa có dòng nhận hợp lệ.",
        grn_line_supplier_required:
          "Mỗi dòng phiếu nhập phải có nhà cung cấp trước khi tạo đơn mua.",
        "28000": "Phiên đăng nhập đã hết hạn.",
        "42501": "Bạn không có quyền tạo đơn đặt hàng.",
        P0002: "Không tìm thấy phiếu nhập hoặc địa điểm không hợp lệ.",
      };
      for (const [token, message] of Object.entries(errors)) {
        if (error.message.includes(token) || error.code === token) {
          return { success: false, error: message };
        }
      }
      return { success: false, error: "Không thể tạo đơn mua từ phiếu nhập." };
    }

    const parsed = z
      .object({
        po_id: z.coerce.number().int().positive(),
        po_ids: z.array(z.coerce.number().int().positive()).optional(),
        po_count: z.coerce.number().int().positive().optional(),
        display_id: z.string().optional(),
      })
      .safeParse(result);
    if (!parsed.success) {
      return { success: false, error: "Phản hồi tạo đơn mua không hợp lệ." };
    }

    revalidateSurfacePath("/inventory/purchase-orders");
    revalidateSurfacePath("/inventory/grn");
    revalidateSurfacePath(`/inventory/grn/${grnId}`);
    return {
      success: true,
      data: {
        id: parsed.data.po_id,
        poIds: parsed.data.po_ids ?? [parsed.data.po_id],
        poCount: parsed.data.po_count ?? parsed.data.po_ids?.length ?? 1,
        displayId: parsed.data.display_id,
      },
    };
  },
);

export const updatePurchaseOrderPrices = withAction(
  {
    roles: PO_MUTATE_ROLES,
    schema: poPricesSchema,
    permission: PERMISSION_KEYS.PROCUREMENT_PO_CREATE,
  },
  async ({ poId, lines }, { supabase, claims }) => {
    const monetary = await loadInventoryMonetaryAccess(claims.user_role);
    if (!monetary.purchasePrice) {
      return { success: false, error: "Không có quyền nhập giá mua." };
    }
    const { data: po, error: loadError } = await supabase
      .from("purchase_orders")
      .select("branch_id, status")
      .eq("tenant_id", claims.tenant_id)
      .eq("id", poId)
      .maybeSingle();

    if (loadError || !po) {
      return { success: false, error: "Không tìm thấy đơn đặt hàng." };
    }
    if (
      !isProcurementBranchInScope(
        claims.user_role,
        claims.branch_id,
        po.branch_id,
      )
    ) {
      return {
        success: false,
        error: "Đơn đặt hàng nằm ngoài phạm vi chi nhánh.",
      };
    }
    if (po.status !== "draft") {
      return {
        success: false,
        error: "Chỉ cập nhật giá cho đơn mua đang nháp.",
      };
    }

    const { error } = await supabase.rpc(
      "update_purchase_order_prices_protected" as never,
      {
        p_po_id: poId,
        p_lines: lines.map((line) => ({
          line_id: line.lineId,
          unit_price: line.unitPrice,
        })),
      } as never,
    );
    if (error) {
      return { success: false, error: "Không thể lưu giá mua." };
    }

    revalidateSurfacePath("/inventory/purchase-orders");
    revalidateSurfacePath("/inventory/grn");
    return { success: true };
  },
);

export const approvePurchaseOrder = withAction(
  {
    roles: PO_MUTATE_ROLES,
    schema: poIdSchema,
    permission: PERMISSION_KEYS.PROCUREMENT_PO_APPROVE,
  },
  async ({ poId }, { supabase, claims }) => {
    const { data: po, error: loadError } = await supabase
      .from("purchase_orders")
      .select(
        "branch_id, status, supplier_id, purchase_order_items(ingredient_id)",
      )
      .eq("tenant_id", claims.tenant_id)
      .eq("id", poId)
      .maybeSingle();

    if (loadError || !po) {
      return { success: false, error: "Không tìm thấy đơn đặt hàng." };
    }
    if (
      !isProcurementBranchInScope(
        claims.user_role,
        claims.branch_id,
        po.branch_id,
      )
    ) {
      return {
        success: false,
        error: "Đơn đặt hàng nằm ngoài phạm vi chi nhánh.",
      };
    }
    if (po.status !== "draft") {
      return {
        success: false,
        error: "Chỉ duyệt đơn đặt hàng đang ở trạng thái nháp.",
      };
    }
    const supplierItemError = await validateSupplierIngredients(
      supabase,
      claims.tenant_id,
      po.supplier_id,
      po.purchase_order_items.map((item) => item.ingredient_id),
    );
    if (supplierItemError) {
      return { success: false, error: supplierItemError };
    }

    const { error } = await supabase.rpc("approve_purchase_order", {
      p_po_id: poId,
    });
    if (error) {
      if (error.message.includes("supplier_item_mapping_required")) {
        return {
          success: false,
          error: "Có nguyên liệu chưa được gán cho nhà cung cấp.",
        };
      }
      return { success: false, error: "Không thể duyệt đơn đặt hàng." };
    }

    revalidateSurfacePath("/inventory/purchase-orders");
    return { success: true };
  },
);
