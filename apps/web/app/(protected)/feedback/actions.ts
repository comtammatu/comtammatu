"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { withAction } from "@/_lib/with-action";
import {
  createFeedbackQrSchema,
  deactivateFeedbackQrSchema,
  FEEDBACK_PAGE_SIZE,
  feedbackPublicUrl,
  generateFeedbackToken,
  rotateFeedbackQrSchema,
} from "@lib/feedback/contracts";

const STAFF_ROLES = ["owner", "branch_manager"] as const;

export type FeedbackInboxRow = {
  id: number;
  branchId: number;
  branchName: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  qrLabel: string;
  orderNumber: string | null;
  tableNumber: string | null;
  orderCreatedAt: string | null;
};

export type FeedbackQrRow = {
  id: number;
  branchId: number;
  branchName: string;
  tableId: number | null;
  tableNumber: number | null;
  token: string;
  label: string;
  isActive: boolean;
  createdAt: string;
  url: string;
};

function revalidateFeedbackPaths(branchId: number) {
  revalidatePath("/feedback");
  revalidatePath("/feedback/qr");
  revalidatePath(`/br/${branchId}/feedback`);
  revalidatePath(`/br/${branchId}/feedback/qr`);
}

const listInboxSchema = z.object({
  branchId: z.number().int().positive().nullable().optional(),
  page: z.number().int().min(1).default(1),
});

export const listFeedbackInbox = withAction(
  {
    schema: listInboxSchema,
    roles: STAFF_ROLES,
    permission: PERMISSION_KEYS.FEEDBACK_VIEW,
    permissionBranchId: (data) => data.branchId ?? null,
  },
  async (data, ctx) => {
    const page = data.page ?? 1;
    const from = (page - 1) * FEEDBACK_PAGE_SIZE;
    const to = from + FEEDBACK_PAGE_SIZE - 1;
    const role = ctx.claims.user_role;
    const assignedBranchId = ctx.claims.branch_id;

    let query = ctx.supabase
      .from("feedbacks")
      .select(
        "id, branch_id, rating, comment, created_at, qr_code_id, order_number, table_number, order_created_at, feedback_qr_codes!inner(label), branches!inner(name)",
        { count: "exact" },
      )
      .eq("tenant_id", ctx.claims.tenant_id)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (role !== "owner") {
      if (assignedBranchId == null) {
        return { success: false, error: "Chi nhánh chưa được gán." };
      }
      query = query.eq("branch_id", assignedBranchId);
    } else if (data.branchId != null) {
      query = query.eq("branch_id", data.branchId);
    }

    const { data: rows, error, count } = await query;
    if (error) {
      return { success: false, error: "Không tải được danh sách phản hồi." };
    }

    const items: FeedbackInboxRow[] = (rows ?? []).map((row) => {
      const qr = row.feedback_qr_codes as unknown as { label: string } | null;
      const branch = row.branches as unknown as { name: string } | null;
      return {
        id: row.id,
        branchId: row.branch_id,
        branchName: branch?.name ?? "—",
        rating: row.rating,
        comment: row.comment,
        createdAt: row.created_at,
        qrLabel: qr?.label ?? "—",
        orderNumber: row.order_number,
        tableNumber: row.table_number,
        orderCreatedAt: row.order_created_at,
      };
    });

    return {
      success: true,
      data: {
        items,
        page,
        pageSize: FEEDBACK_PAGE_SIZE,
        total: count ?? items.length,
      },
    };
  },
);

const listQrSchema = z.object({
  branchId: z.number().int().positive().nullable().optional(),
  origin: z.string().url(),
});

