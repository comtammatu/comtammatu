"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PERMISSION_KEYS, STAFF_ROLES } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import {
  getAuthContext,
  probePermission,
} from "@/(protected)/inventory/_lib/auth";
import { resolveCountSlipReviewerEmployeeId } from "@lib/inventory/count-slip-reviewer";

/* ─── Count slip review (manager queue) ─── */

const approveSlipSchema = z.object({
  slipId: z.coerce.number().int().positive(),
  autoCreateWaste: z.boolean().optional().default(false),
  autoAdjustSurplus: z.boolean().optional().default(false),
  allowSelfReview: z.boolean().optional().default(false),
  wastePhotoUrls: z
    .record(
      z.string().regex(/^\d+$/),
      z.array(z.string().url()).max(10),
    )
    .optional()
    .default({}),
  wasteReasons: z
    .record(
      z.string().regex(/^\d+$/),
      z.string().trim().min(1).max(50),
    )
    .optional()
    .default({}),
  surplusReasons: z
    .record(
      z.string().regex(/^\d+$/),
      z.string().trim().min(1).max(50),
    )
    .optional()
    .default({}),
});

const SELF_REVIEW_ERROR = "Không thể tự duyệt phiếu của mình.";

export type ApproveCountSlipResult = {
  slipId: number;
  alreadyApproved: boolean;
  wasteCreated?: boolean;
  wasteIssueNumber?: string;
  wasteItemsCount?: number;
  surplusAdjusted?: boolean;
  surplusLinesCount?: number;
  requiresApproval?: boolean;
  isSelfApproved?: boolean;
};

/**
 * Confirm a submitted count slip. A handover-only approval stays decoupled
 * from stock. `autoCreateWaste` and `autoAdjustSurplus` use one atomic RPC so the count approval,
 * its shortage writeoff, and surplus adjustments either all commit or all roll back.
 */
export async function approveCountSlip(
  input: z.infer<typeof approveSlipSchema>,
): Promise<ActionResult<ApproveCountSlipResult>> {
  const parsed = approveSlipSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Phiếu không hợp lệ",
    };
  }

  const ctx = await getAuthContext(STAFF_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền duyệt phiếu đếm" };
  if (
    ctx.claims.user_role !== "owner" &&
    !(await probePermission(ctx, PERMISSION_KEYS.INVENTORY_COUNT_APPROVE))
  ) {
    return { success: false, error: "Không có quyền duyệt phiếu đếm" };
  }
  const { supabase, claims, userId } = ctx;
  const { data: slip } = await supabase
    .from("inventory_count_slips")
    .select(`
      id,
      branch_id,
      employee_id
    `)
    .eq("id", parsed.data.slipId)
    .eq("tenant_id", claims.tenant_id)
    .maybeSingle();
  if (!slip) return { success: false, error: "Không tìm thấy phiếu đếm." };

  const reviewerEmployeeId = await resolveCountSlipReviewerEmployeeId(
    claims.tenant_id,
    userId,
  );
  if (slip.employee_id === reviewerEmployeeId && !parsed.data.allowSelfReview) {
    return { success: false, error: SELF_REVIEW_ERROR };
  }

  const useAtomicAdjustment =
    parsed.data.autoCreateWaste || parsed.data.autoAdjustSurplus;

  const { data, error } = useAtomicAdjustment
    ? await supabase.rpc("approve_inventory_count_slip_with_waste", {
        p_slip_id: parsed.data.slipId,
        p_create_waste: parsed.data.autoCreateWaste,
        p_adjust_surplus: parsed.data.autoAdjustSurplus,
        p_waste_photo_urls: parsed.data.wastePhotoUrls,
        p_waste_reasons: parsed.data.wasteReasons,
        p_surplus_reasons: parsed.data.surplusReasons,
      })
    : await supabase.rpc("approve_inventory_count_slip", {
        p_slip_id: parsed.data.slipId,
      });

  if (error) {
    return { success: false, error: mapCountSlipError(error) };
  }

  const raw = (data ?? {}) as Record<string, unknown>;

  revalidatePath("/inventory/count-slips");
  revalidatePath(`/br/${slip.branch_id}/stock/count-slips`);
  revalidatePath(`/br/${slip.branch_id}/team`);

  return {
    success: true,
    data: {
      slipId: parsed.data.slipId,
      alreadyApproved: raw.already_approved === true,
      wasteCreated: raw.waste_created === true,
      wasteIssueNumber:
        typeof raw.waste_issue_number === "string"
          ? raw.waste_issue_number
          : undefined,
      wasteItemsCount:
        typeof raw.waste_items_count === "number"
          ? raw.waste_items_count
          : undefined,
      surplusAdjusted: raw.surplus_adjusted === true,
      surplusLinesCount:
        typeof raw.surplus_lines_count === "number"
          ? raw.surplus_lines_count
          : undefined,
      requiresApproval: raw.requires_approval === true,
      isSelfApproved: raw.is_self_approved === true,
    },
  };
}

