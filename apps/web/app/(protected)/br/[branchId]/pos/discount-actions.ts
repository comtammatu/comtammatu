"use server";

import { z } from "zod";
import { MODULE_ACL, PERMISSION_KEYS } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { messages } from "@lib/messages";
import { getAuthContextWithPermission } from "../../_lib/auth";
import { logAudit } from "@/_lib/audit";
import { isPosBranchInScope } from "./_lib/auth";
import { POS_ERROR_CODES } from "./_utils/error-codes";

/* ─── Constants ─── */

const POS_ROLES = MODULE_ACL.pos.allowedRoles;

/* ─── Common schemas ─── */

const branchIdSchema = z.coerce
  .number()
  .int()
  .positive({ error: "Mã chi nhánh không hợp lệ" });

const orderIdSchema = z.coerce
  .number()
  .int()
  .positive({ error: "Mã đơn hàng không hợp lệ" });

const orderItemIdSchema = z.coerce
  .number()
  .int()
  .positive({ error: "Món không hợp lệ" });

const idempotencyKeySchema = z
  .string()
  .uuid({ error: "Mã giao dịch không hợp lệ" })
  .optional();

/**
 * Map a Postgres RPC error string fragment to a Vietnamese user message.
 * Centralised so 4 actions share the same Vietnamese copy and so swapping
 * a server error code only touches this map.
 *
 * Returns a fallback string when no fragment matches — never leaks the raw
 * Postgres `error.message` to the client.
 */
function mapDiscountRpcError(message: string): string {
  const msg = String(message ?? "").toLowerCase();

  // Permission / scope
  if (msg.includes("forbidden") || msg.includes("42501")) {
    return "Không có quyền thực hiện thao tác này.";
  }
  if (msg.includes("tenant mismatch") || msg.includes("branch mismatch")) {
    return "Không có quyền truy cập đơn này.";
  }
  if (msg.includes("order not found")) {
    return "Không tìm thấy đơn hàng.";
  }
  if (msg.includes("order item not found")) {
    return "Không tìm thấy món trong đơn.";
  }

  // Discount-specific
  if (msg.includes("discount_invalid_type")) {
    return "Loại chiết khấu không hợp lệ (chỉ % hoặc VNĐ).";
  }
  if (msg.includes("discount_invalid_value")) {
    return "Giá trị giảm phải >= 0.";
  }
  if (msg.includes("discount_note_required")) {
    return "Ghi chú giảm giá tối thiểu 3 ký tự.";
  }
  if (msg.includes("discount_zero_amount")) {
    return "Giá trị giảm bằng 0 — vui lòng dùng nút Bỏ chiết khấu.";
  }
  if (msg.includes("order already paid")) {
    return "Đơn đã thanh toán, không thể sửa chiết khấu.";
  }
  if (msg.includes("order terminal")) {
    return "Đơn đã hủy hoặc hoàn tất.";
  }
  if (msg.includes("order item cancelled")) {
    return "Món đã hủy, không thể sửa chiết khấu.";
  }
  if (msg.includes("payment_code_locked")) {
    return "Đơn đã phát hành QR/chuyển khoản, không thể đổi số tiền. Vui lòng hoàn tất thanh toán hoặc xử lý lại đơn.";
  }
  // Constraint violation when discount metadata partially set (race / bug)
  if (
    msg.includes("orders_discount_metadata_paired") ||
    msg.includes("orders_order_discount_metadata_paired") ||
    msg.includes("orders_discount_amount_source_check") ||
    msg.includes("order_items_discount_metadata_paired")
  ) {
    return "Dữ liệu chiết khấu không nhất quán. Vui lòng tải lại đơn.";
  }

  // Split-specific
  if (msg.includes("split_no_items")) {
    return "Vui lòng chọn ít nhất một món để tách.";
  }
  if (msg.includes("split_items_invalid")) {
    return "Một hoặc nhiều món không thuộc đơn này hoặc đã hủy.";
  }
  if (msg.includes("split_would_empty_source")) {
    return "Phải giữ lại ít nhất 1 món trên đơn gốc.";
  }
  if (msg.includes("split_source_paid")) {
    return "Đơn đã thanh toán, không thể tách.";
  }
  if (msg.includes("split_source_not_eligible")) {
    return "Không thể tách: đơn ở trạng thái không hợp lệ.";
  }
  if (msg.includes("split_payment_pending")) {
    return "Đơn có thanh toán đang chờ — vui lòng hoàn tất thanh toán trước khi tách.";
  }
  if (msg.includes("split_merge_disabled")) {
    return "Tính năng tách/gộp hóa đơn đang tắt.";
  }

  // Merge-specific
  if (msg.includes("merge_self")) {
    return "Không thể gộp một đơn vào chính nó.";
  }
  if (msg.includes("merge_different_branch")) {
    return "Hai đơn không cùng chi nhánh.";
  }
  if (msg.includes("merge_dine_in_only")) {
    return "Chỉ gộp được đơn tại bàn (không gộp đơn mang về).";
  }
  if (msg.includes("merge_different_tables")) {
    return "Hai đơn không cùng bàn.";
  }
  if (msg.includes("merge_already_merged")) {
    return "Một trong hai đơn đã được gộp trước đó.";
  }
  if (msg.includes("merge_terminal")) {
    return "Một trong hai đơn đã hủy hoặc hoàn tất.";
  }
  if (msg.includes("merge_paid")) {
    return "Một trong hai đơn đã thanh toán.";
  }
  if (msg.includes("merge_payment_pending")) {
    return "Có thanh toán đang chờ — vui lòng hoàn tất thanh toán trước khi gộp.";
  }
  if (msg.includes("merge_pct_discount_blocked")) {
    return "Có chiết khấu % — vui lòng gỡ chiết khấu một trong hai đơn trước khi gộp.";
  }

  // Lock contention
  if (msg.includes("55p03")) {
    return "Đang có thao tác khác trên đơn này. Vui lòng thử lại.";
  }

  console.error("[discount-actions] [unmapped] rpc error:", message);
  return "Không thể thực hiện thao tác. Vui lòng thử lại.";
}

