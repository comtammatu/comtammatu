"use server";

import { z } from "zod";
import {
  PERMISSION_KEYS,
  PO_CREATE_ROLES,
  PO_MUTATE_ROLES,
  PO_REVIEW_ROLES,
  PROCUREMENT_ROLES,
  isProcurementBranchInScope,
} from "@comtammatu/shared/auth";
import { revalidateSurfacePath } from "@/_lib/revalidate-surface";
import { withAction } from "@/_lib/with-action";
import { inventoryPositiveQuantitySchema } from "./_lib/inventory-quantity-schema";
import { mapInventoryRpcFailure } from "./_lib/rpc-failure";
import {
  INVENTORY_ERROR_CODES,
  procurementRpcMappings,
} from "@lib/messages/inventory-rpc-errors";
import { messages } from "@lib/messages";
import type { ActionResult } from "@comtammatu/shared/types";

const poIdSchema = z.object({
  poId: z.coerce.number().int().positive(),
});

const createGrnDraftSchema = poIdSchema.extend({
  idempotencyKey: z.string().uuid(),
});

const purchaseRequestLineSchema = z.object({
  ingredientId: z.coerce.number().int().positive(),
  quantity: inventoryPositiveQuantitySchema,
  entryUnitId: z.coerce.number().int().positive(),
});

const savePurchaseDemandSchema = z.object({
  demandId: z.coerce.number().int().positive().nullable().optional(),
  branchId: z.coerce.number().int().positive(),
  neededBy: z.iso.date().nullable().optional(),
  notes: z.string().trim().max(500).optional(),
  lines: z.array(purchaseRequestLineSchema).min(1).max(200),
  submit: z.boolean().default(true),
  idempotencyKey: z.string().uuid().optional(),
});

const purchaseRequestIdSchema = z.object({
  requestId: z.coerce.number().int().positive(),
});

const documentReasonSchema = z.object({
  reason: z.string().trim().min(5).max(500),
});

const purchaseRequestReasonSchema =
  purchaseRequestIdSchema.extend(documentReasonSchema.shape);

const purchaseDemandAllocationSchema = z.object({
  requestItemId: z.coerce.number().int().positive(),
  supplierId: z.coerce.number().int().positive(),
  quantity: inventoryPositiveQuantitySchema,
});

const savePurchaseDemandAllocationsSchema = z.object({
  demandId: z.coerce.number().int().positive(),
  allocations: z.array(purchaseDemandAllocationSchema).max(500),
  idempotencyKey: z.string().uuid(),
});

const reviewPurchaseDemandSchema = z
  .object({
    demandId: z.coerce.number().int().positive(),
    action: z.enum(["approve", "request_changes", "reject"]),
    allocations: z.array(purchaseDemandAllocationSchema).max(500).optional(),
    reason: z.string().trim().max(500).optional(),
    idempotencyKey: z.string().uuid().optional(),
  })
  .superRefine(({ action, reason, idempotencyKey }, context) => {
    if (action === "approve" && idempotencyKey == null) {
      context.addIssue({
        code: "custom",
        path: ["idempotencyKey"],
        message: "Thiếu mã chống gửi trùng.",
      });
    }
    if (
      action !== "approve" &&
      (reason == null || reason.trim().length < 5)
    ) {
      context.addIssue({
        code: "custom",
        path: ["reason"],
        message: "Vui lòng nhập lý do tối thiểu 5 ký tự.",
      });
    }
  });

const poReasonSchema = poIdSchema.extend(documentReasonSchema.shape);

const createPurchaseOrderLineSchema = z.object({
  ingredientId: z.coerce.number().int().positive(),
  quantity: inventoryPositiveQuantitySchema,
  entryUnitId: z.coerce.number().int().positive(),
  supplierId: z.coerce.number().int().positive(),
});

const createPurchaseOrderSchema = z.object({
  poId: z.coerce.number().int().positive().nullable().optional(),
  supplierId: z.coerce.number().int().positive().nullable().optional(),
  branchId: z.coerce.number().int().positive(),
  neededBy: z.iso.date().nullable().optional(),
  notes: z.string().trim().max(500).optional(),
  lines: z.array(createPurchaseOrderLineSchema).min(1).max(200),
  submit: z.boolean().default(false),
  idempotencyKey: z.string().uuid().optional(),
});

