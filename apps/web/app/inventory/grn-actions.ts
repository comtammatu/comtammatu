"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { PERMISSION_KEYS, PROCUREMENT_ROLES } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { withAction } from "@/_lib/with-action";
import { getAuthContextWithPermission } from "./_lib/auth";
import { fetchProcurementBranches } from "./_lib/procurement-branches";
import { dispatchNotificationOutbox } from "./notifications-actions";
import { PG_ERR } from "./_lib/constants";
import {
  buildCsv,
  buildXlsx,
  bufferToBase64,
  MAX_ROWS_PER_SHEET,
  parseSpreadsheetFile,
  stringToBase64,
  type SheetDef,
} from "@/_lib/spreadsheet";

const ROLES = PROCUREMENT_ROLES;

function isBranchScopedProcurementRole(role: string) {
  return role === "warehouse_manager" || role === "production_manager";
}

function canAccessProcurementBranch(
  claims: { user_role: string; branch_id: number | null },
  branchId: number,
) {
  return (
    !isBranchScopedProcurementRole(claims.user_role) ||
    claims.branch_id === branchId
  );
}

/* ─── Recent Activity (cross-domain) ─── */

export type RecentActivityItem = {
  id: number;
  type: "po" | "grn" | "invoice";
  code: string;
  supplier: string;
  date: string; // ISO datetime
  status: string;
  total: number | null;
};

export async function fetchRecentActivity(
  branchId?: number,
): Promise<ActionResult<RecentActivityItem[]>> {
  const ctx = await getAuthContextWithPermission(
    ROLES,
    PERMISSION_KEYS.PROCUREMENT_READ,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims } = ctx;

  let poQuery = supabase
    .from("purchase_orders")
    .select(
      "id, po_number, status, ordered_at, suppliers ( name ), purchase_order_items ( line_total )",
    )
    .eq("tenant_id", claims.tenant_id)
    .order("ordered_at", { ascending: false })
    .limit(5);
  let grnQuery = supabase
    .from("goods_received_notes")
    .select(
      "id, grn_number, status, received_date, suppliers ( name ), grn_items ( received_quantity, rejected_quantity, unit_cost )",
    )
    .eq("tenant_id", claims.tenant_id)
    .order("received_date", { ascending: false })
    .limit(5);
  const invQuery = supabase
    .from("supplier_invoices")
    .select(
      "id, invoice_number, matching_status, invoice_date, total_amount, suppliers ( name )",
    )
    .eq("tenant_id", claims.tenant_id)
    .order("invoice_date", { ascending: false })
    .limit(5);

  if (branchId != null) {
    poQuery = poQuery.eq("branch_id", branchId);
    grnQuery = grnQuery.eq("branch_id", branchId);
    // supplier_invoices has no branch_id — left tenant-wide intentionally.
  }

  const [poRes, grnRes, invRes] = await Promise.all([
    poQuery,
    grnQuery,
    invQuery,
  ]);

  if (poRes.error || grnRes.error || invRes.error) {
    return { success: false, error: "Không thể tải hoạt động gần đây." };
  }

  const items: RecentActivityItem[] = [
    ...(poRes.data ?? []).map((po) => {
      const lines =
        (po.purchase_order_items as Array<{
          line_total: number | null;
        }> | null) ?? [];
      const hasAllPrices =
        lines.length > 0 && lines.every((l) => l.line_total != null);
      const total = hasAllPrices
        ? lines.reduce((s, l) => s + Number(l.line_total), 0)
        : null;
      return {
        id: po.id,
        type: "po" as const,
        code: po.po_number,
        supplier:
          (po.suppliers as { name: string } | null)?.name ?? "Không rõ NCC",
        date: po.ordered_at ?? "",
        status: po.status,
        total,
      };
    }),
    ...(grnRes.data ?? []).map((grn) => {
      const lines =
        (grn.grn_items as Array<{
          received_quantity: number | null;
          rejected_quantity: number | null;
          unit_cost: number | null;
        }> | null) ?? [];
      // Tổng giá trị nhập kho = (received − rejected) × unit_cost (số thực vào kho)
      const total =
        lines.length > 0
          ? lines.reduce(
              (s, l) =>
                s +
                (Number(l.received_quantity ?? 0) -
                  Number(l.rejected_quantity ?? 0)) *
                  Number(l.unit_cost ?? 0),
              0,
            )
          : null;
      return {
        id: grn.id,
        type: "grn" as const,
        code: grn.grn_number,
        supplier:
          (grn.suppliers as { name: string } | null)?.name ?? "Không rõ NCC",
        date: grn.received_date ?? "",
        status: grn.status,
        total,
      };
    }),
    ...(invRes.data ?? []).map((inv) => ({
      id: inv.id,
      type: "invoice" as const,
      code: inv.invoice_number,
      supplier:
        (inv.suppliers as { name: string } | null)?.name ?? "Không rõ NCC",
      date: inv.invoice_date ?? "",
      status: inv.matching_status,
      total: inv.total_amount ? Number(inv.total_amount) : null,
    })),
  ];

  items.sort((a, b) => (b.date > a.date ? 1 : -1));

  return { success: true, data: items.slice(0, 5) };
}

/* ─── fetchGrns ─── */

export async function fetchGrns(branchId?: number): Promise<ActionResult> {
  const ctx = await getAuthContextWithPermission(
    ROLES,
    PERMISSION_KEYS.PROCUREMENT_READ,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims } = ctx;
  let query = supabase
    .from("goods_received_notes")
    .select(
      "id, grn_number, status, received_date, notes, supplier_id, branch_id, po_id, suppliers ( id, name ), purchase_orders ( po_number ), grn_items ( received_quantity, rejected_quantity, unit_cost )",
    )
    .eq("tenant_id", claims.tenant_id)
    .order("received_date", { ascending: false });
  if (branchId != null) query = query.eq("branch_id", branchId);
  const { data, error } = await query;
  if (error) return { success: false, error: "Không thể tải phiếu nhập." };
  return { success: true, data: data ?? [] };
}

