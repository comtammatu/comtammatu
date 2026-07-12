"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  BRANCH_FLOOR_SETTINGS_ROLES,
  PERMISSION_KEYS,
} from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { withActionPositional } from "@/_lib/with-action";
import { messages } from "@lib/messages";

const resolveVarianceSchema = z.object({
  branchId: z.coerce
    .number()
    .int()
    .positive({ error: "Chi nhánh không hợp lệ" }),
  sessionId: z.coerce.number().int().positive({ error: "Ca POS không hợp lệ" }),
  note: z
    .string()
    .trim()
    .min(10, { error: "Ghi chú xử lý cần ít nhất 10 ký tự" })
    .max(500, { error: "Ghi chú xử lý tối đa 500 ký tự" }),
});

function computeVarianceThreshold(expectedCash: number | null): number {
  if (expectedCash == null) return 50_000;
  return Math.max(50_000, Math.round(expectedCash * 0.005 * 100) / 100);
}

export const resolvePosSessionVariance = withActionPositional(
  {
    argsToInput: (branchId: number, sessionId: number, note: string) => ({
      branchId,
      sessionId,
      note,
    }),
    schema: resolveVarianceSchema,
    roles: BRANCH_FLOOR_SETTINGS_ROLES,
    permission: PERMISSION_KEYS.POS_CLOSE_SHIFT,
    permissionBranchId: (data) => data.branchId,
    requireBranchScope: true,
    forbiddenError: "Không có quyền xử lý lệch quỹ",
  },
  async (
    { branchId, sessionId, note },
    { supabase, claims, user },
  ): Promise<ActionResult> => {
    const { data: session, error: sessionError } = await supabase
      .from("pos_sessions")
      .select(
        "id, branch_id, status, expected_cash, cash_difference, variance_approval_note",
      )
      .eq("id", sessionId)
      .eq("branch_id", branchId)
      .eq("tenant_id", claims.tenant_id)
      .maybeSingle();

    if (sessionError) {
      return {
        success: false,
        error: messages.settings.branch.posSessionsLoadFailed,
      };
    }

    if (!session) {
      return { success: false, error: "Không tìm thấy ca POS" };
    }

    if (session.status !== "closed") {
      return { success: false, error: "Chỉ xử lý lệch quỹ sau khi ca đã chốt" };
    }

    const cashDifference =
      session.cash_difference == null ? null : Number(session.cash_difference);
    const expectedCash =
      session.expected_cash == null ? null : Number(session.expected_cash);
    const threshold = computeVarianceThreshold(expectedCash);

    if (cashDifference == null || Math.abs(cashDifference) <= threshold) {
      return { success: false, error: "Ca này không có lệch quỹ cần xử lý" };
    }

    const { data: updated, error: updateError } = await supabase
      .from("pos_sessions")
      .update({
        variance_approval_note: note,
        variance_approver_user_id: user.id,
      })
      .eq("id", sessionId)
      .eq("branch_id", branchId)
      .eq("tenant_id", claims.tenant_id)
      .select("id")
      .maybeSingle();

    if (updateError || !updated) {
      return {
        success: false,
        error: "Không thể lưu xử lý lệch quỹ. Vui lòng thử lại.",
      };
    }

    revalidatePath(`/br/${String(branchId)}/pos-sessions`);
    revalidatePath(`/br/${String(branchId)}/pos-sessions/${String(sessionId)}`);

    return { success: true };
  },
);