function mapProcurementRpcError<T = never>(
  error: { code?: string; message: string },
  fallback: string,
): ActionResult<T> {
  return mapInventoryRpcFailure(error, procurementRpcMappings, {
    userMessage: fallback,
    errorCode: INVENTORY_ERROR_CODES.PROCUREMENT_FAILED,
  });
}

// Frozen legacy RPC delegates: save_purchase_demand, review_purchase_demand
function ycmWriteFrozen<T = never>(): ActionResult<T> {
  return {
    success: false,
    error: messages.inventory.purchaseRequests.writeFrozen,
  };
}

export const createPurchaseOrder = withAction(
  {
    roles: PO_CREATE_ROLES,
    schema: createPurchaseOrderSchema,
    permission: PERMISSION_KEYS.PROCUREMENT_PO_CREATE,
    permissionBranchId: (data) => data.branchId,
  },
  async (
    {
      poId,
      supplierId,
      branchId,
      neededBy,
      notes,
      lines,
      submit,
      idempotencyKey,
    },
    { supabase, claims },
  ) => {
    if (
      !isProcurementBranchInScope(
        claims.user_role,
        claims.branch_id,
        branchId,
      )
    ) {
      return {
        success: false,
        error: "Kho nhận nằm ngoài phạm vi địa điểm của bạn.",
      };
    }
    if (poId == null && idempotencyKey == null) {
      return {
        success: false,
        error: "Thiếu mã chống gửi trùng.",
      };
    }

    const { data, error } = await supabase.rpc(
      "create_purchase_order" as never,
      {
        p_po_id: poId ?? null,
        p_supplier_id: supplierId ?? null,
        p_branch_id: branchId,
        p_notes: notes ?? "",
        p_needed_by: neededBy ?? null,
        p_lines: lines.map((line) => ({
          ingredient_id: line.ingredientId,
          quantity: line.quantity,
          entry_unit_id: line.entryUnitId,
          supplier_id: line.supplierId,
        })),
        p_submit: submit,
        p_idempotency_key: idempotencyKey ?? null,
      } as never,
    );
    if (error) {
      return mapProcurementRpcError(error, "Không thể lưu đơn mua.");
    }
    const parsed = z
      .object({
        po_id: z.coerce.number().int().positive(),
        po_number: z.string(),
        status: z.enum(["draft", "approved"]),
        grn_id: z.coerce.number().int().positive().nullable().optional(),
      })
      .safeParse(data);
    if (!parsed.success) {
      return {
        success: false,
        error: "Phản hồi lưu đơn mua không hợp lệ.",
      };
    }
    revalidateSurfacePath("/inventory/purchase-orders");
    revalidateSurfacePath("/inventory/grn");
    return {
      success: true,
      data: {
        id: parsed.data.po_id,
        code: parsed.data.po_number,
        status: parsed.data.status,
        grnId: parsed.data.grn_id ?? null,
      },
    };
  },
);

export const savePurchaseDemand = withAction(
  {
    roles: PROCUREMENT_ROLES,
    schema: savePurchaseDemandSchema,
    permission: PERMISSION_KEYS.PROCUREMENT_REQUEST_MANAGE,
  },
  async () => ycmWriteFrozen<{
    id: number;
    code: string;
    status: "draft" | "pending_allocation";
  }>(),
);

export const savePurchaseDemandAllocations = withAction(
  {
    roles: PO_REVIEW_ROLES,
    schema: savePurchaseDemandAllocationsSchema,
    permission: PERMISSION_KEYS.PROCUREMENT_PO_APPROVE,
  },
  async () => ycmWriteFrozen(),
);

export const reviewPurchaseDemand = withAction(
  {
    roles: PO_REVIEW_ROLES,
    schema: reviewPurchaseDemandSchema,
    permission: PERMISSION_KEYS.PROCUREMENT_PO_APPROVE,
  },
  async () =>
    ycmWriteFrozen<{
      status: string;
      purchaseOrders: Array<{
        id: number;
        code: string;
        supplierId: number;
        status: string;
      }>;
    }>(),
);