/* ─── fetchGrnDetail ─── */

export async function fetchGrnDetail(grnId: number): Promise<ActionResult> {
  const id = z.coerce.number().int().positive().safeParse(grnId);
  if (!id.success) return { success: false, error: "ID không hợp lệ" };
  const ctx = await getAuthContextWithPermission(
    ROLES,
    PERMISSION_KEYS.PROCUREMENT_READ,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims } = ctx;
  const { data: grn, error: e1 } = await supabase
    .from("goods_received_notes")
    .select(
      "*, branches ( id, name, branch_kind ), suppliers ( id, name ), purchase_orders ( id, po_number )",
    )
    .eq("id", id.data)
    .eq("tenant_id", claims.tenant_id)
    .single();
  if (e1 || !grn)
    return { success: false, error: "Không tìm thấy phiếu nhập." };
  const { data: lines, error: e2 } = await supabase
    .from("grn_items")
    .select("*, ingredients ( id, name, unit, purchase_unit )")
    .eq("grn_id", id.data)
    .eq("tenant_id", claims.tenant_id);
  if (e2)
    return { success: false, error: "Không thể tải chi tiết phiếu nhập." };
  return { success: true, data: { grn, lines: lines ?? [] } };
}

/* ─── createGrnDraft ─── */

const grnCreateSchema = z.object({
  supplierId: z.coerce.number().int().positive(),
  branchId: z.coerce.number().int().positive(),
  poId: z.coerce.number().int().positive().optional().nullable(),
  notes: z.string().optional(),
});

export const createGrnDraft = withAction(
  {
    roles: ROLES,
    schema: grnCreateSchema,
    permission: PERMISSION_KEYS.PROCUREMENT_GRN_CREATE,
  },
  async (data, { supabase, claims, user }) => {
    const targetBranchId = data.branchId;

    // Branch-scoped roles must match their assigned procurement branch.
    if (!canAccessProcurementBranch(claims, targetBranchId)) {
      return {
        success: false,
        error: "Bạn chỉ được tạo phiếu nhập cho kho của mình.",
      };
    }

    const branches = await fetchProcurementBranches(supabase, claims.tenant_id);
    if (!branches.some((branch) => branch.id === targetBranchId)) {
      return {
        success: false,
        error: "Chi nhánh không hợp lệ (phải là Kho Tổng hoặc Bếp Trung Tâm).",
      };
    }

    const grnNumber = `GRN-${randomUUID().slice(0, 8)}`;
    const { data: row, error } = await supabase
      .from("goods_received_notes")
      .insert({
        tenant_id: claims.tenant_id,
        branch_id: targetBranchId,
        supplier_id: data.supplierId,
        po_id: data.poId ?? null,
        grn_number: grnNumber,
        status: "draft",
        notes: data.notes ?? null,
        created_by: user.id,
      })
      .select("id")
      .single();
    if (error) {
      // UNIQUE_VIOLATION on the partial index uq_grn_active_draft_per_user_supplier
      // (Sprint 6 #3): a draft already exists for this user+supplier. Race-friendly
      // fallback: return the existing draft so the caller can attach lines to it.
      if (error.code === "23505") {
        const { data: existing } = await supabase
          .from("goods_received_notes")
          .select("id")
          .eq("tenant_id", claims.tenant_id)
          .eq("created_by", user.id)
          .eq("supplier_id", data.supplierId)
          .eq("status", "draft")
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (existing?.id) {
          return { success: true, data: { id: existing.id } };
        }
      }
      return { success: false, error: "Không thể tạo phiếu nhập." };
    }
    return { success: true, data: row };
  },
);

/* ─── loadActiveGrnDraft (Sprint 6 #3) ─── */

const loadActiveDraftSchema = z.object({
  supplierId: z.coerce.number().int().positive(),
});

export const loadActiveGrnDraft = withAction(
  {
    roles: ROLES,
    schema: loadActiveDraftSchema,
    permission: PERMISSION_KEYS.PROCUREMENT_GRN_CREATE,
  },
  async (data, { supabase, claims, user }) => {
    // Partial UNIQUE index uq_grn_active_draft_per_user_supplier guarantees
    // at most one row matches; maybeSingle is the safe shape.
    const { data: row, error } = await supabase
      .from("goods_received_notes")
      .select("id, branch_id, po_id, supplier_id, grn_number, notes, updated_at")
      .eq("tenant_id", claims.tenant_id)
      .eq("created_by", user.id)
      .eq("supplier_id", data.supplierId)
      .eq("status", "draft")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      return { success: false, error: "Không thể tải phiếu nhập đang nháp." };
    }
    return { success: true, data: row ?? null };
  },
);

/* ─── discardGrnDraft (Sprint 6 #3) ─── */

const discardDraftSchema = z.object({
  grnId: z.coerce.number().int().positive(),
});

export const discardGrnDraft = withAction(
  {
    roles: ROLES,
    schema: discardDraftSchema,
    permission: PERMISSION_KEYS.PROCUREMENT_GRN_CREATE,
  },
  async (data, { supabase, claims, user }) => {
    // Soft-cancel keeps audit trail; immutable confirmed GRNs are unaffected.
    const { data: row, error } = await supabase
      .from("goods_received_notes")
      .update({ status: "cancelled" })
      .eq("id", data.grnId)
      .eq("tenant_id", claims.tenant_id)
      .eq("created_by", user.id)
      .eq("status", "draft")
      .select("id")
      .maybeSingle();
    if (error) {
      return { success: false, error: "Không thể hủy phiếu nháp." };
    }
    if (!row) {
      // RLS or status guard; surface clearly instead of silent success.
      return {
        success: false,
        error: "Phiếu nháp không tồn tại hoặc đã được xử lý.",
      };
    }
    return { success: true, data: { id: row.id } };
  },
);

/* ─── upsertGrnLine ─── */

