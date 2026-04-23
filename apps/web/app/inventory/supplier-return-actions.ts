"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PERMISSION_KEYS, SUPPLIER_RETURN_ROLES } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { withAction } from "@/_lib/with-action";
import { getAuthContextWithPermission } from "./_lib/auth";

const ROLES = SUPPLIER_RETURN_ROLES;

const RESOLUTIONS = ["replacement", "credit_note", "cash_refund"] as const;
const REASONS = [
  "damaged",
  "wrong_item",
  "expired",
  "quality_fail",
  "short_delivery_credit",
  "other",
] as const;

/* ─── fetchSupplierReturns ─── */

export async function fetchSupplierReturns(
  branchId?: number,
): Promise<ActionResult> {
  const ctx = await getAuthContextWithPermission(
    ROLES,
    PERMISSION_KEYS.SUPPLIER_RETURN_READ,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims } = ctx;

  let query = supabase
    .from("supplier_returns")
    .select(
      "id, return_number, status, source, reason, resolution, total_value, created_at, confirmed_at, branch_id, supplier_id, grn_id, suppliers ( id, name ), branches ( id, name ), goods_received_notes ( id, grn_number )",
    )
    .eq("tenant_id", claims.tenant_id)
    .order("created_at", { ascending: false });

  if (branchId != null) query = query.eq("branch_id", branchId);

  const { data, error } = await query;

  if (error) {
    return { success: false, error: "Không thể tải phiếu trả hàng NCC." };
  }
  return { success: true, data: data ?? [] };
}

/* ─── fetchSupplierReturnDetail ─── */

export async function fetchSupplierReturnDetail(
  returnId: number,
): Promise<ActionResult> {
  const id = z.coerce.number().int().positive().safeParse(returnId);
  if (!id.success) return { success: false, error: "ID không hợp lệ" };

  const ctx = await getAuthContextWithPermission(
    ROLES,
    PERMISSION_KEYS.SUPPLIER_RETURN_READ,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims } = ctx;

  const { data: header, error: headerErr } = await supabase
    .from("supplier_returns")
    .select(
      "*, suppliers ( id, name ), branches ( id, name ), goods_received_notes ( id, grn_number )",
    )
    .eq("id", id.data)
    .eq("tenant_id", claims.tenant_id)
    .single();
  if (headerErr || !header) {
    return { success: false, error: "Không tìm thấy phiếu trả hàng." };
  }

  const { data: lines, error: linesErr } = await supabase
    .from("supplier_return_items")
    .select("*, ingredients ( id, name, unit )")
    .eq("return_id", id.data)
    .eq("tenant_id", claims.tenant_id)
    .order("id");
  if (linesErr) {
    return { success: false, error: "Không thể tải dòng phiếu trả hàng." };
  }

  return { success: true, data: { header, lines: lines ?? [] } };
}

/* ─── createSupplierReturnFromGrn ─── */

const fromGrnSchema = z.object({
  grnId: z.coerce.number().int().positive(),
  resolution: z.enum(RESOLUTIONS).default("replacement"),
  reason: z.enum(REASONS).default("damaged"),
  notes: z.string().trim().max(1000).optional().nullable(),
});

export const createSupplierReturnFromGrn = withAction(
  {
    roles: ROLES,
    schema: fromGrnSchema,
    permission: PERMISSION_KEYS.SUPPLIER_RETURN_CREATE,
  },
  async (data, { supabase }) => {
    const { data: result, error } = await supabase.rpc(
      "create_supplier_return_from_grn",
      {
        p_grn_id: data.grnId,
        p_resolution: data.resolution,
        p_reason: data.reason,
        ...(data.notes ? { p_notes: data.notes } : {}),
      },
    );
    if (error) {
      console.error("createSupplierReturnFromGrn", error);
      const message = mapReturnRpcError(error.message);
      return { success: false, error: message };
    }
    revalidatePath("/inventory/supplier-returns");
    revalidatePath(`/inventory/grn/${data.grnId}`);
    return { success: true, data: result };
  },
);

/* ─── createSupplierReturnFromStock ─── */

const fromStockLineSchema = z.object({
  ingredientId: z.coerce.number().int().positive(),
  quantity: z.coerce.number().positive(),
  unitCost: z.coerce.number().min(0),
  reasonDetail: z.string().trim().max(500).optional().nullable(),
  photoUrl: z.string().trim().url().optional().nullable(),
});

const fromStockSchema = z.object({
  branchId: z.coerce.number().int().positive(),
  supplierId: z.coerce.number().int().positive(),
  resolution: z.enum(RESOLUTIONS).default("replacement"),
  reason: z.enum(REASONS).default("damaged"),
  notes: z.string().trim().max(1000).optional().nullable(),
  lines: z.array(fromStockLineSchema).min(1, {
    error: "Phải có ít nhất 1 dòng để trả NCC.",
  }),
});