/* ─── applyOrderDiscount ─── */

const applyDiscountInputSchema = z.object({
  orderId: orderIdSchema,
  type: z.enum(["pct", "vnd"], {
    error: "Loại chiết khấu không hợp lệ",
  }),
  // Server clamps (pct → 100, vnd → subtotal). UI also clamps onChange.
  // Zod just floors at 0 so a negative slip never reaches the RPC.
  value: z.coerce
    .number({ error: "Giá trị giảm không hợp lệ" })
    .min(0, { error: "Giá trị giảm phải >= 0" }),
  note: z
    .string()
    .trim()
    .min(3, { error: "Ghi chú giảm giá tối thiểu 3 ký tự" })
    .max(200, { error: "Ghi chú quá dài (max 200 ký tự)" }),
});

export async function applyOrderDiscount(
  branchId: number,
  input: {
    orderId: number;
    type: "pct" | "vnd";
    value: number;
    note: string;
  },
): Promise<
  ActionResult<{
    order_id: number;
    discount_type: "pct" | "vnd";
    discount_value: number;
    discount_amount: number;
    total_amount: number;
  }>
> {
  const parsedBranch = branchIdSchema.safeParse(branchId);
  if (!parsedBranch.success) {
    return {
      success: false,
      error: "Mã chi nhánh không hợp lệ",
      errorCode: POS_ERROR_CODES.INPUT_INVALID_BRANCH,
    };
  }

  const parsed = applyDiscountInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
      errorCode: POS_ERROR_CODES.INPUT_INVALID_DISCOUNT,
    };
  }

  const ctx = await getAuthContextWithPermission(
    POS_ROLES,
    PERMISSION_KEYS.POS_USE,
  );
  if (!ctx) {
    return {
      success: false,
      error: "Không có quyền",
      errorCode: POS_ERROR_CODES.AUTH_NO_PERMISSION,
    };
  }

  const { supabase, claims } = ctx;

  if (!isPosBranchInScope(claims, parsedBranch.data)) {
    return {
      success: false,
      error: "Không có quyền truy cập chi nhánh này",
      errorCode: POS_ERROR_CODES.SCOPE_BRANCH_MISMATCH,
    };
  }

  const { data, error } = await supabase.rpc("apply_order_discount", {
    p_order_id: parsed.data.orderId,
    p_type: parsed.data.type,
    p_value: parsed.data.value,
    p_note: parsed.data.note,
  });

  if (error) {
    return {
      success: false,
      error: mapDiscountRpcError(error.message),
      errorCode: POS_ERROR_CODES.RPC_GENERIC,
    };
  }

  const result = data as unknown as {
    order_id: number;
    discount_type: "pct" | "vnd";
    discount_value: number;
    discount_amount: number;
    total_amount: number;
  } | null;

  if (!result) {
    return {
      success: false,
      error: "Không thể áp chiết khấu. Vui lòng thử lại.",
      errorCode: POS_ERROR_CODES.RPC_GENERIC,
    };
  }

  return {
    success: true,
    data: {
      order_id: result.order_id,
      discount_type: result.discount_type,
      discount_value: Number(result.discount_value),
      discount_amount: Number(result.discount_amount),
      total_amount: Number(result.total_amount),
    },
  };
}