const grnLineSchema = z
  .object({
    grnId: z.coerce.number().int().positive(),
    ingredientId: z.coerce.number().int().positive(),
    // Số đã giao (gross delivered). Stock impact = receivedQuantity − rejectedQuantity.
    receivedQuantity: z.coerce.number().min(0),
    unit: z.string().min(1),
    unitCost: z.coerce.number().min(0),
    qualityStatus: z
      .enum(["accepted", "rejected", "partial"])
      .default("accepted"),
    receivingTemperature: z.coerce.number().optional().nullable(),
    batchNumber: z.string().trim().optional().nullable(),
    expiryDate: z.string().date().optional().nullable(),
    // QC fields — rejectedQuantity là subset của receivedQuantity
    rejectedQuantity: z.coerce.number().min(0).optional(),
    rejectionReason: z.string().trim().max(500).optional().nullable(),
    rejectedPhotoUrl: z.string().trim().url().optional().nullable(),
    // Price-variance audit
    priceOverrideNote: z.string().trim().max(500).optional().nullable(),
    priceOverridePhotoUrl: z.string().trim().url().optional().nullable(),
    // Short-delivery handling (set by user when delivered < ordered beyond tolerance)
    shortDeliveryAction: z
      .enum(["accept_and_close", "wait_backorder"])
      .optional()
      .nullable(),
  })
  .refine((d) => (d.rejectedQuantity ?? 0) <= d.receivedQuantity, {
    error: "Số trả NCC không được vượt số đã giao.",
    path: ["rejectedQuantity"],
  });

export const upsertGrnLine = withAction(
  {
    roles: ROLES,
    schema: grnLineSchema,
    permission: PERMISSION_KEYS.PROCUREMENT_GRN_CREATE,
  },
  async (data, { supabase, claims }) => {
    const { data: grn, error: grnError } = await supabase
      .from("goods_received_notes")
      .select("id, status, branch_id")
      .eq("id", data.grnId)
      .eq("tenant_id", claims.tenant_id)
      .single();

    if (grnError || !grn) {
      return { success: false, error: "Không tìm thấy phiếu nhập." };
    }
    if (grn.status !== "draft") {
      return {
        success: false,
        error: "Chỉ chỉnh sửa dòng khi phiếu nhập đang ở trạng thái nháp.",
      };
    }
    if (!canAccessProcurementBranch(claims, grn.branch_id)) {
      return {
        success: false,
        error: "Bạn chỉ được chỉnh sửa phiếu nhập của kho mình.",
      };
    }

    let rejected = data.rejectedQuantity ?? 0;
    // Nếu user đánh dấu "rejected" toàn dòng, auto set rejected = received (số đã giao = số bị từ chối).
    if (data.qualityStatus === "rejected") {
      rejected = data.receivedQuantity;
    }
    if (rejected > 0 && !data.rejectionReason) {
      return {
        success: false,
        error: "Phải nhập lý do khi có hàng từ chối nhập.",
      };
    }

    const totalCost = data.receivedQuantity * data.unitCost;
    const { data: row, error } = await supabase
      .from("grn_items")
      .upsert(
        {
          tenant_id: claims.tenant_id,
          grn_id: data.grnId,
          ingredient_id: data.ingredientId,
          received_quantity: data.receivedQuantity,
          unit: data.unit,
          unit_cost: data.unitCost,
          total_cost: totalCost,
          quality_status: data.qualityStatus,
          receiving_temperature: data.receivingTemperature ?? null,
          batch_number: data.batchNumber ?? null,
          expiry_date: data.expiryDate ?? null,
          rejected_quantity: rejected,
          rejection_reason: data.rejectionReason ?? null,
          rejected_photo_url: data.rejectedPhotoUrl ?? null,
          price_override_note: data.priceOverrideNote ?? null,
          price_override_photo_url: data.priceOverridePhotoUrl ?? null,
          short_delivery_action: data.shortDeliveryAction ?? null,
        },
        { onConflict: "grn_id,ingredient_id,tenant_id" },
      )
      .select("id")
      .single();
    if (error || !row) {
      return { success: false, error: "Không thể lưu dòng phiếu nhập." };
    }
    return { success: true, data: row };
  },
);

/* ─── confirmGrn ─── */

const deleteGrnLineSchema = z.object({
  grnId: z.coerce.number().int().positive(),
  lineId: z.coerce.number().int().positive(),
});

export const deleteGrnLine = withAction(
  {
    roles: ROLES,
    schema: deleteGrnLineSchema,
    permission: PERMISSION_KEYS.PROCUREMENT_GRN_CREATE,
  },
  async (data, { supabase, claims }) => {
    const { data: grn, error: grnError } = await supabase
      .from("goods_received_notes")
      .select("id, status, branch_id")
      .eq("id", data.grnId)
      .eq("tenant_id", claims.tenant_id)
      .single();

    if (grnError || !grn) {
      return { success: false, error: "Không tìm thấy phiếu nhập." };
    }
    if (grn.status !== "draft") {
      return {
        success: false,
        error: "Chỉ xóa dòng khi phiếu nhập đang ở trạng thái nháp.",
      };
    }
    if (!canAccessProcurementBranch(claims, grn.branch_id)) {
      return {
        success: false,
        error: "Bạn chỉ được chỉnh sửa phiếu nhập của kho mình.",
      };
    }

    const { error } = await supabase
      .from("grn_items")
      .delete()
      .eq("id", data.lineId)
      .eq("grn_id", data.grnId)
      .eq("tenant_id", claims.tenant_id);

    if (error) {
      return { success: false, error: "Không thể xóa dòng." };
    }
    return { success: true };
  },
);

