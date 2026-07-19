"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  BRANCH_FLOOR_SETTINGS_ROLES,
  PERMISSION_KEYS,
} from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { withActionPositional } from "@/_lib/with-action";

const resolveVarianceSchema = z.object({
  branchId: z.coerce
    .number()
    .int()
    .positive({ error: "Chi nhánh không hợp lệ" }),
  sessionId: z.coerce.number().int().positive({ error: "Ca POS không hợp lệ" }),
  resolutionType: z.enum(["staff_repaid", "accepted_adjustment"]),
  note: z
    .string()
    .trim()
    .min(10, { error: "Ghi chú xử lý cần ít nhất 10 ký tự" })
    .max(500, { error: "Ghi chú xử lý tối đa 500 ký tự" }),
});

type ResolveVarianceRpcClient = {
  rpc: (
    fn: "resolve_pos_session_variance",
    args: {
      p_session_id: number;
      p_resolution_type: "staff_repaid" | "accepted_adjustment";
      p_note: string;
    },
  ) => PromiseLike<{
    data: unknown;
    error: { code?: string; message?: string } | null;
  }>;
};

export const resolvePosSessionVariance = withActionPositional(
  {
    argsToInput: (
      branchId: number,
      sessionId: number,
      resolutionType: "staff_repaid" | "accepted_adjustment",
      note: string,
    ) => ({ branchId, sessionId, resolutionType, note }),
    schema: resolveVarianceSchema,
    roles: BRANCH_FLOOR_SETTINGS_ROLES,
    permission: PERMISSION_KEYS.POS_CLOSE_SHIFT,
    permissionBranchId: (data) => data.branchId,
    requireBranchScope: true,
    forbiddenError: "Không có quyền xử lý lệch quỹ",
  },
  async (
    { branchId, sessionId, resolutionType, note },
    { supabase },
  ): Promise<ActionResult> => {
    const { error } = await (
      supabase as unknown as ResolveVarianceRpcClient
    ).rpc("resolve_pos_session_variance", {
      p_session_id: sessionId,
      p_resolution_type: resolutionType,
      p_note: note,
    });

    if (error) {
      const message = error.message ?? "";
      if (error.code === "42501") {
        return { success: false, error: "Không có quyền xử lý lệch quỹ" };
      }
      if (message.includes("variance_already_resolved")) {
        return { success: false, error: "Ca này đã được xử lý" };
      }
      if (message.includes("variance_not_actionable")) {
        return { success: false, error: "Ca này không còn lệch quỹ cần xử lý" };
      }
      if (message.includes("staff_repayment_requires_shortage")) {
        return {
          success: false,
          error: "Chỉ ghi nhận bù tiền cho ca bị thiếu",
        };
      }
      return {
        success: false,
        error: "Không thể lưu xử lý lệch quỹ. Vui lòng thử lại.",
      };
    }

    revalidatePath(`/br/${String(branchId)}/pos-sessions`);

    return { success: true };
  },
);