/* ─── clearOrderDiscount ─── */

const clearDiscountInputSchema = z.object({
  orderId: orderIdSchema,
  reason: z
    .string()
    .trim()
    .min(3, { error: "Lý do bỏ chiết khấu tối thiểu 3 ký tự" })
    .max(200, { error: "Lý do quá dài (max 200 ký tự)" }),
});

export async function clearOrderDiscount(
  branchId: number,
  orderId: number,
  reason: string,
): Promise<ActionResult<{ order_id: number; total_amount: number }>> {
  const parsedBranch = branchIdSchema.safeParse(branchId);
  if (!parsedBranch.success) {
    return { success: false, error: "Mã chi nhánh không hợp lệ" };
  }

  const parsed = clearDiscountInputSchema.safeParse({ orderId, reason });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const ctx = await getAuthContextWithPermission(
    POS_ROLES,
    PERMISSION_KEYS.POS_USE,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  if (!isPosBranchInScope(claims, parsedBranch.data)) {
    return { success: false, error: "Không có quyền truy cập chi nhánh này" };
  }

  // Snapshot the old discount BEFORE the RPC so the audit captures it —
  // after the RPC these columns are NULL and unrecoverable. An order on
  // another branch is filtered by RLS → `oldData=null`, and the RPC still
  // raises the tenant/branch mismatch.
  const { data: existing } = await supabase
    .from("orders")
    .select(
      "discount_type, discount_value, discount_amount, order_discount_amount, item_discount_amount, discount_note",
    )
    .eq("id", parsed.data.orderId)
    .eq("tenant_id", claims.tenant_id)
    .eq("branch_id", parsedBranch.data)
    .maybeSingle();

  const { data, error } = await supabase.rpc("clear_order_discount", {
    p_order_id: parsed.data.orderId,
  });

  if (error) {
    return { success: false, error: mapDiscountRpcError(error.message) };
  }

  const result = data as unknown as {
    order_id: number;
    total_amount: number;
  } | null;

  if (!result) {
    return {
      success: false,
      error: "Không thể bỏ chiết khấu. Vui lòng thử lại.",
    };
  }

  // Fire-and-forget audit. Clearing a discount is a financial action that
  // needs a traceable reason — symmetric with `apply_order_discount` (note
  // stored in `orders.discount_note`) and `void_order_item` (RPC self-logs).
  await logAudit(supabase, {
    action: "order.discount.cleared",
    entityType: "orders",
    entityId: result.order_id,
    oldData: existing
      ? {
          discount_type: existing.discount_type,
          discount_value: existing.discount_value,
          discount_amount: existing.discount_amount,
          order_discount_amount: existing.order_discount_amount,
          item_discount_amount: existing.item_discount_amount,
          discount_note: existing.discount_note,
        }
      : null,
    newData: {
      reason: parsed.data.reason,
      total_amount: Number(result.total_amount),
    },
  });

  return {
    success: true,
    data: {
      order_id: result.order_id,
      total_amount: Number(result.total_amount),
    },
  };
}

/* ─── item-level discounts ─── */

const applyItemDiscountInputSchema = z.object({
  orderItemId: orderItemIdSchema,
  type: z.literal("vnd", {
    error: "Chiết khấu món chỉ hỗ trợ số tiền",
  }),
  value: z.coerce
    .number({ error: "Giá trị giảm không hợp lệ" })
    .min(0, { error: "Giá trị giảm phải >= 0" }),
  note: z
    .string()
    .trim()
    .min(3, { error: "Ghi chú giảm giá tối thiểu 3 ký tự" })
    .max(200, { error: "Ghi chú quá dài (max 200 ký tự)" }),
});

const clearItemDiscountInputSchema = z.object({
  orderItemId: orderItemIdSchema,
  reason: z
    .string()
    .trim()
    .min(3, { error: "Lý do bỏ chiết khấu tối thiểu 3 ký tự" })
    .max(200, { error: "Lý do quá dài (max 200 ký tự)" }),
});

type ItemDiscountActionData = {
  order_id: number;
  order_item_id: number;
  discount_type?: "vnd" | null;
  discount_value?: number | null;
  discount_amount?: number | null;
  discount_note?: string | null;
  order_discount_amount: number;
  item_discount_amount: number;
  total_discount_amount: number;
  total_amount: number;
};

export async function applyOrderItemDiscount(
  branchId: number,
  input: {
    orderItemId: number;
    type: "vnd";
    value: number;
    note: string;
  },
): Promise<ActionResult<ItemDiscountActionData>> {
  const parsedBranch = branchIdSchema.safeParse(branchId);
  if (!parsedBranch.success) {
    return {
      success: false,
      error: "Mã chi nhánh không hợp lệ",
      errorCode: POS_ERROR_CODES.INPUT_INVALID_BRANCH,
    };
  }

  const parsed = applyItemDiscountInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
      errorCode: POS_ERROR_CODES.INPUT_INVALID_DISCOUNT,
    };
  }

  const ctx = await getAuthContextWithPermission(
    POS_ROLES,
    PERMISSION_KEYS.POS_USE,
  );
  if (!ctx) {
    return {
      success: false,
      error: "Không có quyền",
      errorCode: POS_ERROR_CODES.AUTH_NO_PERMISSION,
    };
  }

  const { supabase, claims } = ctx;

  if (!isPosBranchInScope(claims, parsedBranch.data)) {
    return {
      success: false,
      error: "Không có quyền truy cập chi nhánh này",
      errorCode: POS_ERROR_CODES.SCOPE_BRANCH_MISMATCH,
    };
  }

  const { data, error } = await supabase.rpc("apply_order_item_discount", {
    p_order_item_id: parsed.data.orderItemId,
    p_type: parsed.data.type,
    p_value: parsed.data.value,
    p_note: parsed.data.note,
  });

  if (error) {
    return {
      success: false,
      error: mapDiscountRpcError(error.message),
      errorCode: POS_ERROR_CODES.RPC_GENERIC,
    };
  }

  const result = data as unknown as ItemDiscountActionData | null;
  if (!result) {
    return {
      success: false,
      error: "Không thể áp chiết khấu món. Vui lòng thử lại.",
      errorCode: POS_ERROR_CODES.RPC_GENERIC,
    };
  }

  return {
    success: true,
    data: {
      order_id: Number(result.order_id),
      order_item_id: Number(result.order_item_id),
      discount_type: result.discount_type ?? null,
      discount_value:
        result.discount_value == null ? null : Number(result.discount_value),
      discount_amount:
        result.discount_amount == null ? null : Number(result.discount_amount),
      discount_note: result.discount_note ?? null,
      order_discount_amount: Number(result.order_discount_amount),
      item_discount_amount: Number(result.item_discount_amount),
      total_discount_amount: Number(result.total_discount_amount),
      total_amount: Number(result.total_amount),
    },
  };
}