export async function confirmGrn(grnId: number): Promise<ActionResult> {
  const id = z.coerce.number().int().positive().safeParse(grnId);
  if (!id.success) return { success: false, error: "ID không hợp lệ" };
  const ctx = await getAuthContextWithPermission(
    ROLES,
    PERMISSION_KEYS.PROCUREMENT_GRN_CONFIRM,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase } = ctx;

  const { data, error } = await supabase.rpc("confirm_goods_receipt_note", {
    p_grn_id: id.data,
  });
  if (error) {
    console.error("confirmGrn", error);
    return { success: false, error: "Không thể xác nhận phiếu nhập." };
  }

  const poId =
    data && typeof data === "object" && !Array.isArray(data)
      ? ((data as { po_id?: number | null }).po_id ?? null)
      : null;
  const reviewCount =
    data && typeof data === "object" && !Array.isArray(data)
      ? ((data as { review_count?: number }).review_count ?? 0)
      : 0;

  revalidatePath("/inventory/grn");
  if (poId) revalidatePath(`/inventory/purchase-orders/${poId}`);

  // Fire-and-forget dispatch when there are review-flagged lines (real-time alert).
  // Errors are swallowed — outbox row remains pending and will be retried on next dispatch.
  if (reviewCount > 0) {
    void dispatchNotificationOutbox().catch((e) => {
      console.error("dispatchNotificationOutbox post-confirmGrn", e);
    });
  }

  return { success: true, data };
}

/* ─── amendGrnLine (Owner force-edit on confirmed GRN) ─── */

const amendGrnLineSchema = z
  .object({
    grnId: z.coerce.number().int().positive(),
    lineId: z.coerce.number().int().positive(),
    receivedQuantity: z.coerce.number().min(0, {
      error: "Số lượng phải >= 0",
    }),
    rejectedQuantity: z.coerce.number().min(0).optional().nullable(),
    unitCost: z.coerce.number().min(0, { error: "Đơn giá phải >= 0" }),
    reason: z
      .string()
      .trim()
      .min(5, { error: "Lý do tối thiểu 5 ký tự" })
      .max(500, { error: "Lý do tối đa 500 ký tự" }),
  })
  .refine(
    (d) =>
      d.rejectedQuantity == null || d.rejectedQuantity <= d.receivedQuantity,
    {
      error: "Số trả NCC không được vượt số đã giao.",
      path: ["rejectedQuantity"],
    },
  );

export const amendGrnLine = withAction(
  {
    roles: ROLES,
    schema: amendGrnLineSchema,
    permission: PERMISSION_KEYS.PROCUREMENT_GRN_AMEND,
  },
  async (data, { supabase }) => {
    const { data: row, error } = await supabase.rpc("amend_grn_line", {
      p_grn_id: data.grnId,
      p_line_id: data.lineId,
      p_received_quantity: data.receivedQuantity,
      p_unit_cost: data.unitCost,
      p_reason: data.reason,
      p_rejected_quantity: data.rejectedQuantity ?? undefined,
    });

    if (error) {
      console.error("amendGrnLine", error);
      // Map known PG error codes to friendly messages.
      const msg = error.message || "";
      if (msg.includes("forbidden_owner_only")) {
        return { success: false, error: "Chỉ Owner được sửa phiếu đã chốt." };
      }
      if (msg.includes("grn_not_confirmed_use_upsert")) {
        return {
          success: false,
          error: "Chỉ áp dụng cho phiếu nhập đã chốt.",
        };
      }
      if (msg.includes("has_active_supplier_return")) {
        return {
          success: false,
          error:
            "Dòng đã có phiếu trả NCC liên kết — không thể sửa trực tiếp.",
        };
      }
      if (msg.includes("has_paid_invoice")) {
        return {
          success: false,
          error:
            "Phiếu đã có hóa đơn NCC đang/đã thanh toán — không thể sửa trực tiếp.",
        };
      }
      if (msg.includes("negative_stock")) {
        return {
          success: false,
          error: "Sửa làm tồn kho âm — không cho phép.",
        };
      }
      if (msg.includes("rejected_exceeds_received")) {
        return {
          success: false,
          error: "Số trả NCC không được vượt số đã giao.",
        };
      }
      if (msg.includes("reason_required_min_5_chars")) {
        return { success: false, error: "Lý do tối thiểu 5 ký tự." };
      }
      if (msg.includes("invalid_amount")) {
        return { success: false, error: "Số lượng/đơn giá không hợp lệ." };
      }
      if (msg.includes("grn_line_not_found")) {
        return { success: false, error: "Không tìm thấy dòng phiếu nhập." };
      }
      return { success: false, error: "Không thể sửa dòng phiếu nhập." };
    }

    revalidatePath("/inventory/grn");
    revalidatePath(`/inventory/grn/${data.grnId}`);
    return { success: true, data: row };
  },
);

/* ─── fetchGrnsForPo ─── */

export interface LinkedGrnRow {
  id: number;
  grn_number: string;
  status: string;
  received_date: string;
}

export async function fetchGrnsForPo(poId: number): Promise<ActionResult> {
  const id = z.coerce.number().int().positive().safeParse(poId);
  if (!id.success) return { success: false, error: "ID không hợp lệ" };
  const ctx = await getAuthContextWithPermission(
    ROLES,
    PERMISSION_KEYS.PROCUREMENT_READ,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims } = ctx;
  const { data, error } = await supabase
    .from("goods_received_notes")
    .select("id, grn_number, status, received_date")
    .eq("po_id", id.data)
    .eq("tenant_id", claims.tenant_id)
    .order("received_date", { ascending: false });
  if (error) return { success: false, error: "Không thể tải phiếu nhập." };
  return { success: true, data: data ?? [] };
}

/* ─── createGrnFromPo ───
 * Sprint 5 #2: collapsed to a single atomic Postgres RPC call.
 * The RPC `create_grn_from_po` (migration 20260508072423) validates PO
 * status, branch eligibility, supplier active, computes remaining qty,
 * locks the PO row FOR UPDATE to serialize concurrent callers, and
 * inserts header + items in one transaction. Any RAISE rolls back
 * atomically — no orphan headers possible.
 */

const PG_ERR_TO_VI: Record<string, string> = {
  insufficient_privilege: "Bạn không có quyền tạo phiếu nhập từ PO này.",
  no_data_found: "PO không tồn tại hoặc đã nhận đủ hàng.",
  check_violation:
    "PO không đủ điều kiện (trạng thái, kho nhận, hoặc NCC không hợp lệ).",
  invalid_parameter_value: "Tham số đầu vào không hợp lệ.",
};

