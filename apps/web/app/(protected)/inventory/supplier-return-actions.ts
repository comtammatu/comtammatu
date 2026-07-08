"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  PERMISSION_KEYS,
  SUPPLIER_RETURN_ROLES,
} from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { messages } from "@lib/messages";
import { getAuthContextWithPermission } from "./_lib/auth";
import { PG_ERR } from "./_lib/constants";
import { getEmbeddedIngredientBaseUnitDisplayName } from "./_lib/unit-display";

const ROLES = SUPPLIER_RETURN_ROLES;

/** Maps RAISE EXCEPTION tokens from the supplier-return RPCs to operator copy. */
const RPC_ERROR_VI: Record<string, string> = {
  not_authenticated: "Phiên đăng nhập đã hết hạn.",
  forbidden: "Không có quyền thực hiện thao tác này.",
  grn_not_found: "Không tìm thấy phiếu nhập.",
  branch_not_found: "Không tìm thấy chi nhánh.",
  ingredient_not_found: "Không tìm thấy nguyên liệu.",
  return_not_found: "Không tìm thấy phiếu trả hàng.",
  no_rejected_lines: "Phiếu nhập không có dòng bị từ chối để trả NCC.",
  no_lines: "Cần ít nhất một dòng hàng.",
  invalid_line: "Dòng hàng không hợp lệ.",
  invalid_resolution: "Cách xử lý không hợp lệ.",
  invalid_reason: "Lý do không hợp lệ.",
  invalid_target_status: "Trạng thái chuyển tiếp không hợp lệ.",
  return_not_draft: "Chỉ xác nhận được phiếu đang ở trạng thái nháp.",
  insufficient_stock_for_return: "Tồn kho không đủ để trả hàng.",
  no_default_location_for_branch: "Chi nhánh chưa có kho nhận mặc định.",
  cannot_cancel_after_credit: "Không thể hủy phiếu sau khi đã ghi có/hoàn tiền.",
  must_be_sent_before_credit: "Phiếu phải ở trạng thái đã gửi trước khi ghi có.",
  resolution_mismatch_credit: "Cách xử lý không phải ghi có.",
  resolution_mismatch_refund: "Cách xử lý không phải hoàn tiền.",
  supplier_return_duplicate_grn:
    messages.inventory.supplierReturns.create.duplicateGrn,
  active_supplier_return_duplicate_grn:
    messages.inventory.supplierReturns.create.duplicateGrn,
  uq_supplier_returns_active_grn:
    messages.inventory.supplierReturns.create.duplicateGrn,
};

function mapRpcError(message: string | undefined, fallback: string): string {
  if (!message) return fallback;
  for (const [token, vi] of Object.entries(RPC_ERROR_VI)) {
    if (message.includes(token)) return vi;
  }
  return fallback;
}

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
    .order("created_at", { ascending: false })
    .limit(50);

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
    .select(
      "*, ingredients ( id, name, ingredient_units!ingredient_units_ingredient_tenant_fkey(is_base, units!ingredient_units_unit_tenant_fkey(code, name)) )",
    )
    .eq("return_id", id.data)
    .eq("tenant_id", claims.tenant_id)
    .order("id");
  if (linesErr) {
    return { success: false, error: "Không thể tải dòng phiếu trả hàng." };
  }

  const normalizedLines = (lines ?? []).map((line) => {
    const ingredient = line.ingredients as {
      id: number;
      name: string;
    } | null;
    const unit = getEmbeddedIngredientBaseUnitDisplayName(line.ingredients) ?? "";
    return {
      ...line,
      unit,
      ingredients: ingredient
        ? {
            id: ingredient.id,
            name: ingredient.name,
            unit,
          }
        : null,
    };
  });

  return { success: true, data: { header, lines: normalizedLines } };
}

/* ─── fetchReturnableGrns (from-GRN picker source) ───
 * GRNs that carry at least one rejected line — the only ones
 * `create_supplier_return_from_grn` will accept (it raises `no_rejected_lines`
 * otherwise). Line detection mirrors the RPC copy predicate:
 * `quality_status = 'rejected' OR rejected_quantity > 0`.
 */

export type ReturnableGrnRow = {
  id: number;
  grn_number: string;
  received_date: string | null;
  branch_id: number;
  supplier_id: number;
  supplier_name: string;
  rejected_lines: number;
};