export async function clearOrderItemDiscount(
  branchId: number,
  orderItemId: number,
  reason: string,
): Promise<ActionResult<ItemDiscountActionData>> {
  const parsedBranch = branchIdSchema.safeParse(branchId);
  if (!parsedBranch.success) {
    return {
      success: false,
      error: "Mã chi nhánh không hợp lệ",
      errorCode: POS_ERROR_CODES.INPUT_INVALID_BRANCH,
    };
  }

  const parsed = clearItemDiscountInputSchema.safeParse({ orderItemId, reason });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
      errorCode: POS_ERROR_CODES.INPUT_INVALID_DISCOUNT,
    };
  }

  const ctx = await getAuthContextWithPermission(
    POS_ROLES,
    PERMISSION_KEYS.POS_USE,
  );
  if (!ctx) {
    return {
      success: false,
      error: "Không có quyền",
      errorCode: POS_ERROR_CODES.AUTH_NO_PERMISSION,
    };
  }

  const { supabase, claims } = ctx;

  if (!isPosBranchInScope(claims, parsedBranch.data)) {
    return {
      success: false,
      error: "Không có quyền truy cập chi nhánh này",
      errorCode: POS_ERROR_CODES.SCOPE_BRANCH_MISMATCH,
    };
  }

  const { data, error } = await supabase.rpc("clear_order_item_discount", {
    p_order_item_id: parsed.data.orderItemId,
    p_reason: parsed.data.reason,
  });

  if (error) {
    return {
      success: false,
      error: mapDiscountRpcError(error.message),
      errorCode: POS_ERROR_CODES.RPC_GENERIC,
    };
  }

  const result = data as unknown as ItemDiscountActionData | null;
  if (!result) {
    return {
      success: false,
      error: "Không thể bỏ chiết khấu món. Vui lòng thử lại.",
      errorCode: POS_ERROR_CODES.RPC_GENERIC,
    };
  }

  return {
    success: true,
    data: {
      order_id: Number(result.order_id),
      order_item_id: Number(result.order_item_id),
      discount_type: null,
      discount_value: null,
      discount_amount: 0,
      discount_note: null,
      order_discount_amount: Number(result.order_discount_amount),
      item_discount_amount: Number(result.item_discount_amount),
      total_discount_amount: Number(result.total_discount_amount),
      total_amount: Number(result.total_amount),
    },
  };
}

