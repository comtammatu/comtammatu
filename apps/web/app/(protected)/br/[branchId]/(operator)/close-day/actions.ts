"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { BRANCH_FLOOR_SETTINGS_ROLES } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { withAction } from "@/_lib/with-action";

const sessionCashReconSchema = z.object({
  sessionId: z.coerce.number().int().positive(),
  openingCash: z.coerce.number().min(0),
  expectedCash: z.coerce.number().min(0),
  closingCash: z.coerce.number().min(0),
  cashDifference: z.coerce.number(),
});

const closeBranchDaySchema = z.object({
  branchId: z.coerce
    .number()
    .int()
    .positive({ error: "Chi nhánh không hợp lệ" }),
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
    error: "Ngày chốt không hợp lệ",
  }),
  cashRecon: z.array(sessionCashReconSchema).default([]),
  note: z
    .string()
    .trim()
    .max(500, { error: "Ghi chú tối đa 500 ký tự" })
    .optional(),
});

export type CloseBranchDayInput = z.infer<typeof closeBranchDaySchema>;

export interface CloseBranchDayRpcResult {
  branch_day_state_id: number;
  summary: {
    revenue: number;
    paid_orders: number;
    unpaid_orders: number;
    cash_revenue: number;
    noncash_revenue: number;
    closed_session_count: number;
    open_session_count: number;
  };
}

export const closeBranchDay = withAction(
  {
    schema: closeBranchDaySchema,
    roles: BRANCH_FLOOR_SETTINGS_ROLES,
    requireBranchScope: true,
    forbiddenError: "Không có quyền chốt ngày",
  },
  async ({ branchId, businessDate, cashRecon, note }, { supabase }): Promise<
    ActionResult<CloseBranchDayRpcResult>
  > => {
    const { data, error } = await supabase.rpc("close_branch_day", {
      p_branch_id: branchId,
      p_business_date: businessDate,
      // Cash reconciliation is a client-provided snapshot of counted totals
      // per session (already-closed sessions only — the RPC refuses if any
      // session is still open).
      p_cash_recon: cashRecon.map((row) => ({
        session_id: row.sessionId,
        opening_cash: row.openingCash,
        expected_cash: row.expectedCash,
        closing_cash: row.closingCash,
        cash_difference: row.cashDifference,
      })),
      p_note: note ?? "",
    });

    if (error) {
      const message = error.message ?? "";
      if (error.code === "42501") {
        return { success: false, error: "Không có quyền chốt ngày" };
      }
      if (message.includes("pos_session_still_open")) {
        return {
          success: false,
          error: "Vẫn còn ca POS đang mở. Đóng tất cả ca trước khi chốt ngày.",
        };
      }
      if (message.includes("branch_day_already_closed")) {
        return { success: false, error: "Ngày này đã được chốt" };
      }
      if (message.includes("branch_day_not_found")) {
        return { success: false, error: "Không tìm thấy chi nhánh" };
      }
      return {
        success: false,
        error: "Không thể chốt ngày. Vui lòng thử lại.",
      };
    }

    revalidatePath(`/br/${String(branchId)}/close-day`);
    revalidatePath(`/br/${String(branchId)}/dashboard`);
    revalidatePath(`/br/${String(branchId)}/pos-sessions`);

    return { success: true, data: (data ?? undefined) as CloseBranchDayRpcResult | undefined };
  },
);