export async function createGrnFromPo(poId: number): Promise<ActionResult> {
  const id = z.coerce.number().int().positive().safeParse(poId);
  if (!id.success) return { success: false, error: "ID không hợp lệ" };
  const ctx = await getAuthContextWithPermission(
    ROLES,
    PERMISSION_KEYS.PROCUREMENT_GRN_CREATE,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase } = ctx;

  const { data, error } = await supabase.rpc("create_grn_from_po", {
    p_po_id: id.data,
  });

  if (error) {
    return {
      success: false,
      error: PG_ERR_TO_VI[error.code ?? ""] ?? "Không thể tạo phiếu nhập.",
    };
  }

  const parsed = z
    .object({
      grn_id: z.coerce.number().int().positive(),
      grn_number: z.string(),
      lines: z.coerce.number().int().min(0),
    })
    .safeParse(data);
  if (!parsed.success) {
    return { success: false, error: "Phản hồi không hợp lệ từ máy chủ." };
  }

  return { success: true, data: { id: parsed.data.grn_id } };
}

/* ─── startGrnFromPo (mobile form-action wrapper) ─── */

export async function startGrnFromPo(formData: FormData): Promise<void> {
  const poIdRaw = formData.get("poId");
  const res = await createGrnFromPo(Number(poIdRaw));
  if (!res.success) {
    redirect(
      `/inventory/grn/new?error=${encodeURIComponent(res.error ?? "Không thể tạo phiếu nhập từ PO.")}`,
    );
  }
  const grn = res.data as { id: number };
  redirect(`/inventory/grn/${grn.id}?review=1`);
}

/* ─── Supplier Invoices ─── */

const invoiceSchema = z.object({
  supplierId: z.coerce.number().int().positive(),
  grnId: z.coerce.number().int().positive().optional().nullable(),
  poId: z.coerce.number().int().positive().optional().nullable(),
  invoiceNumber: z.string().min(1),
  invoiceDate: z.string(),
  subtotal: z.coerce.number().min(0),
  vatRate: z.coerce.number().min(0).default(8),
  vatAmount: z.coerce.number().min(0),
  totalAmount: z.coerce.number().min(0),
  matchingNotes: z.string().optional(),
  dueDate: z.string().optional().nullable(),
});

export const createSupplierInvoice = withAction(
  {
    roles: ROLES,
    schema: invoiceSchema,
    permission: PERMISSION_KEYS.PROCUREMENT_INVOICE_CREATE,
  },
  async (data, { supabase, claims, user }) => {
    // Auto-compute due_date from supplier payment_terms_days if not provided
    let dueDate: string | null = data.dueDate ?? null;
    if (!dueDate) {
      const { data: supplier } = await supabase
        .from("suppliers")
        .select("payment_terms_days")
        .eq("id", data.supplierId)
        .eq("tenant_id", claims.tenant_id)
        .single();
      const termsDays = supplier?.payment_terms_days ?? null;
      if (termsDays && termsDays > 0) {
        const invoiceDt = new Date(data.invoiceDate);
        invoiceDt.setDate(invoiceDt.getDate() + termsDays);
        dueDate = invoiceDt.toISOString().slice(0, 10);
      }
    }

    const { data: row, error } = await supabase
      .from("supplier_invoices")
      .insert({
        tenant_id: claims.tenant_id,
        supplier_id: data.supplierId,
        grn_id: data.grnId ?? null,
        po_id: data.poId ?? null,
        invoice_number: data.invoiceNumber,
        invoice_date: data.invoiceDate,
        subtotal: data.subtotal,
        vat_rate: data.vatRate,
        vat_amount: data.vatAmount,
        total_amount: data.totalAmount,
        matching_notes: data.matchingNotes ?? null,
        created_by: user.id,
        due_date: dueDate,
        payment_status: "unpaid",
      })
      .select("id")
      .single();
    if (error) {
      if (error.code === PG_ERR.UNIQUE_VIOLATION) {
        return {
          success: false,
          error: "Số hóa đơn đã tồn tại cho NCC này.",
        };
      }
      return { success: false, error: "Không thể tạo hóa đơn NCC." };
    }

    // Auto-trigger 3-way matching (non-fatal — invoice creation still succeeds)
    if (row?.id) {
      const { error: matchErr } = await supabase.rpc(
        "recompute_supplier_invoice_matching",
        { p_invoice_id: row.id },
      );
      if (matchErr) {
        console.error(
          "[createSupplierInvoice] auto-matching failed:",
          matchErr.message,
        );
      }
    }

    return { success: true, data: row };
  },
);

export async function fetchSupplierInvoices(
  branchId?: number,
): Promise<ActionResult> {
  const ctx = await getAuthContextWithPermission(
    ROLES,
    PERMISSION_KEYS.PROCUREMENT_READ,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims } = ctx;
  const grnSelect =
    branchId != null
      ? "goods_received_notes!inner ( id, grn_number, branch_id )"
      : "goods_received_notes ( id, grn_number )";
  let query = supabase
    .from("supplier_invoices")
    .select(
      `id, invoice_number, invoice_date, total_amount, matching_status, subtotal, supplier_id, grn_id, due_date, payment_status, paid_amount, paid_at, suppliers ( id, name ), ${grnSelect}`,
    )
    .eq("tenant_id", claims.tenant_id)
    .order("invoice_date", { ascending: false });
  if (branchId != null) {
    query = query.eq("goods_received_notes.branch_id", branchId);
  }
  const { data, error } = await query;
  if (error) return { success: false, error: "Không thể tải hóa đơn NCC." };
  return { success: true, data: data ?? [] };
}

export async function recomputeInvoiceMatching(
  invoiceId: number,
): Promise<ActionResult> {
  const id = z.coerce.number().int().positive().safeParse(invoiceId);
  if (!id.success) return { success: false, error: "ID không hợp lệ" };
  const ctx = await getAuthContextWithPermission(
    ROLES,
    PERMISSION_KEYS.PROCUREMENT_INVOICE_MATCH,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase } = ctx;
  const { data, error } = await supabase.rpc(
    "recompute_supplier_invoice_matching",
    { p_invoice_id: id.data },
  );
  if (error) {
    console.error("recomputeInvoiceMatching", error);
    return { success: false, error: "Không thể tính khớp." };
  }
  return { success: true, data };
}