export const cancelPurchaseRequest = withAction(
  {
    roles: PROCUREMENT_ROLES,
    schema: purchaseRequestReasonSchema,
    permission: PERMISSION_KEYS.PROCUREMENT_REQUEST_MANAGE,
  },
  async () => ycmWriteFrozen(),
);

export const closePurchaseRequest = withAction(
  {
    roles: PO_REVIEW_ROLES,
    schema: purchaseRequestReasonSchema,
    permission: PERMISSION_KEYS.PROCUREMENT_PO_APPROVE,
  },
  async () => ycmWriteFrozen(),
);

export const createGrnDraftFromPurchaseOrder = withAction(
  {
    roles: PROCUREMENT_ROLES,
    schema: createGrnDraftSchema,
    permission: PERMISSION_KEYS.PROCUREMENT_GRN_CREATE,
  },
  async ({ poId, idempotencyKey }, { supabase, claims }) => {
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
        error: "Đơn đặt hàng nằm ngoài phạm vi địa điểm của bạn.",
      };
    }

    const { data, error } = await supabase.rpc(
      "create_grn_draft_from_po" as never,
      {
        p_po_id: poId,
        p_idempotency_key: idempotencyKey,
      } as never,
    );
    if (error) {
      const known: Array<[string, string]> = [
        ["purchase_order_has_active_grn", "Đơn đặt hàng đã có phiếu chờ nhập."],
        ["purchase_order_fully_received", "Đơn đặt hàng đã nhận đủ."],
        [
          "purchase_order_not_receivable",
          "Đơn đặt hàng chưa sẵn sàng nhận hàng.",
        ],
        ["receiving_warehouse_required", "Chưa cấu hình kho nhận hàng."],
        ["42501", "Bạn không có quyền tạo phiếu nhập."],
      ];
      return {
        success: false,
        error:
          known.find(
            ([token]) => error.code === token || error.message.includes(token),
          )?.[1] ?? "Không thể tạo phiếu nhập từ đơn đặt hàng.",
      };
    }

    const parsed = z
      .object({
        grn_id: z.coerce.number().int().positive(),
        grn_number: z.string(),
        status: z.literal("draft"),
      })
      .safeParse(data);
    if (!parsed.success) {
      return { success: false, error: "Phản hồi tạo phiếu nhập không hợp lệ." };
    }

    revalidateSurfacePath("/inventory/grn");
    revalidateSurfacePath("/inventory/purchase-orders");
    return {
      success: true,
      data: {
        id: parsed.data.grn_id,
        code: parsed.data.grn_number,
      },
    };
  },
);

export const cancelPurchaseOrder = withAction(
  {
    roles: PO_MUTATE_ROLES,
    schema: poReasonSchema,
    permission: PERMISSION_KEYS.PROCUREMENT_PO_CREATE,
  },
  async ({ poId, reason }, { supabase }) => {
    const { data, error } = await supabase.rpc(
      "cancel_purchase_order" as never,
      {
        p_po_id: poId,
        p_reason: reason,
      } as never,
    );
    if (error) {
      return mapProcurementRpcError(error, "Không thể hủy đơn đặt hàng.");
    }
    const parsed = z
      .object({
        cancelled_draft_grns: z.coerce.number().int().nonnegative(),
      })
      .safeParse(data);
    revalidateSurfacePath("/inventory/purchase-orders");
    revalidateSurfacePath("/inventory/purchase-requests");
    revalidateSurfacePath("/inventory/grn");
    return {
      success: true,
      data: { cancelledDraftGrns: parsed.success ? parsed.data.cancelled_draft_grns : 0 },
    };
  },
);

export const closePurchaseOrder = withAction(
  {
    roles: PROCUREMENT_ROLES,
    schema: poReasonSchema,
    anyPermission: [
      PERMISSION_KEYS.PROCUREMENT_PO_APPROVE,
      PERMISSION_KEYS.PROCUREMENT_GRN_CONFIRM,
    ],
  },
  async ({ poId, reason }, { supabase }) => {
    const { error } = await supabase.rpc("close_purchase_order" as never, {
      p_po_id: poId,
      p_reason: reason,
    } as never);
    if (error) {
      return mapProcurementRpcError(error, "Không thể đóng đơn đặt hàng.");
    }
    revalidateSurfacePath("/inventory/purchase-orders");
    revalidateSurfacePath("/inventory/grn");
    return { success: true };
  },
);