export async function fetchReturnableGrns(
  branchId?: number,
): Promise<ActionResult<ReturnableGrnRow[]>> {
  const ctx = await getAuthContextWithPermission(
    ROLES,
    PERMISSION_KEYS.SUPPLIER_RETURN_CREATE,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims } = ctx;

  let query = supabase
    .from("goods_received_notes")
    .select(
      "id, grn_number, received_date, branch_id, supplier_id, suppliers ( name ), grn_items ( quality_status, rejected_quantity )",
    )
    .eq("tenant_id", claims.tenant_id)
    .order("received_date", { ascending: false })
    .limit(100);

  if (branchId != null) query = query.eq("branch_id", branchId);

  const { data, error } = await query;
  if (error) {
    return { success: false, error: "Không thể tải phiếu nhập." };
  }

  const rows: ReturnableGrnRow[] = [];
  for (const grn of data ?? []) {
    const items =
      (grn.grn_items as Array<{
        quality_status: string | null;
        rejected_quantity: number | null;
      }> | null) ?? [];
    const rejected = items.filter(
      (i) =>
        i.quality_status === "rejected" || Number(i.rejected_quantity ?? 0) > 0,
    ).length;
    if (rejected === 0) continue;
    rows.push({
      id: grn.id,
      grn_number: grn.grn_number,
      received_date: grn.received_date,
      branch_id: grn.branch_id,
      supplier_id: grn.supplier_id,
      supplier_name:
        (grn.suppliers as { name: string } | null)?.name ?? "Không rõ NCC",
      rejected_lines: rejected,
    });
  }
  return { success: true, data: rows };
}

/* ─── createSupplierReturnFromGrn ───
 * RPC `create_supplier_return_from_grn` auto-copies rejected GRN lines into a
 * draft supplier_return (source=grn_reject). Gate: supplier_return:create.
 */

const createFromGrnSchema = z.object({
  grnId: z.coerce.number().int().positive(),
  resolution: z.enum(["replacement", "credit_note", "cash_refund"]),
  reason: z.enum([
    "damaged",
    "wrong_item",
    "expired",
    "quality_fail",
    "short_delivery_credit",
    "other",
  ]),
  notes: z.string().trim().max(500).optional(),
});

export async function createSupplierReturnFromGrn(
  input: z.infer<typeof createFromGrnSchema>,
): Promise<ActionResult<{ id: number }>> {
  const parsed = createFromGrnSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }
  const ctx = await getAuthContextWithPermission(
    ROLES,
    PERMISSION_KEYS.SUPPLIER_RETURN_CREATE,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims } = ctx;

  // Pre-check keeps the common duplicate path friendly; the RPC/index enforce
  // the invariant for concurrent submits and direct RPC calls.
  const { data: existing } = await supabase
    .from("supplier_returns")
    .select("id")
    .eq("tenant_id", claims.tenant_id)
    .eq("grn_id", parsed.data.grnId)
    .neq("status", "cancelled")
    .limit(1)
    .maybeSingle();
  if (existing) {
    return {
      success: false,
      error: messages.inventory.supplierReturns.create.duplicateGrn,
    };
  }

  const { data, error } = await supabase.rpc("create_supplier_return_from_grn", {
    p_grn_id: parsed.data.grnId,
    p_resolution: parsed.data.resolution,
    p_reason: parsed.data.reason,
    p_notes: parsed.data.notes ?? undefined,
  });
  if (error) {
    if (error.code === PG_ERR.UNIQUE_VIOLATION) {
      return {
        success: false,
        error: messages.inventory.supplierReturns.create.duplicateGrn,
      };
    }
    return {
      success: false,
      error: mapRpcError(error.message, "Không thể tạo phiếu trả hàng."),
    };
  }

  const result = z
    .object({ return_id: z.coerce.number().int().positive() })
    .safeParse(data);
  if (!result.success) {
    return { success: false, error: "Phản hồi không hợp lệ từ máy chủ." };
  }

  revalidatePath("/inventory/supplier-returns");
  return { success: true, data: { id: result.data.return_id } };
}

/* ─── confirmSupplierReturn (draft → sent) ───
 * RPC `confirm_supplier_return`. For source=post_receipt it decrements stock
 * atomically. Gate: supplier_return:confirm (enforced inside the RPC).
 */

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
    return {
      success: false,
      error: mapRpcError(error.message, "Không thể xác nhận phiếu trả hàng."),
    };
  }

  revalidatePath("/inventory/supplier-returns");
  revalidatePath(`/inventory/supplier-returns/${id.data}`);
  return { success: true, data };
}

/* ─── transitionSupplierReturn (sent → credited|refunded|cancelled) ───
 * RPC `transition_supplier_return`. Auto-creates a supplier_credit_note for
 * credited/refunded. Gate: supplier_return:confirm (enforced inside the RPC).
 */

const transitionSchema = z.object({
  returnId: z.coerce.number().int().positive(),
  targetStatus: z.enum(["credited", "refunded", "cancelled"]),
  notes: z.string().trim().max(500).optional(),
});

export async function transitionSupplierReturn(
  input: z.infer<typeof transitionSchema>,
): Promise<ActionResult> {
  const parsed = transitionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }
  const ctx = await getAuthContextWithPermission(
    ROLES,
    PERMISSION_KEYS.SUPPLIER_RETURN_CONFIRM,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase } = ctx;

  const { data, error } = await supabase.rpc("transition_supplier_return", {
    p_return_id: parsed.data.returnId,
    p_target_status: parsed.data.targetStatus,
    p_notes: parsed.data.notes ?? undefined,
  });
  if (error) {
    return {
      success: false,
      error: mapRpcError(error.message, "Không thể cập nhật phiếu trả hàng."),
    };
  }

  revalidatePath("/inventory/supplier-returns");
  revalidatePath(`/inventory/supplier-returns/${parsed.data.returnId}`);
  return { success: true, data };
}