/* ─── Recipes ─── */

const recipeLineSchema = z.object({
  ingredientId: z.coerce.number().int().positive(),
  quantity: z.coerce.number().positive(),
  unit: z.string().min(1),
  note: z.string().optional().nullable(),
  yieldFactor: z.coerce.number().positive().default(1.0),
});

const recipeBatchSchema = z.object({
  menuItemId: z.coerce.number().int().positive(),
  lines: z.array(recipeLineSchema),
});

export async function fetchRecipes(): Promise<ActionResult> {
  const ctx = await getAuthContextWithPermission(
    ROLES,
    PERMISSION_KEYS.MENU_READ,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims } = ctx;
  const { data, error } = await supabase
    .from("menu_items")
    .select(
      `
      id, name, updated_at,
      menu_categories ( name ),
      recipes (
        ingredient_id, quantity, unit, note, yield_factor,
        ingredients ( id, name, unit, purchase_unit, unit_cost )
      )
    `,
    )
    .eq("tenant_id", claims.tenant_id)
    .eq("is_active", true)
    .order("name");
  if (error) {
    console.error("fetchRecipes", error);
    return { success: false, error: "Không thể tải định mức món bán." };
  }
  return { success: true, data: data ?? [] };
}

export const upsertRecipeLines = withAction(
  {
    roles: ROLES,
    schema: recipeBatchSchema,
    permission: PERMISSION_KEYS.MENU_WRITE,
  },
  async (data, { supabase }) => {
    const { error } = await supabase.rpc("upsert_recipe_lines", {
      p_menu_item_id: data.menuItemId,
      p_lines: data.lines.map((l) => ({
        ingredient_id: l.ingredientId,
        quantity: l.quantity,
        unit: l.unit,
        note: l.note ?? null,
        yield_factor: l.yieldFactor,
      })),
    });
    if (error) {
      console.error("upsertRecipeLines", error);
      return { success: false, error: "Không thể lưu định mức món bán." };
    }
    return { success: true };
  },
);

type RecipeSheetRow = {
  menu_item_id: number | "";
  menu_item_name: string;
  ingredient_id: number | "";
  ingredient_name: string;
  quantity: number | "";
  unit: string;
  yield_factor: number | "";
  note: string;
};

function buildRecipeSheets(rows: RecipeSheetRow[]): SheetDef[] {
  return [
    {
      name: "Dinh muc mon ban",
      columns: [
        { header: "Mã món bán", key: "menu_item_id", width: 14 },
        { header: "Món bán", key: "menu_item_name", width: 32 },
        { header: "Mã nguyên liệu", key: "ingredient_id", width: 14 },
        { header: "Nguyên liệu", key: "ingredient_name", width: 32 },
        { header: "Số lượng", key: "quantity", width: 14 },
        { header: "Đơn vị nhập", key: "unit", width: 14 },
        { header: "Yield", key: "yield_factor", width: 10 },
        { header: "Ghi chú", key: "note", width: 28 },
      ],
      rows,
    },
  ];
}

type ExportRecipesResult =
  | {
      success: true;
      data: { filename: string; base64: string; format: "xlsx" | "csv" };
    }
  | { success: false; error: string };

type RecipeExportMenuRow = {
  id: number;
  name: string;
  recipes: Array<{
    ingredient_id: number | null;
    quantity: number | string | null;
    unit: string | null;
    note: string | null;
    yield_factor: number | string | null;
    ingredients: {
      id: number;
      name: string;
      unit: string;
      purchase_unit: string | null;
    } | null;
  }> | null;
};