/* ─── splitOrder ─── */

const splitInputSchema = z.object({
  sourceOrderId: orderIdSchema,
  // Each entry: move `quantity` units of `itemId` from source to new order.
  // quantity == row.quantity → full-line move (in-place UPDATE order_id);
  // quantity <  row.quantity → partial (clone onto the new order, reduce
  // the source qty). Lets "2 Cơm sườn" (1 row qty=2) split into 2 bills.
  items: z
    .array(
      z.object({
        itemId: z.coerce
          .number()
          .int()
          .positive({ error: "Mã món không hợp lệ" }),
        quantity: z.coerce
          .number()
          .int()
          .positive({ error: "Số lượng phải ≥ 1" }),
      }),
    )
    .min(1, { error: "Chọn ít nhất 1 phần để tách" }),
  idempotencyKey: idempotencyKeySchema,
});

export async function splitOrder(
  branchId: number,
  input: {
    sourceOrderId: number;
    items: Array<{ itemId: number; quantity: number }>;
    idempotencyKey?: string;
  },
): Promise<
  ActionResult<{
    source_order_id: number;
    new_order_id: number;
    new_order_number: string;
    moved_count: number;
    source_total: number;
    new_total: number;
    idempotent?: boolean;
  }>
> {
  const parsedBranch = branchIdSchema.safeParse(branchId);
  if (!parsedBranch.success) {
    return {
      success: false,
      error: "Mã chi nhánh không hợp lệ",
      errorCode: POS_ERROR_CODES.INPUT_INVALID_BRANCH,
    };
  }

  const parsed = splitInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu tách đơn không hợp lệ",
      errorCode: POS_ERROR_CODES.INPUT_INVALID_SPLIT,
    };
  }

  const ctx = await getAuthContextWithPermission(
    POS_ROLES,
    PERMISSION_KEYS.POS_USE,
  );
  if (!ctx) {
    return {
      success: false,
      error: "Không có quyền",
      errorCode: POS_ERROR_CODES.AUTH_NO_PERMISSION,
    };
  }

  const { supabase, claims } = ctx;

  if (!isPosBranchInScope(claims, parsedBranch.data)) {
    return {
      success: false,
      error: "Không có quyền truy cập chi nhánh này",
      errorCode: POS_ERROR_CODES.SCOPE_BRANCH_MISMATCH,
    };
  }

  const { data, error } = await supabase.rpc("split_order", {
    p_source_order_id: parsed.data.sourceOrderId,
    p_item_partials: parsed.data.items.map((it) => ({
      item_id: it.itemId,
      quantity: it.quantity,
    })),
    p_idempotency_key: parsed.data.idempotencyKey ?? undefined,
  });

  if (error) {
    return {
      success: false,
      error: mapDiscountRpcError(error.message),
      errorCode: POS_ERROR_CODES.RPC_GENERIC,
    };
  }

  const result = data as unknown as {
    source_order_id: number;
    new_order_id: number;
    new_order_number: string;
    moved_count: number;
    source_subtotal?: number;
    source_total?: number;
    new_subtotal?: number;
    new_total?: number;
    idempotent?: boolean;
  } | null;

  if (!result) {
    return {
      success: false,
      error: "Không thể tách đơn. Vui lòng thử lại.",
      errorCode: POS_ERROR_CODES.RPC_GENERIC,
    };
  }

  return {
    success: true,
    data: {
      source_order_id: result.source_order_id,
      new_order_id: result.new_order_id,
      new_order_number: result.new_order_number,
      moved_count: result.moved_count,
      source_total: Number(result.source_total ?? 0),
      new_total: Number(result.new_total ?? 0),
      ...(result.idempotent ? { idempotent: true } : {}),
    },
  };
}