export const listFeedbackQrCodes = withAction(
  {
    schema: listQrSchema,
    roles: STAFF_ROLES,
    permission: PERMISSION_KEYS.FEEDBACK_VIEW,
    permissionBranchId: (data) => data.branchId ?? null,
  },
  async (data, ctx) => {
    const role = ctx.claims.user_role;
    const assignedBranchId = ctx.claims.branch_id;

    let query = ctx.supabase
      .from("feedback_qr_codes")
      .select(
        "id, branch_id, table_id, token, label, is_active, created_at, branches!inner(name), tables(number)",
      )
      .eq("tenant_id", ctx.claims.tenant_id)
      .order("created_at", { ascending: false });

    if (role !== "owner") {
      if (assignedBranchId == null) {
        return { success: false, error: "Chi nhánh chưa được gán." };
      }
      query = query.eq("branch_id", assignedBranchId);
    } else if (data.branchId != null) {
      query = query.eq("branch_id", data.branchId);
    }

    const { data: rows, error } = await query;
    if (error) {
      return { success: false, error: "Không tải được danh sách mã QR." };
    }

    const items: FeedbackQrRow[] = (rows ?? []).map((row) => {
      const branch = row.branches as unknown as { name: string } | null;
      const table = row.tables as unknown as { number: number } | null;
      return {
        id: row.id,
        branchId: row.branch_id,
        branchName: branch?.name ?? "—",
        tableId: row.table_id,
        tableNumber: table?.number ?? null,
        token: row.token,
        label: row.label,
        isActive: row.is_active,
        createdAt: row.created_at,
        url: feedbackPublicUrl(row.token, data.origin),
      };
    });

    return { success: true, data: { items } };
  },
);

export const createFeedbackQr = withAction(
  {
    schema: createFeedbackQrSchema,
    roles: STAFF_ROLES,
    permission: PERMISSION_KEYS.FEEDBACK_MANAGE_QR,
    permissionBranchId: (data) => data.branchId,
  },
  async (data, ctx) => {
    if (
      ctx.claims.user_role !== "owner" &&
      ctx.claims.branch_id !== data.branchId
    ) {
      return { success: false, error: "Không có quyền tạo QR chi nhánh khác." };
    }

    const token = generateFeedbackToken();
    const { data: row, error } = await ctx.supabase
      .from("feedback_qr_codes")
      .insert({
        tenant_id: ctx.claims.tenant_id,
        branch_id: data.branchId,
        table_id: data.tableId ?? null,
        token,
        label: data.label,
        is_active: true,
        created_by: ctx.user.id,
      })
      .select("id, token, branch_id")
      .maybeSingle();

    if (error || !row) {
      if (error?.code === "23505") {
        return {
          success: false,
          error: "Bàn này đã có mã QR đang hoạt động.",
        };
      }
      return { success: false, error: "Không tạo được mã QR." };
    }

    revalidateFeedbackPaths(row.branch_id);
    return { success: true, data: { id: row.id, token: row.token } };
  },
);

export const rotateFeedbackQr = withAction(
  {
    schema: rotateFeedbackQrSchema,
    roles: STAFF_ROLES,
    permission: PERMISSION_KEYS.FEEDBACK_MANAGE_QR,
    permissionBranchId: (data) => data.branchId,
  },
  async (data, ctx) => {
    if (
      ctx.claims.user_role !== "owner" &&
      ctx.claims.branch_id !== data.branchId
    ) {
      return { success: false, error: "Không có quyền xoay QR chi nhánh khác." };
    }

    const token = generateFeedbackToken();
    const { data: row, error } = await ctx.supabase
      .from("feedback_qr_codes")
      .update({
        token,
        rotated_at: new Date().toISOString(),
        is_active: true,
      })
      .eq("id", data.qrCodeId)
      .eq("tenant_id", ctx.claims.tenant_id)
      .eq("branch_id", data.branchId)
      .select("id, token, branch_id")
      .maybeSingle();

    if (error || !row) {
      return { success: false, error: "Không xoay được mã QR." };
    }

    revalidateFeedbackPaths(row.branch_id);
    return { success: true, data: { id: row.id, token: row.token } };
  },
);

export const deactivateFeedbackQr = withAction(
  {
    schema: deactivateFeedbackQrSchema,
    roles: STAFF_ROLES,
    permission: PERMISSION_KEYS.FEEDBACK_MANAGE_QR,
    permissionBranchId: (data) => data.branchId,
  },
  async (data, ctx) => {
    if (
      ctx.claims.user_role !== "owner" &&
      ctx.claims.branch_id !== data.branchId
    ) {
      return { success: false, error: "Không có quyền tắt QR chi nhánh khác." };
    }

    const { data: row, error } = await ctx.supabase
      .from("feedback_qr_codes")
      .update({ is_active: false })
      .eq("id", data.qrCodeId)
      .eq("tenant_id", ctx.claims.tenant_id)
      .eq("branch_id", data.branchId)
      .select("id, branch_id")
      .maybeSingle();

    if (error || !row) {
      return { success: false, error: "Không tắt được mã QR." };
    }

    revalidateFeedbackPaths(row.branch_id);
    return { success: true, data: { id: row.id } };
  },
);
