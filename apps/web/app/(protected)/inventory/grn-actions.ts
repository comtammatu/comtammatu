"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { JwtClaims } from "@comtammatu/shared/auth";
import {
  PERMISSION_KEYS,
  PROCUREMENT_ROLES,
  isBranchScopedProcurementRole,
  isProcurementBranchInScope,
} from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { withAction } from "@/_lib/with-action";
import { resolveCentralSiteHomeBranchId } from "@/_lib/branch-hub-device";
import { getAuthContextWithPermission } from "./_lib/auth";
import { resolveEntryUnitCode } from "./_lib/entry-unit-code";
import { fetchProcurementBranches } from "./_lib/procurement-branches";
import { dispatchNotificationOutbox } from "./notifications-actions";

const ROLES = PROCUREMENT_ROLES;

/**
 * Cross-branch guard (D068 §Conflicts-resolved 3). `branch_manager` is a
 * branch-scoped procurement role (its claims carry a non-null `branch_id`), so
 * `canAccessProcurementBranch` enforces strict `effectiveBranchId === branchId`
 * — branch A cannot write a GRN for branch B. Central-site operators
 * (warehouse_manager, production_manager) carry `branch_id` null in claims
 * (D055 §1); their operable site is the central branch matching their role
 * kind, so compare against that resolved home — not the null claim — so they
 * can write GRNs for their own Kho Tổng / Bếp Trung Tâm.
 */
async function canAccessProcurementBranch(
  supabase: Parameters<typeof resolveCentralSiteHomeBranchId>[0],
  claims: JwtClaims,
  branchId: number,
): Promise<boolean> {
  if (!isBranchScopedProcurementRole(claims.user_role)) return true;
  const effectiveBranchId =
    claims.branch_id ??
    (await resolveCentralSiteHomeBranchId(supabase, claims));
  return isProcurementBranchInScope(
    claims.user_role,
    effectiveBranchId,
    branchId,
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
      // Total received value = (received − rejected) × unit_cost (net into stock)
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
      "id, grn_number, status, received_date, notes, supplier_id, branch_id, po_id, branches ( id, name ), suppliers ( id, name ), purchase_orders ( po_number ), grn_items ( received_quantity, rejected_quantity, unit_cost )",
    )
    .eq("tenant_id", claims.tenant_id)
    .order("received_date", { ascending: false })
    .limit(100);
  if (branchId != null) query = query.eq("branch_id", branchId);
  const { data, error } = await query;
  if (error) return { success: false, error: "Không thể tải phiếu nhập." };
  return { success: true, data: data ?? [] };
}

/* ─── fetchGrnIdsForDropdown ─── */

export async function fetchGrnIdsForDropdown(
  branchId?: number,
): Promise<ActionResult> {
  const ctx = await getAuthContextWithPermission(
    ROLES,
    PERMISSION_KEYS.PROCUREMENT_READ,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims } = ctx;
  let query = supabase
    .from("goods_received_notes")
    .select("id, grn_number, supplier_id, suppliers ( id, name )")
    .eq("tenant_id", claims.tenant_id)
    .order("received_date", { ascending: false })
    .limit(100);
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
  const { data: invoice } = await supabase
    .from("supplier_invoices")
    .select("id")
    .eq("grn_id", id.data)
    .eq("tenant_id", claims.tenant_id)
    .maybeSingle();
  return {
    success: true,
    data: { grn, lines: lines ?? [], invoiceId: invoice?.id ?? null },
  };
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
    if (!(await canAccessProcurementBranch(supabase, claims, targetBranchId))) {
      return {
        success: false,
        error: "Bạn chỉ được tạo phiếu nhập cho kho của mình.",
      };
    }

    const branches = await fetchProcurementBranches(supabase, claims.tenant_id);
    if (!branches.some((branch) => branch.id === targetBranchId)) {
      return {
        success: false,
        error: "Chi nhánh không hợp lệ.",
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
      .select(
        "id, branch_id, po_id, supplier_id, grn_number, notes, updated_at",
      )
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

/* ─── listMyGrnDrafts (Sprint 6 #3) ─── */

export async function listMyGrnDrafts(
  branchId?: number,
): Promise<ActionResult> {
  const ctx = await getAuthContextWithPermission(
    ROLES,
    PERMISSION_KEYS.PROCUREMENT_GRN_CREATE,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims, user } = ctx;
  let query = supabase
    .from("goods_received_notes")
    .select(
      "id, supplier_id, branch_id, grn_number, updated_at, branches ( id, name ), suppliers ( id, name ), grn_items ( id )",
    )
    .eq("tenant_id", claims.tenant_id)
    .eq("created_by", user.id)
    .eq("status", "draft");
  // Branch-scope drafts on the operator plane so a multi-branch user does not
  // see (and Continue into) another branch's draft; office (branchId omitted)
  // keeps the cross-branch view.
  if (branchId != null) query = query.eq("branch_id", branchId);
  const { data, error } = await query.order("updated_at", {
    ascending: false,
  });
  if (error) {
    return { success: false, error: "Không thể tải danh sách phiếu nháp." };
  }
  return { success: true, data: data ?? [] };
}

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
    // "Số đã giao" (gross delivered). Stock impact = receivedQuantity − rejectedQuantity.
    receivedQuantity: z.coerce.number().min(0),
    // Purchase-role unit the qty was entered in. NULL = already base.
    entryUnitId: z.coerce.number().int().positive().nullable().optional(),
    unitCost: z.coerce.number().min(0),
    qualityStatus: z
      .enum(["accepted", "rejected", "partial"])
      .default("accepted"),
    receivingTemperature: z.coerce.number().optional().nullable(),
    // QC fields — rejectedQuantity is a subset of receivedQuantity
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
    if (!(await canAccessProcurementBranch(supabase, claims, grn.branch_id))) {
      return {
        success: false,
        error: "Bạn chỉ được chỉnh sửa phiếu nhập của kho mình.",
      };
    }

    let rejected = data.rejectedQuantity ?? 0;
    // When the user marks the whole line "rejected", auto-set rejected = received.
    if (data.qualityStatus === "rejected") {
      rejected = data.receivedQuantity;
    }
    if (rejected > 0 && !data.rejectionReason) {
      return {
        success: false,
        error: "Phải nhập lý do khi có hàng từ chối nhập.",
      };
    }

    const resolvedUnit = await resolveEntryUnitCode(supabase, {
      tenantId: claims.tenant_id,
      ingredientId: data.ingredientId,
      entryUnitId: data.entryUnitId,
    });
    if (!resolvedUnit.success) {
      return { success: false, error: resolvedUnit.error };
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
          unit: resolvedUnit.unit,
          entry_unit_id: data.entryUnitId ?? null,
          unit_cost: data.unitCost,
          total_cost: totalCost,
          quality_status: data.qualityStatus,
          receiving_temperature: data.receivingTemperature ?? null,
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
    if (!(await canAccessProcurementBranch(supabase, claims, grn.branch_id))) {
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
    console.error("inventory.grn.confirm_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
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
      console.error("inventory.grn.notification_dispatch_failed", {
        error: e instanceof Error ? e.message : String(e),
      });
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
      console.error("inventory.grn.amend_line_failed", {
        error: error instanceof Error ? error.message : String(error),
      });
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
          error: "Dòng đã có phiếu trả NCC liên kết — không thể sửa trực tiếp.",
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
