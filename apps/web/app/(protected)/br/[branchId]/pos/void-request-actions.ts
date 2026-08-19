"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@comtammatu/shared/types";
import { withAction } from "@/_lib/with-action";
import {
  REFUND_PAYOUT_METHODS,
  type RefundPayoutMethod,
} from "@lib/refund-payout";

const requestSchema = z.object({
  orderId: z.coerce.number().int().positive(),
  payoutMethod: z.enum(REFUND_PAYOUT_METHODS),
  reason: z.string().trim().min(20).max(500),
  branchId: z.coerce.number().int().positive(),
});

const resolveSchema = z.object({
  requestId: z.coerce.number().int().positive(),
  decision: z.enum(["approved", "rejected"]),
  branchId: z.coerce.number().int().positive(),
  resolutionNote: z.string().trim().max(500).optional(),
});

export const requestPosVoidAfterPaid = withAction(
  {
    schema: requestSchema,
    roles: ["cashier", "chef", "branch_staff", "branch_manager"] as const,
    requireBranchScope: true,
    forbiddenError: "Không có quyền gửi yêu cầu hủy đơn",
  },
  async (
    { orderId, payoutMethod, reason, branchId },
    { supabase },
  ): Promise<ActionResult<{ requestId: number }>> => {
    const { data, error } = await supabase.rpc("request_pos_void_after_paid", {
      p_order_id: orderId,
      p_reason: reason,
      p_payout_method: payoutMethod,
    });

    if (error) {
      const message = error.message ?? "";
      if (message.includes("owner_use_direct_void")) {
        return {
          success: false,
          error: "Chủ sở hữu hãy dùng hủy đơn trực tiếp.",
        };
      }
      if (error.code === "23505") {
        return {
          success: false,
          error: "Đơn này đã có yêu cầu hủy đang chờ duyệt.",
        };
      }
      return {
        success: false,
        error: "Không gửi được yêu cầu hủy đơn. Vui lòng thử lại.",
      };
    }

    const requestId = Number(
      (data as { request_id?: number } | null)?.request_id,
    );
    if (!Number.isFinite(requestId)) {
      return { success: false, error: "Phản hồi yêu cầu hủy không hợp lệ" };
    }

    revalidatePath(`/br/${String(branchId)}/pos`);
    revalidatePath(`/br/${String(branchId)}/orders`);
    return { success: true, data: { requestId } };
  },
);

export const resolvePosVoidRequest = withAction(
  {
    schema: resolveSchema,
    roles: ["cashier", "chef", "branch_staff", "branch_manager", "owner"] as const,
    requireBranchScope: true,
    forbiddenError: "Không có quyền duyệt yêu cầu hủy đơn",
  },
  async (
    { requestId, decision, branchId, resolutionNote },
    { supabase },
  ): Promise<ActionResult<{ status: string }>> => {
    const { data, error } = await supabase.rpc("resolve_pos_void_request", {
      p_request_id: requestId,
      p_decision: decision,
      ...(resolutionNote ? { p_resolution_note: resolutionNote } : {}),
    });

    if (error) {
      if (error.code === "42501") {
        return {
          success: false,
          error: "Chỉ trưởng ca, quản lý chi nhánh hoặc Chủ sở hữu được duyệt.",
        };
      }
      return {
        success: false,
        error: "Không duyệt được yêu cầu hủy đơn. Vui lòng thử lại.",
      };
    }

    const status = String((data as { status?: string } | null)?.status ?? "");
    revalidatePath(`/br/${String(branchId)}/pos`);
    revalidatePath(`/br/${String(branchId)}/orders`);
    return { success: true, data: { status } };
  },
);

export type PendingVoidRequest = {
  id: number;
  order_id: number;
  reason: string;
  payout_method: RefundPayoutMethod;
  created_at: string;
};

export const listPendingPosVoidRequests = withAction(
  {
    schema: z.object({
      branchId: z.coerce.number().int().positive(),
    }),
    roles: ["cashier", "chef", "branch_staff", "branch_manager", "owner"] as const,
    requireBranchScope: true,
    forbiddenError: "Không có quyền xem yêu cầu hủy đơn",
  },
  async ({ branchId }, { supabase }): Promise<
    ActionResult<{ requests: PendingVoidRequest[] }>
  > => {
    const { data, error } = await supabase
      .from("pos_void_requests")
      .select("id, order_id, reason, payout_method, created_at")
      .eq("branch_id", branchId)
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(20);

    if (error) {
      return {
        success: false,
        error: "Không tải được danh sách yêu cầu hủy đơn.",
      };
    }

    const requests = (data ?? []).map((row) => ({
      id: Number(row.id),
      order_id: Number(row.order_id),
      reason: String(row.reason),
      payout_method: row.payout_method as RefundPayoutMethod,
      created_at: String(row.created_at),
    }));

    return { success: true, data: { requests } };
  },
);
