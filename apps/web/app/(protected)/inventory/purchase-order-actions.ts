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
import { loadInventoryMonetaryAccess } from "@lib/inventory/monetary-access";

const poIdSchema = z.object({
  poId: z.coerce.number().int().positive(),
});

const poPricesSchema = poIdSchema.extend({
  lines: z
    .array(
      z.object({
        lineId: z.coerce.number().int().positive(),
        unitPrice: z.coerce.number().nonnegative(),
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

const createGrnDraftSchema = poIdSchema.extend({
  idempotencyKey: z.string().uuid(),
});

const purchaseRequestLineSchema = z.object({
  ingredientId: z.coerce.number().int().positive(),
  quantity: z.coerce.number().positive(),
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

const purchaseRequestIdSchema = z.object({
  requestId: z.coerce.number().int().positive(),
});

const documentReasonSchema = z.object({
  reason: z.string().trim().min(5).max(500),
});

const purchaseRequestReasonSchema =
  purchaseRequestIdSchema.extend(documentReasonSchema.shape);

const createPoFromRequestSchema = purchaseRequestIdSchema.extend({
  supplierId: z.coerce.number().int().positive(),
  expectedDeliveryDate: z.iso.date().nullable().optional(),
  lines: z
    .array(
      z.object({
        requestItemId: z.coerce.number().int().positive(),
        quantity: z.coerce.number().positive(),
        unitPrice: z.coerce.number().nonnegative(),
      }),
    )
    .min(1)
    .max(200),
});

const createPurchaseOrdersFromRequestSchema = purchaseRequestIdSchema.extend({
  orders: z
    .array(createPoFromRequestSchema.omit({ requestId: true }))
    .min(1)
    .max(100),
  send: z.boolean().default(true),
  idempotencyKey: z.string().uuid().optional(),
});

const savePurchaseOrderSchema = poIdSchema.extend({
  expectedDeliveryDate: z.iso.date().nullable().optional(),
  notes: z.string().trim().max(500).optional(),
  lines: z
    .array(
      z.object({
        lineId: z.coerce.number().int().positive(),
        quantity: z.coerce.number().positive(),
        unitPrice: z.coerce.number().nonnegative(),
      }),
    )
    .min(1)
    .optional(),
  send: z.boolean().default(false),
});

const poReasonSchema = poIdSchema.extend(documentReasonSchema.shape);

function procurementRpcError(
  error: { code?: string; message: string },
  fallback: string,
): string {
  const known: Array<[string, string]> = [
    [
      "purchase_request_central_site_required",
      "Yêu cầu mua phải thuộc Kho Tổng hoặc Bếp Trung Tâm.",
    ],
    ["purchase_request_line_invalid", "Có dòng yêu cầu mua không hợp lệ."],
    [
      "purchase_request_not_editable",
      "Yêu cầu mua đã có đơn đặt hàng hoặc không còn được phép sửa.",
    ],
    [
      "purchase_request_not_cancellable",
      "Yêu cầu mua đã có đơn đặt hàng hoặc không còn được phép hủy.",
    ],
    [
      "purchase_request_not_closable",
      "Chỉ đóng được yêu cầu mua đã xử lý một phần.",
    ],
    [
      "purchase_request_not_orderable",
      "Yêu cầu mua chưa sẵn sàng tạo đơn đặt hàng.",
    ],
    [
      "purchase_order_line_invalid",
      "Số lượng hoặc giá trên đơn đặt hàng không hợp lệ.",
    ],
    [
      "purchase_order_not_sendable",
      "Đơn đặt hàng chưa đủ dữ liệu hoặc không còn được phép gửi.",
    ],
    [
      "purchase_order_not_editable",
      "Đơn đặt hàng đã phát sinh nhập kho hoặc không còn được phép sửa.",
    ],
    [
      "purchase_order_lines_locked",
      "Đơn đặt hàng đã có phiếu nhập nháp nên các dòng hàng đang bị khóa.",
    ],
    [
      "purchase_order_not_cancellable",
      "Đơn đặt hàng đã có phiếu nhập xác nhận hoặc không còn được phép hủy.",
    ],
    [
      "purchase_order_not_closable",
      "Chỉ đóng được đơn đặt hàng đã nhận một phần.",
    ],
    ["reason_required", "Vui lòng nhập lý do tối thiểu 5 ký tự."],
    [
      "supplier_item_mapping_required",
      "Có nguyên liệu chưa được gán cho nhà cung cấp.",
    ],
    ["receiving_warehouse_required", "Chưa cấu hình kho nhận hàng."],
    ["42501", "Bạn không có quyền thực hiện thao tác này."],
    ["P0002", "Không tìm thấy chứng từ hoặc nhà cung cấp."],
  ];
  return (
    known.find(
      ([token]) => error.code === token || error.message.includes(token),
    )?.[1] ?? fallback
  );
}

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
      "save_purchase_request" as never,
      {
        p_request_id: requestId ?? null,
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
      return {
        success: false,
        error: procurementRpcError(error, "Không thể tạo yêu cầu mua."),
      };
    }
    const parsed = z
      .object({
        request_id: z.coerce.number().int().positive(),
        request_number: z.string(),
        status: z.enum(["draft", "submitted"]),
      })
      .safeParse(data);
    if (!parsed.success) {
      return {
        success: false,
        error: "Phản hồi lưu yêu cầu mua không hợp lệ.",
      };
    }
    revalidateSurfacePath("/inventory/purchase-requests");
    return {
      success: true,
      data: {
        id: parsed.data.request_id,
        code: parsed.data.request_number,
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
      return {
        success: false,
        error: procurementRpcError(error, "Không thể hủy yêu cầu mua."),
      };
    }
    revalidateSurfacePath("/inventory/purchase-requests");
    return { success: true };
  },
);

export const closePurchaseRequest = withAction(
  {
    roles: PROCUREMENT_ROLES,
    schema: purchaseRequestReasonSchema,
    permission: PERMISSION_KEYS.PROCUREMENT_REQUEST_MANAGE,
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
      return {
        success: false,
        error: procurementRpcError(error, "Không thể đóng yêu cầu mua."),
      };
    }
    revalidateSurfacePath("/inventory/purchase-requests");
    return { success: true };
  },
);

export const createPurchaseOrderFromRequest = withAction(
  {
    roles: PO_MUTATE_ROLES,
    schema: createPoFromRequestSchema,
    permission: PERMISSION_KEYS.PROCUREMENT_PO_CREATE,
  },
  async (
    { requestId, supplierId, expectedDeliveryDate, lines },
    { supabase, claims },
  ) => {
    const monetary = await loadInventoryMonetaryAccess(claims.user_role);
    if (!monetary.purchasePrice) {
      return { success: false, error: "Không có quyền nhập giá mua." };
    }
    const { data, error } = await supabase.rpc(
      "create_purchase_order_from_request" as never,
      {
        p_request_id: requestId,
        p_supplier_id: supplierId,
        p_expected_delivery_date: expectedDeliveryDate ?? null,
        p_notes: "",
        p_lines: lines.map((line) => ({
          request_item_id: line.requestItemId,
          quantity: line.quantity,
          unit_price: line.unitPrice,
        })),
      } as never,
    );
    if (error) {
      return {
        success: false,
        error: procurementRpcError(error, "Không thể tạo đơn đặt hàng."),
      };
    }
    const parsed = z
      .object({
        po_id: z.coerce.number().int().positive(),
        po_number: z.string(),
        status: z.literal("draft"),
      })
      .safeParse(data);
    if (!parsed.success) {
      return {
        success: false,
        error: "Phản hồi tạo đơn đặt hàng không hợp lệ.",
      };
    }
    revalidateSurfacePath("/inventory/purchase-requests");
    revalidateSurfacePath("/inventory/purchase-orders");
    revalidateSurfacePath("/inventory/grn");
    return {
      success: true,
      data: { id: parsed.data.po_id, code: parsed.data.po_number },
    };
  },
);

export const savePurchaseOrdersFromRequest = withAction(
  {
    roles: PO_MUTATE_ROLES,
    schema: createPurchaseOrdersFromRequestSchema,
    permission: PERMISSION_KEYS.PROCUREMENT_PO_CREATE,
  },
  async (
    { requestId, orders, send, idempotencyKey },
    { supabase, claims },
  ) => {
    const monetary = await loadInventoryMonetaryAccess(claims.user_role);
    if (!monetary.purchasePrice) {
      return { success: false, error: "Không có quyền nhập giá mua." };
    }
    const { data, error } = await supabase.rpc(
      "save_purchase_orders_from_request" as never,
      {
        p_request_id: requestId,
        p_orders: orders.map((order) => ({
          supplier_id: order.supplierId,
          expected_delivery_date: order.expectedDeliveryDate ?? null,
          notes: "",
          lines: order.lines.map((line) => ({
            request_item_id: line.requestItemId,
            quantity: line.quantity,
            unit_price: line.unitPrice,
          })),
        })),
        p_send: send,
        p_idempotency_key: idempotencyKey ?? null,
      } as never,
    );
    if (error) {
      return {
        success: false,
        error: procurementRpcError(error, "Không thể tạo đơn đặt hàng."),
      };
    }
    const parsed = z
      .object({
        purchase_orders: z
          .array(
            z.object({
              po_id: z.coerce.number().int().positive(),
              po_number: z.string(),
              status: z.enum(["draft", "sent"]),
            }),
          )
          .min(1),
      })
      .safeParse(data);
    if (!parsed.success) {
      return {
        success: false,
        error: "Phản hồi tạo đơn đặt hàng không hợp lệ.",
      };
    }
    revalidateSurfacePath("/inventory/purchase-requests");
    revalidateSurfacePath("/inventory/purchase-orders");
    revalidateSurfacePath("/inventory/grn");
    return {
      success: true,
      data: parsed.data.purchase_orders.map((order) => ({
        id: order.po_id,
        code: order.po_number,
      })),
    };
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

export const savePurchaseOrder = withAction(
  {
    roles: PO_MUTATE_ROLES,
    schema: savePurchaseOrderSchema,
    permission: PERMISSION_KEYS.PROCUREMENT_PO_CREATE,
  },
  async (
    { poId, expectedDeliveryDate, notes, lines, send },
    { supabase, claims },
  ) => {
    const monetary = await loadInventoryMonetaryAccess(claims.user_role);
    if (lines && !monetary.purchasePrice) {
      return { success: false, error: "Không có quyền nhập giá mua." };
    }
    const { error } = await supabase.rpc("save_purchase_order" as never, {
      p_po_id: poId,
      p_expected_delivery_date: expectedDeliveryDate ?? null,
      p_notes: notes ?? "",
      p_lines:
        lines?.map((line) => ({
          line_id: line.lineId,
          quantity: line.quantity,
          unit_price: line.unitPrice,
        })) ?? null,
      p_send: send,
    } as never);
    if (error) {
      return {
        success: false,
        error: procurementRpcError(error, "Không thể lưu đơn đặt hàng."),
      };
    }
    revalidateSurfacePath("/inventory/purchase-orders");
    revalidateSurfacePath("/inventory/purchase-requests");
    revalidateSurfacePath("/inventory/grn");
    return { success: true };
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
      return {
        success: false,
        error: procurementRpcError(error, "Không thể gửi đơn đặt hàng."),
      };
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
      return {
        success: false,
        error: procurementRpcError(error, "Không thể hủy đơn đặt hàng."),
      };
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
      return {
        success: false,
        error: procurementRpcError(error, "Không thể đóng đơn đặt hàng."),
      };
    }
    revalidateSurfacePath("/inventory/purchase-orders");
    revalidateSurfacePath("/inventory/grn");
    return { success: true };
  },
);