/* ─── Recount request ─── */

const requestRecountSchema = z.object({
  slipId: z.coerce.number().int().positive(),
  lineIds: z.array(z.coerce.number().int().positive()).min(1),
  note: z.string().trim().min(3).max(1000),
});

/**
 * Return a count slip to the employee for recount on specified lines.
 * Sets status to 'needs_changes' and records the manager's review note.
 */
export async function requestCountRecount(
  input: z.infer<typeof requestRecountSchema>,
): Promise<ActionResult<void>> {
  const parsed = requestRecountSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Nhập lý do cần đếm lại",
    };
  }

  const ctx = await getAuthContext(STAFF_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền duyệt phiếu đếm" };
  if (
    ctx.claims.user_role !== "owner" &&
    !(await probePermission(ctx, PERMISSION_KEYS.INVENTORY_COUNT_APPROVE))
  ) {
    return { success: false, error: "Không có quyền duyệt phiếu đếm" };
  }
  const { supabase, claims, userId } = ctx;
  const { data: slip } = await supabase
    .from("inventory_count_slips")
    .select("branch_id, employee_id")
    .eq("id", parsed.data.slipId)
    .eq("tenant_id", claims.tenant_id)
    .maybeSingle();
  if (!slip) return { success: false, error: "Không tìm thấy phiếu đếm." };

  const reviewerEmployeeId = await resolveCountSlipReviewerEmployeeId(
    claims.tenant_id,
    userId,
  );
  if (slip.employee_id === reviewerEmployeeId) {
    return { success: false, error: SELF_REVIEW_ERROR };
  }

  const { error } = await supabase.rpc("request_inventory_count_line_recount", {
    p_slip_id: parsed.data.slipId,
    p_note: parsed.data.note,
    p_line_ids: parsed.data.lineIds,
  });

  if (error) {
    return { success: false, error: mapCountSlipError(error) };
  }

  revalidatePath("/inventory/count-slips");
  revalidatePath(`/br/${slip.branch_id}/stock/count-slips`);
  revalidatePath(`/br/${slip.branch_id}/team`);
  return { success: true };
}

/**
 * Map count-slip RPC raises to short Vietnamese copy. Never surface the raw
 * Postgres `error.message` to the UI.
 */
function mapCountSlipError(error: { code?: string; message?: string }): string {
  if (error.message?.includes("count_slip_waste_photo_required")) {
    return "Thêm ảnh bằng chứng cho từng mặt hàng thiếu trước khi xuất hủy.";
  }
  if (error.message?.includes("recount_lines_outstanding")) {
    return "Phiếu vẫn còn nguyên liệu phải đếm lại.";
  }
  if (
    error.message?.includes("recount_lines_required") ||
    error.message?.includes("recount_line_ids_duplicate")
  ) {
    return "Chọn ít nhất một nguyên liệu cần đếm lại.";
  }
  if (error.message?.includes("recount_line_scope_mismatch")) {
    return "Danh sách nguyên liệu không thuộc phiếu này.";
  }
  switch (error.code) {
    case "42501":
      return error.message?.includes("cannot_review_own_slip")
        ? SELF_REVIEW_ERROR
        : "Không có quyền duyệt phiếu đếm.";
    case "22023":
      return "Phiếu không còn ở trạng thái chờ duyệt.";
    case "P0002":
      return "Không tìm thấy phiếu đếm.";
    case "22001":
      return "Lý do đếm lại quá dài.";
    case "28000":
      return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
    default:
      return "Không xử lý được phiếu đếm.";
  }
}