export const createSupplierReturnFromStock = withAction(
  {
    roles: ROLES,
    schema: fromStockSchema,
    permission: PERMISSION_KEYS.SUPPLIER_RETURN_CREATE,
  },
  async (data, { supabase }) => {
    const { data: result, error } = await supabase.rpc(
      "create_supplier_return_from_stock",
      {
        p_branch_id: data.branchId,
        p_supplier_id: data.supplierId,
        p_resolution: data.resolution,
        p_reason: data.reason,
        p_notes: data.notes ?? "",
        p_lines: data.lines.map((l) => ({
          ingredient_id: l.ingredientId,
          quantity: l.quantity,
          unit_cost: l.unitCost,
          reason_detail: l.reasonDetail ?? null,
          photo_url: l.photoUrl ?? null,
        })),
      },
    );
    if (error) {
      console.error("createSupplierReturnFromStock", error);
      return { success: false, error: mapReturnRpcError(error.message) };
    }
    revalidatePath("/inventory/supplier-returns");
    return { success: true, data: result };
  },
);

/* ─── confirmSupplierReturn ─── */

export async function confirmSupplierReturn(
  returnId: number,
): Promise<ActionResult> {
  const id = z.coerce.number().int().positive().safeParse(returnId);
  if (!id.success) return { success: false, error: "ID không hợp lệ" };

  const ctx = await getAuthContextWithPermission(
    ROLES,
    PERMISSION_KEYS.SUPPLIER_RETURN_CONFIRM,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase } = ctx;

  const { data, error } = await supabase.rpc("confirm_supplier_return", {
    p_return_id: id.data,
  });
  if (error) {
    console.error("confirmSupplierReturn", error);
    return { success: false, error: mapReturnRpcError(error.message) };
  }
  revalidatePath("/inventory/supplier-returns");
  revalidatePath(`/inventory/supplier-returns/${id.data}`);
  return { success: true, data };
}

/* ─── transitionSupplierReturn (sent → credited / refunded / cancelled) ─── */

const transitionSchema = z.object({
  returnId: z.coerce.number().int().positive(),
  targetStatus: z.enum(["credited", "refunded", "cancelled"]),
  notes: z.string().trim().max(1000).optional().nullable(),
});

export const transitionSupplierReturn = withAction(
  {
    roles: ROLES,
    schema: transitionSchema,
    permission: PERMISSION_KEYS.SUPPLIER_RETURN_CONFIRM,
  },
  async (data, { supabase }) => {
    const { data: result, error } = await supabase.rpc(
      "transition_supplier_return",
      {
        p_return_id: data.returnId,
        p_target_status: data.targetStatus,
        ...(data.notes ? { p_notes: data.notes } : {}),
      },
    );
    if (error) {
      console.error("transitionSupplierReturn", error);
      return { success: false, error: mapTransitionError(error.message) };
    }
    revalidatePath("/inventory/supplier-returns");
    revalidatePath(`/inventory/supplier-returns/${data.returnId}`);
    return { success: true, data: result };
  },
);

function mapTransitionError(raw: string | undefined): string {
  if (!raw) return "Không thể chuyển trạng thái phiếu trả.";
  if (raw.includes("forbidden")) return "Không có quyền thực hiện thao tác này.";
  if (raw.includes("cannot_cancel_after_credit"))
    return "Không thể hủy phiếu đã ghi credit / hoàn tiền.";
  if (raw.includes("must_be_sent_before_credit"))
    return "Phải xác nhận gửi NCC trước khi ghi credit / hoàn tiền.";
  if (raw.includes("resolution_mismatch_credit"))
    return "Phiếu này không phải credit_note — không thể chuyển sang đã credit.";
  if (raw.includes("resolution_mismatch_refund"))
    return "Phiếu này không phải cash_refund — không thể chuyển sang đã hoàn tiền.";
  if (raw.includes("invalid_target_status"))
    return "Trạng thái đích không hợp lệ.";
  if (raw.includes("return_not_found")) return "Không tìm thấy phiếu trả.";
  return "Không thể chuyển trạng thái phiếu trả.";
}

/* ─── Error mapping ─── */

function mapReturnRpcError(raw: string | undefined): string {
  if (!raw) return "Không thể xử lý phiếu trả hàng NCC.";
  if (raw.includes("forbidden")) return "Không có quyền thực hiện thao tác này.";
  if (raw.includes("no_rejected_lines"))
    return "GRN không có dòng nào bị từ chối — không thể tạo phiếu trả.";
  if (raw.includes("return_not_draft"))
    return "Phiếu trả hàng đã được xác nhận trước đó.";
  if (raw.includes("insufficient_stock_for_return"))
    return "Tồn kho không đủ để trả số lượng yêu cầu.";
  if (raw.includes("invalid_resolution") || raw.includes("invalid_reason"))
    return "Lý do hoặc cách xử lý không hợp lệ.";
  if (raw.includes("ingredient_not_found"))
    return "Không tìm thấy nguyên liệu.";
  if (raw.includes("no_lines")) return "Phải có ít nhất 1 dòng trong phiếu trả.";
  return "Không thể xử lý phiếu trả hàng NCC.";
}
