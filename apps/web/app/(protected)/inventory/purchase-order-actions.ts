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
import { withAction, type ActionContext } from "@/_lib/with-action";
import { inventoryPositiveQuantitySchema } from "./_lib/inventory-quantity-schema";
import { mapInventoryRpcFailure } from "./_lib/rpc-failure";
import {
  INVENTORY_ERROR_CODES,
  procurementRpcMappings,
} from "@lib/messages/inventory-rpc-errors";
import type { ActionResult } from "@comtammatu/shared/types";

const poIdSchema = z.object({
  poId: z.coerce.number().int().positive(),
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

const createGrnDraftSchema = poIdSchema.extend({
  idempotencyKey: z.string().uuid(),
});

const purchaseRequestLineSchema = z.object({
  ingredientId: z.coerce.number().int().positive(),
  quantity: inventoryPositiveQuantitySchema,
  entryUnitId: z.coerce.number().int().positive(),
});

const savePurchaseRequestSchema = z.object({
  requestId: z.coerce.number().int().positive().nullable().optional(),
  branchId: z.coerce.number().int().positive(),
  neededBy: z.iso.date().nullable().optional(),
  notes: z.string().trim().max(500).optional(),
  lines: z.array(purchaseRequestLineSchema).min(1).max(200),
  submit: z.boolean().default(true),
  idempotencyKey: z.string().uuid().optional(),
});

const savePurchaseDemandSchema = savePurchaseRequestSchema
  .omit({ requestId: true })
  .extend({
    demandId: z.coerce.number().int().positive().nullable().optional(),
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

const savePurchaseOrderGroupSchema = z.object({
  groupKey: z.string().uuid().nullable().optional(),
  branchId: z.coerce.number().int().positive(),
  expectedDeliveryDate: z.iso.date().nullable().optional(),
  notes: z.string().trim().max(500).optional(),
  lines: z
    .array(
      z.object({
        ingredientId: z.coerce.number().int().positive(),
        quantity: inventoryPositiveQuantitySchema,
        entryUnitId: z.coerce.number().int().positive(),
      }),
    )
    .min(1)
    .max(200),
  submit: z.boolean().default(true),
  idempotencyKey: z.string().uuid(),
});

const reviewPurchaseOrderSchema = poIdSchema
  .extend({
    action: z.enum(["approve", "request_changes", "reject"]),
    reason: z.string().trim().max(500).optional(),
  })
  .superRefine(({ action, reason }, context) => {
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

type PurchaseOrderGroupActionData = {
  groupKey: string;
  groupCode: string;
  purchaseOrders: Array<{
    id: number;
    code: string;
    supplierId: number;
    status: string;
  }>;
};

function mapProcurementRpcError<T = never>(
  error: { code?: string; message: string },
  fallback: string,
): ActionResult<T> {
  return mapInventoryRpcFailure(error, procurementRpcMappings, {
    userMessage: fallback,
    errorCode: INVENTORY_ERROR_CODES.PROCUREMENT_FAILED,
  });
}

export const savePurchaseOrderGroup = withAction<
  typeof savePurchaseOrderGroupSchema,
  PurchaseOrderGroupActionData
>(
  {
    roles: PO_CREATE_ROLES,
    schema: savePurchaseOrderGroupSchema,
    permission: PERMISSION_KEYS.PROCUREMENT_PO_CREATE,
  },
  async (
    {
      groupKey,
      branchId,
      expectedDeliveryDate,
      notes,
      lines,
      submit,
      idempotencyKey,
    },
    { supabase },
  ) => {
    const { data, error } = await supabase.rpc(
      "save_purchase_order_group" as never,
      {
        p_group_key: groupKey ?? null,
        p_branch_id: branchId,
        p_expected_delivery_date: expectedDeliveryDate ?? null,
        p_notes: notes ?? "",
        p_lines: lines.map((line) => ({
          ingredient_id: line.ingredientId,
          quantity: line.quantity,
          entry_unit_id: line.entryUnitId,
        })),
        p_submit: submit,
        p_idempotency_key: idempotencyKey,
      } as never,
    );
    if (error) {
      return mapProcurementRpcError(error, "Không thể lưu phiếu mua.");
    }

    const parsed = z
      .discriminatedUnion("ok", [
        z.object({
          ok: z.literal(false),
          error_code: z.literal("supplier_default_missing"),
          missing_supplier_items: z.array(
            z.object({
              ingredient_id: z.coerce.number().int().positive(),
              ingredient_name: z.string(),
            }),
          ),
        }),
        z.object({
          ok: z.literal(true),
          purchase_group_key: z.string().uuid(),
          purchase_group_code: z.string(),
          purchase_orders: z
            .array(
              z.object({
                po_id: z.coerce.number().int().positive(),
                po_number: z.string(),
                supplier_id: z.coerce.number().int().positive(),
                group_sequence: z.coerce.number().int().positive(),
                status: z.string(),
              }),
            )
            .min(1),
        }),
      ])
      .safeParse(data);

    if (!parsed.success) {
      return { success: false, error: "Phản hồi lưu phiếu mua không hợp lệ." };
    }
    if (!parsed.data.ok) {
      return {
        success: false,
        error: `Chưa có NCC mặc định: ${parsed.data.missing_supplier_items
          .map((item) => item.ingredient_name)
          .join(", ")}.`,
      };
    }

    revalidateSurfacePath("/inventory/purchase-orders");
    return {
      success: true,
      data: {
        groupKey: parsed.data.purchase_group_key,
        groupCode: parsed.data.purchase_group_code,
        purchaseOrders: parsed.data.purchase_orders.map((order) => ({
          id: order.po_id,
          code: order.po_number,
          supplierId: order.supplier_id,
          status: order.status,
        })),
      },
    };
  },
);

export const reviewPurchaseOrder = withAction(
  {
    roles: PO_REVIEW_ROLES,
    schema: reviewPurchaseOrderSchema,
    permission: PERMISSION_KEYS.PROCUREMENT_PO_APPROVE,
  },
  async ({ poId, action, reason }, { supabase }) => {
    const { data, error } = await supabase.rpc(
      "review_purchase_order" as never,
      {
        p_po_id: poId,
        p_action: action,
        p_reason: reason ?? null,
      } as never,
    );
    if (error) {
      return mapProcurementRpcError(error, "Không thể xử lý phiếu mua.");
    }
    const parsed = z
      .object({
        po_id: z.coerce.number().int().positive(),
        status: z.string(),
        grn: z
          .object({
            grn_id: z.coerce.number().int().positive(),
            grn_number: z.string(),
            status: z.string(),
          })
          .nullable(),
      })
      .safeParse(data);
    if (!parsed.success) {
      return {
        success: false,
        error: "Phản hồi xử lý phiếu mua không hợp lệ.",
      };
    }
    revalidateSurfacePath("/inventory/purchase-orders");
    revalidateSurfacePath("/inventory/grn");
    return {
      success: true,
      data: {
        status: parsed.data.status,
        grnId: parsed.data.grn?.grn_id ?? null,
      },
    };
  },
);

export const savePurchaseRequest = withAction(
  {
    roles: PROCUREMENT_ROLES,
    schema: savePurchaseRequestSchema,
    permission: PERMISSION_KEYS.PROCUREMENT_REQUEST_MANAGE,
  },
  async (
    {
      requestId,
      branchId,
      neededBy,
      notes,
      lines,
      submit,
      idempotencyKey,
    },
    { supabase },
  ) => {
    const { data, error } = await supabase.rpc(
      "save_purchase_demand" as never,
      {
        p_demand_id: requestId ?? null,
        p_branch_id: branchId,
        p_needed_by: neededBy ?? null,
        p_notes: notes ?? "",
        p_lines: lines.map((line) => ({
          ingredient_id: line.ingredientId,
          quantity: line.quantity,
          entry_unit_id: line.entryUnitId,
          notes: "",
        })),
        p_submit: submit,
        p_idempotency_key: idempotencyKey ?? null,
      } as never,
    );
    if (error) {
      return mapProcurementRpcError(error, "Không thể tạo yêu cầu mua.");
    }
    const parsed = z
      .object({
        demand_id: z.coerce.number().int().positive(),
        demand_number: z.string(),
        status: z.enum(["draft", "pending_allocation"]),
      })
      .safeParse(data);
    if (!parsed.success) {
      return {
        success: false,
        error: "Phản hồi lưu nhu cầu mua không hợp lệ.",
      };
    }
    revalidateSurfacePath("/inventory/purchase-requests");
    revalidateSurfacePath("/inventory/purchase-orders");
    return {
      success: true,
      data: {
        id: parsed.data.demand_id,
        code: parsed.data.demand_number,
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
  async (
    {
      demandId,
      branchId,
      neededBy,
      notes,
      lines,
      submit,
      idempotencyKey,
    },
    { supabase },
  ) => {
    const { data, error } = await supabase.rpc(
      "save_purchase_demand" as never,
      {
        p_demand_id: demandId ?? null,
        p_branch_id: branchId,
        p_needed_by: neededBy ?? null,
        p_notes: notes ?? "",
        p_lines: lines.map((line) => ({
          ingredient_id: line.ingredientId,
          quantity: line.quantity,
          entry_unit_id: line.entryUnitId,
          notes: "",
        })),
        p_submit: submit,
        p_idempotency_key: idempotencyKey ?? null,
      } as never,
    );
    if (error) {
      return mapProcurementRpcError(error, "Không thể lưu nhu cầu mua.");
    }
    const parsed = z
      .object({
        demand_id: z.coerce.number().int().positive(),
        demand_number: z.string(),
        status: z.enum(["draft", "pending_allocation"]),
      })
      .safeParse(data);
    if (!parsed.success) {
      return {
        success: false,
        error: "Phản hồi lưu nhu cầu mua không hợp lệ.",
      };
    }
    revalidateSurfacePath("/inventory/purchase-orders");
    return {
      success: true,
      data: {
        id: parsed.data.demand_id,
        code: parsed.data.demand_number,
        status: parsed.data.status,
      },
    };
  },
);

export const savePurchaseDemandAllocations = withAction(
  {
    roles: PO_REVIEW_ROLES,
    schema: savePurchaseDemandAllocationsSchema,
    permission: PERMISSION_KEYS.PROCUREMENT_PO_APPROVE,
  },
  async ({ demandId, allocations, idempotencyKey }, { supabase }) => {
    const { error } = await supabase.rpc(
      "save_purchase_demand_allocations" as never,
      {
        p_demand_id: demandId,
        p_allocations: allocations.map((allocation) => ({
          request_item_id: allocation.requestItemId,
          supplier_id: allocation.supplierId,
          quantity: allocation.quantity,
        })),
        p_idempotency_key: idempotencyKey,
      } as never,
    );
    if (error) {
      return mapProcurementRpcError(error, "Không thể lưu phân bổ NCC.");
    }
    revalidateSurfacePath("/inventory/purchase-orders");
    return { success: true };
  },
);

export const reviewPurchaseDemand = withAction(
  {
    roles: PO_REVIEW_ROLES,
    schema: reviewPurchaseDemandSchema,
    permission: PERMISSION_KEYS.PROCUREMENT_PO_APPROVE,
  },
  async (
    { demandId, action, allocations, reason, idempotencyKey },
    { supabase },
  ) => {
    const { data, error } = await supabase.rpc(
      "review_purchase_demand" as never,
      {
        p_demand_id: demandId,
        p_action: action,
        p_allocations:
          allocations?.map((allocation) => ({
            request_item_id: allocation.requestItemId,
            supplier_id: allocation.supplierId,
            quantity: allocation.quantity,
          })) ?? null,
        p_reason: reason ?? null,
        p_idempotency_key: idempotencyKey ?? null,
      } as never,
    );
    if (error) {
      return mapProcurementRpcError(error, "Không thể xử lý nhu cầu mua.");
    }
    const parsed = z
      .object({
        demand_id: z.coerce.number().int().positive(),
        status: z.string(),
        purchase_group_key: z.string().uuid().optional(),
        purchase_group_code: z.string().optional(),
        purchase_orders: z
          .array(
            z.object({
              po_id: z.coerce.number().int().positive(),
              po_number: z.string(),
              supplier_id: z.coerce.number().int().positive(),
              status: z.string(),
            }),
          )
          .optional(),
      })
      .safeParse(data);
    if (!parsed.success) {
      return {
        success: false,
        error: "Phản hồi xử lý nhu cầu mua không hợp lệ.",
      };
    }
    revalidateSurfacePath("/inventory/purchase-orders");
    revalidateSurfacePath("/inventory/grn");
    return {
      success: true,
      data: {
        status: parsed.data.status,
        purchaseOrders: (parsed.data.purchase_orders ?? []).map((order) => ({
          id: order.po_id,
          code: order.po_number,
          supplierId: order.supplier_id,
          status: order.status,
        })),
      },
    };
  },
);

export const cancelPurchaseRequest = withAction(
  {
    roles: PROCUREMENT_ROLES,
    schema: purchaseRequestReasonSchema,
    permission: PERMISSION_KEYS.PROCUREMENT_REQUEST_MANAGE,
  },
  async ({ requestId, reason }, { supabase }) => {
    const { error } = await supabase.rpc(
      "cancel_purchase_request" as never,
      {
        p_request_id: requestId,
        p_reason: reason,
      } as never,
    );
    if (error) {
      return mapProcurementRpcError(error, "Không thể hủy yêu cầu mua.");
    }
    revalidateSurfacePath("/inventory/purchase-orders");
    return { success: true };
  },
);

export const closePurchaseRequest = withAction(
  {
    roles: PO_REVIEW_ROLES,
    schema: purchaseRequestReasonSchema,
    permission: PERMISSION_KEYS.PROCUREMENT_PO_APPROVE,
  },
  async ({ requestId, reason }, { supabase }) => {
    const { error } = await supabase.rpc(
      "close_purchase_request" as never,
      {
        p_request_id: requestId,
        p_reason: reason,
      } as never,
    );
    if (error) {
      return mapProcurementRpcError(error, "Không thể đóng yêu cầu mua.");
    }
    revalidateSurfacePath("/inventory/purchase-orders");
    return { success: true };
  },
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

export const sendPurchaseOrder = withAction(
  {
    roles: PO_MUTATE_ROLES,
    schema: poIdSchema,
    permission: PERMISSION_KEYS.PROCUREMENT_PO_CREATE,
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
        error: "Chỉ gửi được đơn đặt hàng đang ở trạng thái nháp.",
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

    const { error } = await supabase.rpc("send_purchase_order" as never, {
      p_po_id: poId,
    } as never);
    if (error) {
      if (error.message.includes("supplier_item_mapping_required")) {
        return {
          success: false,
          error: "Có nguyên liệu chưa được gán cho nhà cung cấp.",
        };
      }
      return mapProcurementRpcError(error, "Không thể gửi đơn đặt hàng.");
    }

    revalidateSurfacePath("/inventory/purchase-orders");
    revalidateSurfacePath("/inventory/grn");
    return { success: true };
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
    roles: PO_MUTATE_ROLES,
    schema: poReasonSchema,
    permission: PERMISSION_KEYS.PROCUREMENT_PO_CREATE,
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
