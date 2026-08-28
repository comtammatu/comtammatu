"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PERMISSION_KEYS, STAFF_ROLES } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getAuthContextWithPermission } from "@/(protected)/inventory/_lib/auth";
import { resolveCountSlipReviewerEmployeeId } from "@lib/inventory/count-slip-reviewer";

/* ─── Count slip review (manager queue) ─── */

const approveSlipSchema = z.object({
  slipId: z.coerce.number().int().positive(),
  autoCreateWaste: z.boolean().optional().default(false),
});

const SELF_REVIEW_ERROR = "Không thể tự duyệt phiếu của mình.";

export type ApproveCountSlipResult = {
  slipId: number;
  alreadyApproved: boolean;
  wasteCreated?: boolean;
  wasteIssueNumber?: string;
  wasteItemsCount?: number;
  wasteError?: string;
};

/**
 * Confirm a submitted count slip. Wraps `approve_inventory_count_slip` RPC,
 * which flips the slip status to `approved` for shift handover review.
 * Decoupled: does not mutate stock ledger balances or post count adjustments.
 * Idempotent: a second call on an approved slip returns `alreadyApproved=true`.
 *
 * When `autoCreateWaste=true`, automatically creates a stock waste entry
 * for all negative variance (shortage) lines under the manager's review.
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

  const ctx = await getAuthContextWithPermission(
    STAFF_ROLES,
    PERMISSION_KEYS.INVENTORY_COUNT_APPROVE,
  );
  if (!ctx) return { success: false, error: "Không có quyền duyệt phiếu đếm" };
  const { supabase, claims, userId } = ctx;
  const { data: slip } = await supabase
    .from("inventory_count_slips")
    .select(`
      id,
      slip_number,
      branch_id,
      location_id,
      employee_id,
      lines:inventory_count_slip_lines (
        id,
        ingredient_id,
        system_quantity,
        counted_quantity,
        entry_unit_id,
        entry_to_base_factor
      )
    `)
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

  const { data, error } = await supabase.rpc("approve_inventory_count_slip", {
    p_slip_id: parsed.data.slipId,
  });

  if (error) {
    return { success: false, error: mapCountSlipError(error) };
  }

  const raw = (data ?? {}) as Record<string, unknown>;

  let wasteCreated = false;
  let wasteIssueNumber: string | undefined;
  let wasteItemsCount: number | undefined;
  let wasteError: string | undefined;

  if (parsed.data.autoCreateWaste && Array.isArray(slip.lines)) {
    const shortageLines = slip.lines.filter(
      (line) =>
        line.system_quantity != null &&
        line.counted_quantity != null &&
        Number(line.counted_quantity) < Number(line.system_quantity),
    );

    if (shortageLines.length > 0) {
      const missingUnitIngIds = shortageLines
        .filter((l) => l.entry_unit_id == null)
        .map((l) => l.ingredient_id);

      const baseUnitMap = new Map<number, number>();
      if (missingUnitIngIds.length > 0) {
        const { data: unitRows } = await supabase
          .from("ingredient_units")
          .select("ingredient_id, unit_id")
          .eq("tenant_id", claims.tenant_id)
          .eq("is_base", true)
          .in("ingredient_id", missingUnitIngIds);

        for (const row of unitRows ?? []) {
          baseUnitMap.set(row.ingredient_id, row.unit_id);
        }
      }

      const wasteItems = [];
      for (const line of shortageLines) {
        const entryUnitId =
          line.entry_unit_id ?? baseUnitMap.get(line.ingredient_id);
        if (entryUnitId != null) {
          const shortageQty =
            Number(line.system_quantity) - Number(line.counted_quantity);
          if (shortageQty > 0) {
            wasteItems.push({
              ingredient_id: line.ingredient_id,
              quantity: shortageQty,
              entry_unit_id: entryUnitId,
              reason_code: "spoiled" as const,
              note: `Hao hụt kiểm đếm giao ca #${slip.slip_number}`,
            });
          }
        }
      }

      if (wasteItems.length > 0) {
        // Dynamic import / call createWasteEntry to create the waste record
        const { createWasteEntry } = await import("../waste-actions");
        const wasteRes = await createWasteEntry({
          branchId: slip.branch_id,
          locationId: slip.location_id,
          items: wasteItems,
          sourceType: "manual",
          sourceRef: {
            countSlipId: slip.id,
            countSlipNumber: slip.slip_number,
          },
        });

        if (wasteRes.success && wasteRes.data) {
          wasteCreated = true;
          wasteIssueNumber = wasteRes.data.issueNumber;
          wasteItemsCount = wasteItems.length;
        } else {
          wasteError = wasteRes.error ?? "Không thể tạo phiếu xuất hủy tự động.";
        }
      }
    }
  }

  revalidatePath("/inventory/count-slips");
  revalidatePath(`/br/${slip.branch_id}/stock/count-slips`);
  revalidatePath(`/br/${slip.branch_id}/team`);

  return {
    success: true,
    data: {
      slipId: parsed.data.slipId,
      alreadyApproved: raw.already_approved === true,
      wasteCreated,
      wasteIssueNumber,
      wasteItemsCount,
      wasteError,
    },
  };
}

const requestRecountSchema = z.object({
  slipId: z.coerce.number().int().positive(),
  note: z.string().trim().min(3).max(1000),
});

/**
 * Send a submitted count slip back for recount. Wraps
 * `request_inventory_count_recount` RPC, which sets status `needs_changes` and
 * notifies the submitting employee with the manager's note.
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

  const ctx = await getAuthContextWithPermission(
    STAFF_ROLES,
    PERMISSION_KEYS.INVENTORY_COUNT_APPROVE,
  );
  if (!ctx) return { success: false, error: "Không có quyền duyệt phiếu đếm" };
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

  const { error } = await supabase.rpc("request_inventory_count_recount", {
    p_slip_id: parsed.data.slipId,
    p_note: parsed.data.note,
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