/* ─── mergeOrders ─── */

const mergeInputSchema = z
  .object({
    sourceOrderId: orderIdSchema,
    targetOrderId: orderIdSchema,
    idempotencyKey: idempotencyKeySchema,
  })
  .refine((d) => d.sourceOrderId !== d.targetOrderId, {
    error: "Không thể gộp một đơn vào chính nó",
    path: ["targetOrderId"],
  });

export async function mergeOrders(
  branchId: number,
  input: {
    sourceOrderId: number;
    targetOrderId: number;
    idempotencyKey?: string;
  },
): Promise<
  ActionResult<{
    source_order_id: number;
    target_order_id: number;
    moved_count: number;
    target_total: number;
    idempotent?: boolean;
  }>
> {
  const parsedBranch = branchIdSchema.safeParse(branchId);
  if (!parsedBranch.success) {
    return {
      success: false,
      error: "Mã chi nhánh không hợp lệ",
      errorCode: POS_ERROR_CODES.INPUT_INVALID_BRANCH,
    };
  }

  const parsed = mergeInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu gộp đơn không hợp lệ",
      errorCode: POS_ERROR_CODES.INPUT_INVALID_MERGE,
    };
  }

  const ctx = await getAuthContextWithPermission(
    POS_ROLES,
    PERMISSION_KEYS.POS_USE,
  );
  if (!ctx) {
    return {
      success: false,
      error: "Không có quyền",
      errorCode: POS_ERROR_CODES.AUTH_NO_PERMISSION,
    };
  }

  const { supabase, claims } = ctx;

  if (!isPosBranchInScope(claims, parsedBranch.data)) {
    return {
      success: false,
      error: "Không có quyền truy cập chi nhánh này",
      errorCode: POS_ERROR_CODES.SCOPE_BRANCH_MISMATCH,
    };
  }

  const { data, error } = await supabase.rpc("merge_orders", {
    p_source_order_id: parsed.data.sourceOrderId,
    p_target_order_id: parsed.data.targetOrderId,
    p_idempotency_key: parsed.data.idempotencyKey ?? undefined,
  });

  if (error) {
    return {
      success: false,
      error: mapDiscountRpcError(error.message),
      errorCode: POS_ERROR_CODES.RPC_GENERIC,
    };
  }

  const result = data as unknown as {
    source_order_id: number;
    target_order_id: number;
    moved_count?: number;
    target_subtotal?: number;
    target_total?: number;
    idempotent?: boolean;
  } | null;

  if (!result) {
    return {
      success: false,
      error: "Không thể gộp đơn. Vui lòng thử lại.",
      errorCode: POS_ERROR_CODES.RPC_GENERIC,
    };
  }

  return {
    success: true,
    data: {
      source_order_id: result.source_order_id,
      target_order_id: result.target_order_id,
      moved_count: result.moved_count ?? 0,
      target_total: Number(result.target_total ?? 0),
      ...(result.idempotent ? { idempotent: true } : {}),
    },
  };
}