export async function exportRecipes(
  format: "xlsx" | "csv" = "xlsx",
): Promise<ExportRecipesResult> {
  const ctx = await getAuthContextWithPermission(
    ROLES,
    PERMISSION_KEYS.MENU_READ,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;
  const { data, error } = await supabase
    .from("menu_items")
    .select(
      `
      id, name,
      recipes (
        ingredient_id, quantity, unit, note, yield_factor,
        ingredients ( id, name, unit, purchase_unit )
      )
    `,
    )
    .eq("tenant_id", claims.tenant_id)
    .eq("is_active", true)
    .order("name");

  if (error) {
    return { success: false, error: "Không thể tải định mức món bán." };
  }

  const rows = ((data ?? []) as RecipeExportMenuRow[])
    .flatMap((menuItem) =>
      (menuItem.recipes ?? []).map((line): RecipeSheetRow => {
        const ingredientId = line.ingredients?.id ?? line.ingredient_id;
        return {
          menu_item_id: menuItem.id,
          menu_item_name: menuItem.name,
          ingredient_id: ingredientId ?? "",
          ingredient_name: line.ingredients?.name ?? "",
          quantity: line.quantity != null ? Number(line.quantity) : "",
          unit:
            line.unit ??
            line.ingredients?.purchase_unit ??
            line.ingredients?.unit ??
            "",
          yield_factor:
            line.yield_factor != null ? Number(line.yield_factor) : 1,
          note: line.note ?? "",
        };
      }),
    )
    .sort((a, b) => {
      const byMenu = a.menu_item_name.localeCompare(b.menu_item_name);
      if (byMenu !== 0) return byMenu;
      return a.ingredient_name.localeCompare(b.ingredient_name);
    });

  const sheets = buildRecipeSheets(rows);
  const stamp = new Date().toISOString().slice(0, 10);
  const safeFormat = format === "csv" ? "csv" : "xlsx";

  if (safeFormat === "csv") {
    const csv = buildCsv(sheets[0]!);
    return {
      success: true,
      data: {
        filename: `dinh-muc-mon-ban-${stamp}.csv`,
        base64: stringToBase64(csv),
        format: "csv",
      },
    };
  }

  const buf = await buildXlsx(sheets);
  return {
    success: true,
    data: {
      filename: `dinh-muc-mon-ban-${stamp}.xlsx`,
      base64: bufferToBase64(buf),
      format: "xlsx",
    },
  };
}

const importRecipeRowSchema = z.object({
  menuItemId: z.number().int().positive(),
  ingredientId: z.number().int().positive(),
  quantity: z.number().positive({ error: "Số lượng phải lớn hơn 0" }),
  unit: z.string().trim().min(1, { error: "Thiếu đơn vị" }),
  yieldFactor: z.number().positive({ error: "Yield phải lớn hơn 0" }),
  note: z.string().trim().optional(),
});

export interface ImportRecipeIssue {
  row: number;
  field?: string;
  message: string;
}

export interface ImportRecipeSummary {
  recipes: number;
  lines: number;
}

type ImportRecipesResult =
  | {
      success: true;
      data: { summary: ImportRecipeSummary };
    }
  | { success: false; error: string; issues?: ImportRecipeIssue[] };

type MenuLookup = { id: number; name: string };
type IngredientLookup = {
  id: number;
  name: string;
  unit: string;
  purchase_unit: string | null;
};

function readCell(raw: Record<string, string>, ...keys: string[]): string {
  for (const key of keys) {
    const value = raw[key];
    if (value != null) return value.trim();
  }
  return "";
}

function normalizeLookupKey(value: string): string {
  return value.trim().toLowerCase();
}

function parseCsvNumber(raw: string): number | null {
  const value = raw.trim();
  if (!value) return null;

  const compact = value.replace(/\s/g, "");
  const parts = compact.split(",");
  const decimalComma =
    parts.length === 2 &&
    parts[1] != null &&
    parts[1].length > 0 &&
    parts[1].length !== 3 &&
    !compact.includes(".");
  const normalized = decimalComma
    ? `${parts[0]}.${parts[1]}`
    : compact.replace(/,/g, "");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function parseOptionalId(raw: string): number | null | undefined {
  if (!raw.trim()) return undefined;
  const n = parseCsvNumber(raw);
  if (n == null || !Number.isInteger(n) || n <= 0) return null;
  return n;
}

function addNameLookup<T extends { name: string }>(
  map: Map<string, T[]>,
  item: T,
) {
  const key = normalizeLookupKey(item.name);
  const existing = map.get(key);
  if (existing) existing.push(item);
  else map.set(key, [item]);
}

function resolveByName<T extends { id: number; name: string }>(
  rowsByName: Map<string, T[]>,
  name: string,
): T | "ambiguous" | null {
  const matches = rowsByName.get(normalizeLookupKey(name)) ?? [];
  if (matches.length === 1) return matches[0]!;
  if (matches.length > 1) return "ambiguous";
  return null;
}

export async function importRecipes(
  formData: FormData,
): Promise<ImportRecipesResult> {
  const ctx = await getAuthContextWithPermission(
    ROLES,
    PERMISSION_KEYS.MENU_WRITE,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { success: false, error: "Thiếu file để import" };
  }

  let parsed;
  try {
    parsed = await parseSpreadsheetFile(file, {
      maxRowsPerSheet: MAX_ROWS_PER_SHEET,
    });
  } catch {
    return { success: false, error: "Không đọc được file định mức món bán." };
  }

  const sheet = parsed.sheets[0];
  if (!sheet || sheet.rows.length === 0) {
    return { success: false, error: "File trống" };
  }

  const { supabase, claims } = ctx;
  const [menuRes, ingredientRes] = await Promise.all([
    supabase
      .from("menu_items")
      .select("id, name")
      .eq("tenant_id", claims.tenant_id),
    supabase
      .from("ingredients")
      .select("id, name, unit, purchase_unit")
      .eq("tenant_id", claims.tenant_id),
  ]);

  if (menuRes.error || ingredientRes.error) {
    return { success: false, error: "Không thể tải dữ liệu đối chiếu." };
  }

  const menus = (menuRes.data ?? []) as MenuLookup[];
  const ingredients = (ingredientRes.data ?? []) as IngredientLookup[];
  const menuById = new Map(menus.map((item) => [item.id, item]));
  const ingredientById = new Map(ingredients.map((item) => [item.id, item]));
  const menuByName = new Map<string, MenuLookup[]>();
  const ingredientByName = new Map<string, IngredientLookup[]>();
  menus.forEach((item) => addNameLookup(menuByName, item));
  ingredients.forEach((item) => addNameLookup(ingredientByName, item));

  const issues: ImportRecipeIssue[] = [];
  const groups = new Map<
    number,
    {
      menuItemName: string;
      lines: Array<{
        ingredientId: number;
        quantity: number;
        unit: string;
        yieldFactor: number;
        note: string | null;
      }>;
    }
  >();
  const seenRecipeIngredient = new Set<string>();

  sheet.rows.forEach((raw, idx) => {
    const rowNumber = idx + 2;
    const menuIdRaw = readCell(
      raw,
      "Mã món bán",
      "Mã thành phẩm",
      "menu_item_id",
    );
    const menuNameRaw = readCell(
      raw,
      "Món bán",
      "Thành phẩm",
      "menu_item_name",
    );
    const ingredientIdRaw = readCell(raw, "Mã nguyên liệu", "ingredient_id");
    const ingredientNameRaw = readCell(raw, "Nguyên liệu", "ingredient_name");

    const menuId = parseOptionalId(menuIdRaw);
    if (menuId === null) {
      issues.push({
        row: rowNumber,
        field: "Mã món bán",
        message: "Mã món bán không hợp lệ.",
      });
      return;
    }

    const ingredientId = parseOptionalId(ingredientIdRaw);
    if (ingredientId === null) {
      issues.push({
        row: rowNumber,
        field: "Mã nguyên liệu",
        message: "Mã nguyên liệu không hợp lệ.",
      });
      return;
    }

    let menuItem = menuId ? (menuById.get(menuId) ?? null) : null;
    if (!menuItem && menuNameRaw) {
      const resolved = resolveByName(menuByName, menuNameRaw);
      if (resolved === "ambiguous") {
        issues.push({
          row: rowNumber,
          field: "Món bán",
          message: "Tên món bán bị trùng. Vui lòng dùng Mã món bán.",
        });
        return;
      }
      menuItem = resolved;
    }
    if (!menuItem) {
      issues.push({
        row: rowNumber,
        field: "Món bán",
        message: "Không tìm thấy món bán trong menu.",
      });
      return;
    }

    let ingredient = ingredientId
      ? (ingredientById.get(ingredientId) ?? null)
      : null;
    if (!ingredient && ingredientNameRaw) {
      const resolved = resolveByName(ingredientByName, ingredientNameRaw);
      if (resolved === "ambiguous") {
        issues.push({
          row: rowNumber,
          field: "Nguyên liệu",
          message: "Tên nguyên liệu bị trùng. Vui lòng dùng Mã nguyên liệu.",
        });
        return;
      }
      ingredient = resolved;
    }
    if (!ingredient) {
      issues.push({
        row: rowNumber,
        field: "Nguyên liệu",
        message: "Không tìm thấy nguyên liệu trong danh mục.",
      });
      return;
    }

    const duplicateKey = `${menuItem.id}:${ingredient.id}`;
    if (seenRecipeIngredient.has(duplicateKey)) {
      issues.push({
        row: rowNumber,
        field: "Nguyên liệu",
        message: "Nguyên liệu bị trùng trong cùng một định mức món bán.",
      });
      return;
    }
    seenRecipeIngredient.add(duplicateKey);

    const quantityRaw = readCell(raw, "Số lượng", "quantity");
    const quantity = parseCsvNumber(quantityRaw);
    if (quantity == null) {
      issues.push({
        row: rowNumber,
        field: "Số lượng",
        message: "Số lượng không hợp lệ.",
      });
      return;
    }

    const yieldRaw = readCell(raw, "Yield", "yield_factor");
    const yieldFactor = yieldRaw ? parseCsvNumber(yieldRaw) : 1;
    if (yieldFactor == null) {
      issues.push({
        row: rowNumber,
        field: "Yield",
        message: "Yield không hợp lệ.",
      });
      return;
    }

    const warehouseUnit = ingredient.purchase_unit || ingredient.unit;
    const importedUnit = readCell(raw, "Đơn vị nhập", "Đơn vị", "unit");
    if (importedUnit && importedUnit !== warehouseUnit) {
      issues.push({
        row: rowNumber,
        field: "Đơn vị",
        message:
          "Đơn vị món bán phải khớp Đơn vị nhập trong danh mục nguyên liệu.",
      });
      return;
    }
    const unit = warehouseUnit;
    const parsedRow = importRecipeRowSchema.safeParse({
      menuItemId: menuItem.id,
      ingredientId: ingredient.id,
      quantity,
      unit,
      yieldFactor,
      note: readCell(raw, "Ghi chú", "note") || undefined,
    });

    if (!parsedRow.success) {
      issues.push({
        row: rowNumber,
        field: parsedRow.error.issues[0]?.path.join("."),
        message: parsedRow.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
      });
      return;
    }

    const group = groups.get(parsedRow.data.menuItemId) ?? {
      menuItemName: menuItem.name,
      lines: [],
    };
    group.lines.push({
      ingredientId: parsedRow.data.ingredientId,
      quantity: parsedRow.data.quantity,
      unit: parsedRow.data.unit.trim(),
      yieldFactor: parsedRow.data.yieldFactor,
      note: parsedRow.data.note?.trim() ? parsedRow.data.note.trim() : null,
    });
    groups.set(parsedRow.data.menuItemId, group);
  });

  if (issues.length > 0) {
    return {
      success: false,
      error: `Có ${issues.length} dòng lỗi. Vui lòng sửa và thử lại.`,
      issues,
    };
  }

  if (groups.size === 0) {
    return { success: false, error: "Không có dòng hợp lệ nào để import" };
  }

  let lineCount = 0;
  for (const [menuItemId, group] of groups) {
    lineCount += group.lines.length;
    const { error } = await supabase.rpc("upsert_recipe_lines", {
      p_menu_item_id: menuItemId,
      p_lines: group.lines.map((line) => ({
        ingredient_id: line.ingredientId,
        quantity: line.quantity,
        unit: line.unit,
        note: line.note,
        yield_factor: line.yieldFactor,
      })),
    });

    if (error) {
      return {
        success: false,
        error: `Không thể import định mức món bán "${group.menuItemName}".`,
      };
    }
  }

  revalidatePath("/inventory/recipes");
  return {
    success: true,
    data: { summary: { recipes: groups.size, lines: lineCount } },
  };
}

export async function downloadRecipeTemplate(): Promise<
  ActionResult<{ filename: string; base64: string; format: "xlsx" }>
> {
  const ctx = await getAuthContextWithPermission(
    ROLES,
    PERMISSION_KEYS.MENU_WRITE,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const sheets = buildRecipeSheets([
    {
      menu_item_id: "",
      menu_item_name: "Cơm tấm sườn (ví dụ)",
      ingredient_id: "",
      ingredient_name: "Sườn cốt lết (ví dụ)",
      quantity: 0.18,
      unit: "kg",
      yield_factor: 0.9,
      note: "Hao hụt sơ chế 10%",
    },
  ]);

  const buf = await buildXlsx(sheets);
  return {
    success: true,
    data: {
      filename: "dinh-muc-mon-ban-template.xlsx",
      base64: bufferToBase64(buf),
      format: "xlsx",
    },
  };
}

export async function fetchMenuItemsForRecipes(): Promise<ActionResult> {
  const ctx = await getAuthContextWithPermission(
    ROLES,
    PERMISSION_KEYS.MENU_READ,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims } = ctx;
  const { data, error } = await supabase
    .from("menu_items")
    .select("id, name, is_active")
    .eq("tenant_id", claims.tenant_id)
    .order("name");
  if (error) return { success: false, error: "Không thể tải món." };
  return { success: true, data: data ?? [] };
}
