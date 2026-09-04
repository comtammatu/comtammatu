import "server-only";

import { z } from "zod";
import type { SupabaseClient } from "@comtammatu/database";
import { PERMISSION_KEYS, type JwtClaims } from "@comtammatu/shared/auth";
import { formatVNClockTime } from "@comtammatu/shared/time";
import { formatDateVN, formatTimeVN } from "../_lib/vn-business-date";
import { loadCheckoutChecklistPhotoMeta } from "./checklist-photo-meta";

export const checkoutReviewRowSchema = z.object({
  id: z.number().int().positive(),
  date: z.string(),
  branch_id: z.number().int().positive().nullable(),
  check_in: z.string().nullable(),
  checkout_requested_at: z.string(),
  checkout_requested_by_role: z.string().nullable(),
  checkout_approval_target_roles: z.array(z.string()),
  employee_id: z.number().int().positive(),
  branch_name: z.string().nullable(),
  employee_code: z.string().nullable(),
  employee_full_name: z.string().nullable(),
  requester_role: z.string(),
  shift_name: z.string().nullable(),
  shift_start_time: z.string().nullable(),
  shift_end_time: z.string().nullable(),
  checklist: z.array(
    z.object({
      id: z.number().int().positive(),
      title: z.string(),
      is_done: z.boolean(),
      is_required: z.boolean(),
    }),
  ),
});

export type CheckoutReviewRow = z.infer<typeof checkoutReviewRowSchema>;

export interface CheckoutApprovalItem {
  id: number;
  employeeName: string;
  employeeCode: string | null;
  branchName: string | null;
  dateLabel: string;
  checkInLabel: string;
  requestedLabel: string;
  shiftName: string;
  shiftLabel: string;
  requestKindLabel: string;
  checklist: {
    id: number;
    title: string;
    isDone: boolean;
    isRequired: boolean;
    allowsPhoto: boolean;
    hasPhoto: boolean;
  }[];
}

export async function loadCheckoutReviewQueue(
  supabase: SupabaseClient,
  claims: JwtClaims,
  routeBranchId?: number | null,
): Promise<{ items: CheckoutApprovalItem[]; canApprove: boolean }> {
  const scopedOut =
    claims.user_role === "branch_manager" &&
    (routeBranchId == null || claims.branch_id !== routeBranchId);

  const canApprovePromise =
    claims.user_role === "owner"
      ? Promise.resolve({ data: true })
      : routeBranchId != null
        ? supabase.rpc("has_permission", {
            p_branch_id: routeBranchId,
            p_key: PERMISSION_KEYS.HR_APPROVE_CHECKOUT,
          })
        : Promise.resolve({ data: false });

  const [{ data: canApprove }, queueResult] = await Promise.all([
    canApprovePromise,
    scopedOut
      ? Promise.resolve({ data: [] })
      : supabase.rpc("get_checkout_review_queue", {
          p_branch_id: (routeBranchId ?? null) as unknown as number,
          p_include_rows: true,
        }),
  ]);

  const parsedRecords = checkoutReviewRowSchema
    .array()
    .safeParse(queueResult.data?.[0]?.rows ?? []);

  if (!parsedRecords.success && !scopedOut) {
    console.error("[checkout-approvals/data] invalid review queue payload", {
      branchId: routeBranchId,
      error: parsedRecords.error.flatten(),
    });
  }

  const records = parsedRecords.success ? parsedRecords.data : [];
  const photoMetaByItemId = await loadCheckoutChecklistPhotoMeta(
    claims.tenant_id,
    records.map((record) => record.id),
  );

  const items: CheckoutApprovalItem[] = records.map((record) => {
    const shiftRange =
      record.shift_start_time || record.shift_end_time
        ? `${formatVNClockTime(record.shift_start_time)} - ${formatVNClockTime(
            record.shift_end_time,
          )}`
        : null;

    return {
      id: record.id,
      employeeName: record.employee_full_name ?? "Nhân viên",
      employeeCode: record.employee_code,
      branchName: record.branch_name,
      dateLabel: formatDateVN(record.date),
      checkInLabel: record.check_in ? formatTimeVN(record.check_in) : "—",
      requestedLabel: record.checkout_requested_at
        ? formatTimeVN(record.checkout_requested_at)
        : "—",
      shiftName: record.shift_name ?? "Chưa có ca",
      shiftLabel: record.shift_name
        ? shiftRange
          ? `${record.shift_name} · ${shiftRange}`
          : record.shift_name
        : "Chưa có ca",
      requestKindLabel:
        record.checkout_requested_by_role === "branch_manager"
          ? "Quản lý chi nhánh"
          : "Nhân viên chi nhánh",
      checklist: record.checklist.map((c) => {
        const photoMeta = photoMetaByItemId.get(c.id);
        return {
          id: c.id,
          title: c.title,
          isDone: c.is_done,
          isRequired: c.is_required,
          allowsPhoto: photoMeta?.allowsPhoto === true,
          hasPhoto: photoMeta?.hasPhoto === true,
        };
      }),
    };
  });

  return {
    items,
    canApprove: canApprove === true,
  };
}