/* ─── fetchSiblingOrdersForTable ─── */
//
// Returns orders on the same table that are eligible to merge WITH the
// given excludeOrderId (i.e. active + unpaid + not already merged + not
// the order itself). Used by MergeOrdersSheet to populate the target picker.

const siblingOrdersSchema = z.object({
  branchId: branchIdSchema,
  tableId: z.coerce.number().int().positive({ error: "Bàn không hợp lệ" }),
  excludeOrderId: orderIdSchema,
});

export interface SiblingOrderRow {
  id: number;
  order_number: string;
  total_amount: number;
  item_count: number;
  has_discount: boolean;
  discount_type: "pct" | "vnd" | null;
}

export async function fetchSiblingOrdersForTable(input: {
  branchId: number;
  tableId: number;
  excludeOrderId: number;
}): Promise<ActionResult<SiblingOrderRow[]>> {
  const parsed = siblingOrdersSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const ctx = await getAuthContextWithPermission(
    POS_ROLES,
    PERMISSION_KEYS.POS_USE,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  if (!isPosBranchInScope(claims, parsed.data.branchId)) {
    return { success: false, error: "Không có quyền truy cập chi nhánh này" };
  }

  // Fetch sibling orders + their non-cancelled item count via PostgREST
  // (`order_items(count)` aggregate is FK-driven; filter on the embed
  // restricts what counts).
  const { data, error } = await supabase
    .from("orders")
    .select(
      `
      id,
      order_number,
      total_amount,
      discount_type,
      discount_amount,
      order_discount_amount,
      order_items!inner ( id, status )
      `,
    )
    .eq("tenant_id", claims.tenant_id)
    .eq("branch_id", parsed.data.branchId)
    .eq("table_id", parsed.data.tableId)
    .eq("order_type", "dine_in")
    .neq("id", parsed.data.excludeOrderId)
    .neq("payment_status", "paid")
    .in("status", ["new", "confirmed", "preparing", "ready", "served"])
    .is("merged_into_order_id", null)
    .order("created_at", { ascending: false });

  if (error) {
    return {
      success: false,
      error: messages.pos.multiOrderTablePicker.siblingOrdersLoadFailed,
    };
  }

  const rows = (data ?? [])
    .map((o) => {
      const items = Array.isArray(o.order_items) ? o.order_items : [];
      const activeItemCount = items.filter(
        (it) => it.status !== "cancelled",
      ).length;
      return {
        id: o.id,
        order_number: o.order_number,
        total_amount: Number(o.total_amount ?? 0),
        item_count: activeItemCount,
        has_discount: Number(o.order_discount_amount ?? 0) > 0,
        discount_type: (o.discount_type as "pct" | "vnd" | null) ?? null,
      };
    })
    // Filter out orders whose ONLY items are cancelled (would-be empty).
    .filter((r) => r.item_count > 0);

  return { success: true, data: rows };
}
