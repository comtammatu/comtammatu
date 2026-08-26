"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PERMISSION_KEYS, STAFF_ROLES } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getAuthContextWithPermission } from "@/(protected)/inventory/_lib/auth";

/* ─── Count slip review (manager queue) ─── */

const approveSlipSchema = z.object({
  slipId: z.coerce.number().int().positive(),
});

export type ApproveCountSlipResult = {
  slipId: number;
  alreadyApproved: boolean;
};

/**
 * Confirm a submitted count slip. Wraps `approve_inventory_count_slip` RPC,
 * which flips the slip status to `approved` for shift handover review.
 * Decoupled: does not mutate stock ledger balances or post count adjustments.
 * Idempotent: a second call on an approved slip returns `alreadyApproved=true`.
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
  const { supabase, claims } = ctx;
  const { data: slip } = await supabase
    .from("inventory_count_slips")
    .select("branch_id")
    .eq("id", parsed.data.slipId)
    .eq("tenant_id", claims.tenant_id)
    .maybeSingle();
  if (!slip) return { success: false, error: "Không tìm thấy phiếu đếm." };

  const { data, error } = await supabase.rpc("approve_inventory_count_slip", {
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
  const { supabase, claims } = ctx;
  const { data: slip } = await supabase
    .from("inventory_count_slips")
    .select("branch_id")
    .eq("id", parsed.data.slipId)
    .eq("tenant_id", claims.tenant_id)
    .maybeSingle();
  if (!slip) return { success: false, error: "Không tìm thấy phiếu đếm." };

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
        ? "Không thể tự duyệt phiếu của mình."
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
