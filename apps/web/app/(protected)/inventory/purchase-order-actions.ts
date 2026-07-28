"use server";

import { z } from "zod";
import {
  PERMISSION_KEYS,
  PO_MUTATE_ROLES,
  PROCUREMENT_ROLES,
  isProcurementBranchInScope,
} from "@comtammatu/shared/auth";
import { revalidateSurfacePath } from "@/_lib/revalidate-surface";
import { withAction, type ActionContext } from "@/_lib/with-action";

const poIdSchema = z.object({
  poId: z.coerce.number().int().positive(),
});

const poSchema = z
  .object({
    supplierId: z.coerce.number().int().positive(),
    branchId: z.coerce.number().int().positive(),
    notes: z.string().trim().max(500).optional(),
    lines: z
      .array(
        z.object({
          ingredientId: z.coerce.number().int().positive(),
          quantity: z.coerce.number().positive(),
          entryUnitId: z.coerce.number().int().positive(),
          unitPriceEst: z.number().min(0).nullable(),
        }),
      )
      .min(1, { error: "Thêm ít nhất một nguyên liệu." }),
  })
  .superRefine((data, ctx) => {
    const ingredientIds = data.lines.map((line) => line.ingredientId);
    if (new Set(ingredientIds).size !== ingredientIds.length) {
      ctx.addIssue({
        code: "custom",
        path: ["lines"],
        message: "Mỗi nguyên liệu chỉ được xuất hiện một lần.",
      });
    }
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

export const createPurchaseOrderWithLines = withAction(
  {
    roles: PO_MUTATE_ROLES,
    schema: poSchema,
    permission: PERMISSION_KEYS.PROCUREMENT_PO_CREATE,
  },
  async (data, { supabase, claims }) => {
    if (
      !isProcurementBranchInScope(
        claims.user_role,
        claims.branch_id,
        data.branchId,
      )
    ) {
      return {
        success: false,
        error: "Bạn chỉ được tạo đơn đặt hàng cho chi nhánh mình.",
      };
    }

    const supplierItemError = await validateSupplierIngredients(
      supabase,
      claims.tenant_id,
      data.supplierId,
      data.lines.map((line) => line.ingredientId),
    );
    if (supplierItemError) {
      return { success: false, error: supplierItemError };
    }

    const { data: result, error } = await supabase.rpc(
      "create_purchase_order_with_lines",
      {
        p_supplier_id: data.supplierId,
        p_branch_id: data.branchId,
        p_notes: data.notes ?? "",
        p_lines: data.lines.map((line) => ({
          ingredient_id: line.ingredientId,
          quantity: line.quantity,
          entry_unit_id: line.entryUnitId,
          unit_price_est: line.unitPriceEst,
        })),
      },
    );

    if (error) {
      if (error.message.includes("supplier_item_mapping_required")) {
        return {
          success: false,
          error: "Có nguyên liệu chưa được gán cho nhà cung cấp.",
        };
      }
      const errors: Record<string, string> = {
        "22023": "Dữ liệu dòng đơn đặt hàng không hợp lệ.",
        "28000": "Phiên đăng nhập đã hết hạn.",
        "42501": "Bạn không có quyền tạo đơn đặt hàng.",
        P0002: "Chi nhánh hoặc nhà cung cấp không hợp lệ.",
      };
      return {
        success: false,
        error: errors[error.code ?? ""] ?? "Không thể tạo đơn mua.",
      };
    }

    const parsed = z
      .object({ id: z.coerce.number().int().positive() })
      .safeParse(result);
    if (!parsed.success) {
      return { success: false, error: "Phản hồi tạo đơn đặt hàng không hợp lệ." };
    }

    revalidateSurfacePath("/inventory/purchase-orders");
    return { success: true, data: parsed.data };
  },
);

const grnIdSchema = z.object({
  grnId: z.coerce.number().int().positive(),
});

/** D088: create draft PO from GRN draft and link it. */
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
      // D088 RPC may lag generated types until Greenfield apply + db:types.
      "create_purchase_order_from_grn" as never,
      { p_grn_id: grnId } as never,
    );

    if (error) {
      const errors: Record<string, string> = {
        grn_not_draft: "Chỉ tạo đơn mua từ phiếu nhập nháp.",
        grn_already_linked_to_po: "Phiếu nhập đã gắn đơn mua.",
        grn_has_no_receivable_lines: "Phiếu nhập chưa có dòng nhận hợp lệ.",
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
      data: { id: parsed.data.po_id, displayId: parsed.data.display_id },
    };
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
      return { success: false, error: "Đơn đặt hàng nằm ngoài phạm vi chi nhánh." };
    }
    if (po.status !== "draft") {
      return { success: false, error: "Chỉ duyệt đơn đặt hàng đang ở trạng thái nháp." };
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

export const createGrnFromPurchaseOrder = withAction(
  {
    roles: PROCUREMENT_ROLES,
    schema: poIdSchema,
    permission: PERMISSION_KEYS.PROCUREMENT_GRN_CREATE,
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
      return { success: false, error: "Đơn đặt hàng nằm ngoài phạm vi chi nhánh." };
    }
    if (!["sent", "partially_received"].includes(po.status)) {
      return { success: false, error: "Đơn đặt hàng chưa được duyệt hoặc đã nhận đủ." };
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

    const { data: result, error } = await supabase.rpc(
      "create_grn_from_approved_po",
      {
        p_po_id: poId,
      },
    );
    if (error) {
      if (error.message.includes("supplier_item_mapping_required")) {
        return {
          success: false,
          error: "Có nguyên liệu chưa được gán cho nhà cung cấp.",
        };
      }
      return { success: false, error: "Không thể tạo phiếu nhập từ đơn đặt hàng." };
    }

    const parsed = z
      .object({ grn_id: z.coerce.number().int().positive() })
      .safeParse(result);
    if (!parsed.success) {
      return { success: false, error: "Phản hồi tạo phiếu nhập không hợp lệ." };
    }

    revalidateSurfacePath("/inventory/purchase-orders");
    revalidateSurfacePath("/inventory/grn");
    return { success: true, data: { id: parsed.data.grn_id } };
  },
);
