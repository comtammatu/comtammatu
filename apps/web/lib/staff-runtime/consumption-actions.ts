"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServiceClient } from "@comtammatu/database/supabase/service";
import { PERMISSION_KEYS, type StaffRole } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getAuthContext } from "@/_lib/auth";
import { getEmployeeContext } from "./_lib/staff-runtime-context";

type RpcClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string; code?: string } | null }>;
};

type QueryResponse<T> = {
  data: T | null;
  error: { message: string; code?: string } | null;
};

type UntypedQueryBuilder<T> = PromiseLike<QueryResponse<T>> & {
  select: (columns: string) => UntypedQueryBuilder<T>;
  eq: (column: string, value: unknown) => UntypedQueryBuilder<T>;
  order: (column: string, options?: Record<string, unknown>) => UntypedQueryBuilder<T>;
  maybeSingle: () => Promise<QueryResponse<T>>;
};

type UntypedQuery = {
  from: <T>(table: string) => UntypedQueryBuilder<T>;
};

interface ConsumptionReportDbRow {
  id: number;
  attendance_record_id: number;
  status: unknown;
  note: string | null;
  review_note: string | null;
  stock_issue_id: number | null;
  no_consumption: boolean | null;
  submitted_at: string | null;
  reviewed_at: string | null;
}

interface ConsumptionReportLineDbRow {
  id: number;
  ingredient_id: number;
  default_item_id: number | null;
  quantity: number | string;
  note: string | null;
  ingredients: {
    name?: string | null;
    ingredient_units?: { is_base: boolean; units: { code: string } | null }[];
  } | null;
}

interface ConsumptionDefaultItemDbRow {
  id: number;
  ingredient_id: number;
  sort_order: number | null;
  note: string | null;
}

const CHECKOUT_APPROVAL_ROLES: readonly StaffRole[] = [
  "owner",
  "branch_manager",
];

export type ConsumptionReportStatus =
  | "draft"
  | "submitted"
  | "needs_changes"
  | "approved"
  | "applied"
  | "cancelled";

export interface ConsumptionIngredientOption {
  id: number;
  name: string;
  unit: string;
  category: string | null;
  isDefault: boolean;
  defaultItemId: number | null;
  defaultSortOrder: number | null;
  defaultNote: string | null;
}

export interface ConsumptionReportLineView {
  id: number;
  ingredientId: number;
  defaultItemId: number | null;
  ingredientName: string;
  quantity: number;
  unit: string;
  note: string | null;
}

export interface ConsumptionReportView {
  id: number;
  attendanceId: number;
  status: ConsumptionReportStatus;
  note: string | null;
  reviewNote: string | null;
  stockIssueId: number | null;
  noConsumption: boolean;
  submittedAt: string | null;
  reviewedAt: string | null;
  lines: ConsumptionReportLineView[];
}

const consumptionLineSchema = z.object({
  ingredientId: z.coerce.number().int().positive(),
  defaultItemId: z.coerce.number().int().positive().optional().nullable(),
  quantity: z.coerce.number().positive(),
  note: z.string().trim().max(500).optional().nullable(),
});

const submitConsumptionReportSchema = z
  .object({
    attendanceId: z.coerce.number().int().positive(),
    note: z.string().trim().max(1000).optional().nullable(),
    noConsumption: z.boolean().optional().default(false),
    lines: z.array(consumptionLineSchema).max(50),
  })
  .superRefine((value, ctx) => {
    if (value.noConsumption && value.lines.length > 0) {
      ctx.addIssue({
        code: "custom",
        message: "Không phát sinh thì không gửi dòng tiêu hao.",
        path: ["lines"],
      });
    }
    if (!value.noConsumption && value.lines.length === 0) {
      ctx.addIssue({
        code: "custom",
        message: "Nhập ít nhất một dòng tiêu hao.",
        path: ["lines"],
      });
    }
    const seen = new Set<number>();
    for (const line of value.lines) {
      if (seen.has(line.ingredientId)) {
        ctx.addIssue({
          code: "custom",
          message: "Mỗi nguyên liệu chỉ nhập một dòng.",
          path: ["lines"],
        });
      }
      seen.add(line.ingredientId);
    }
  });

const reportIdSchema = z.object({
  reportId: z.coerce.number().int().positive(),
});

const adjustmentSchema = reportIdSchema.extend({
  reviewNote: z.string().trim().min(3).max(1000),
});

function revalidateConsumptionPaths(branchId?: number | null) {
  revalidatePath("/br");
  if (typeof branchId === "number") {
    revalidatePath(`/br/${branchId}`);
    revalidatePath(`/br/${branchId}/shift`);
    revalidatePath(`/br/${branchId}/shift/clock`);
    revalidatePath(`/br/${branchId}/shift/checkout-approvals`);
  }
  revalidatePath("/inventory/issues");
}

function mapSubmitError(message?: string): string {
  if (!message) return "Không thể gửi báo cáo tiêu hao.";
  if (message.includes("checkout_already_requested")) {
    return "Yêu cầu kết ca đã gửi. Nếu cần sửa, quản lý phải yêu cầu điều chỉnh trước.";
  }
  if (message.includes("attendance_not_open")) {
    return "Ca không còn mở để gửi báo cáo tiêu hao.";
  }
  if (message.includes("consumption_checklist_not_assigned")) {
    return "Ca này không yêu cầu báo cáo tiêu hao bếp.";
  }
  if (message.includes("invalid_consumption")) {
    return "Dòng tiêu hao không hợp lệ. Kiểm tra nguyên liệu và số lượng.";
  }
  if (
    message.includes("consumption_lines_required") ||
    message.includes("no_consumption_with_lines")
  ) {
    return "Chọn Không phát sinh hoặc nhập ít nhất một dòng tiêu hao.";
  }
  if (message.includes("consumption_report_locked")) {
    return "Báo cáo tiêu hao đã được duyệt, không thể gửi lại.";
  }
  return "Không thể gửi báo cáo tiêu hao.";
}

function mapReviewError(message?: string): string {
  if (!message) return "Không thể xử lý báo cáo tiêu hao.";
  if (message.includes("forbidden_checkout_approval")) {
    return "Không có quyền duyệt tiêu hao cho chi nhánh này.";
  }
  if (message.includes("consumption_report_not_submitted")) {
    return "Báo cáo tiêu hao chưa ở trạng thái chờ duyệt.";
  }
  if (message.includes("consumption_report_not_reviewable")) {
    return "Báo cáo tiêu hao không còn ở trạng thái có thể yêu cầu chỉnh sửa.";
  }
  if (message.includes("consumption_location_missing")) {
    return "Chi nhánh chưa có vị trí kho để ghi tiêu hao.";
  }
  if (message.includes("insufficient_stock")) {
    return "Tồn kho không đủ để ghi nhận tiêu hao. Kiểm tra lại số lượng.";
  }
  if (message.includes("wac_not_ready")) {
    return "Nguyên liệu chưa có giá vốn WAC để ghi tiêu hao.";
  }
  if (message.includes("review_note_required")) {
    return "Cần nhập lý do yêu cầu chỉnh sửa.";
  }
  return "Không thể xử lý báo cáo tiêu hao.";
}

function normalizeStatus(value: unknown): ConsumptionReportStatus {
  return value === "submitted" ||
    value === "needs_changes" ||
    value === "approved" ||
    value === "applied" ||
    value === "cancelled"
    ? value
    : "draft";
}

async function loadReportByAttendance(
  tenantId: number,
  attendanceId: number,
): Promise<ConsumptionReportView | null> {
  const service = createServiceClient() as unknown as UntypedQuery;
  const { data: report, error } = await service
    .from<ConsumptionReportDbRow>("attendance_consumption_reports")
    .select(
      "id, attendance_record_id, status, note, review_note, stock_issue_id, no_consumption, submitted_at, reviewed_at",
    )
    .eq("tenant_id", tenantId)
    .eq("attendance_record_id", attendanceId)
    .maybeSingle();

  if (error || !report) return null;

  const { data: lines } = await service
    .from<ConsumptionReportLineDbRow[]>("attendance_consumption_report_lines")
    .select(
      "id, ingredient_id, default_item_id, quantity, note, ingredients ( name, ingredient_units!ingredient_units_ingredient_tenant_fkey(is_base, units!ingredient_units_unit_tenant_fkey(code)) )",
    )
    .eq("tenant_id", tenantId)
    .eq("report_id", report.id)
    .order("sort_order");

  return {
    id: report.id,
    attendanceId: report.attendance_record_id,
    status: normalizeStatus(report.status),
    note: report.note ?? null,
    reviewNote: report.review_note ?? null,
    stockIssueId: report.stock_issue_id ?? null,
    noConsumption: report.no_consumption === true,
    submittedAt: report.submitted_at ?? null,
    reviewedAt: report.reviewed_at ?? null,
    lines: (lines ?? []).map((line) => ({
      id: line.id,
      ingredientId: line.ingredient_id,
      defaultItemId: line.default_item_id ?? null,
      ingredientName: line.ingredients?.name ?? `#${line.ingredient_id}`,
      quantity: Number(line.quantity ?? 0),
      unit:
        line.ingredients?.ingredient_units?.find((u) => u.is_base)?.units
          ?.code || "kg",
      note: line.note ?? null,
    })),
  };
}

export async function fetchConsumptionIngredients(
  templateItemId?: number | null,
): Promise<
  ActionResult<ConsumptionIngredientOption[]>
> {
  const parsedTemplateItemId =
    templateItemId == null
      ? null
      : z.coerce.number().int().positive().safeParse(templateItemId);
  if (parsedTemplateItemId && !parsedTemplateItemId.success) {
    return { success: false, error: "Checklist tiêu hao không hợp lệ." };
  }

  const ctx = await getEmployeeContext();
  if (!ctx) return { success: false, error: "Chưa đăng nhập" };

  const service = createServiceClient();
  const defaultTemplateItemId =
    parsedTemplateItemId && parsedTemplateItemId.success
      ? parsedTemplateItemId.data
      : null;

  const [ingredientsResult, defaultsResult] = await Promise.all([
    service
      .from("ingredients")
      .select(
        "id, name, category, ingredient_units!ingredient_units_ingredient_tenant_fkey(is_base, units!ingredient_units_unit_tenant_fkey(code))",
      )
      .eq("tenant_id", ctx.claims.tenant_id)
      .eq("is_active", true)
      .order("name"),
    defaultTemplateItemId
      ? (service as unknown as UntypedQuery)
          .from<ConsumptionDefaultItemDbRow[]>(
            "shift_checklist_consumption_default_items",
          )
          .select("id, ingredient_id, sort_order, note")
          .eq("tenant_id", ctx.claims.tenant_id)
          .eq("template_item_id", defaultTemplateItemId)
          .eq("is_active", true)
          .order("sort_order")
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (ingredientsResult.error) {
    return { success: false, error: "Không thể tải danh sách nguyên liệu." };
  }

  const defaultsByIngredient = new Map<number, ConsumptionDefaultItemDbRow>();
  for (const item of defaultsResult.error ? [] : defaultsResult.data ?? []) {
    defaultsByIngredient.set(item.ingredient_id, item);
  }

  return {
    success: true,
    data: (ingredientsResult.data ?? []).map((item) => {
      const defaultItem = defaultsByIngredient.get(item.id);
      return {
        id: item.id,
        name: item.name,
        unit:
          item.ingredient_units?.find((u) => u.is_base)?.units?.code || "kg",
        category: item.category ?? null,
        isDefault: Boolean(defaultItem),
        defaultItemId: defaultItem?.id ?? null,
        defaultSortOrder: defaultItem?.sort_order ?? null,
        defaultNote: defaultItem?.note ?? null,
      };
    }),
  };
}

export async function fetchConsumptionReportForAttendance(
  attendanceId: number,
): Promise<ActionResult<ConsumptionReportView | null>> {
  const parsed = z.coerce.number().int().positive().safeParse(attendanceId);
  if (!parsed.success) return { success: false, error: "ID ca không hợp lệ" };

  const ctx = await getEmployeeContext();
  if (!ctx) return { success: false, error: "Chưa đăng nhập" };

  const service = createServiceClient();
  const { data: attendance } = await service
    .from("attendance_records")
    .select("id")
    .eq("id", parsed.data)
    .eq("tenant_id", ctx.claims.tenant_id)
    .eq("employee_id", ctx.employeeId)
    .maybeSingle();

  if (!attendance) return { success: false, error: "Không tìm thấy ca." };

  return {
    success: true,
    data: await loadReportByAttendance(ctx.claims.tenant_id, parsed.data),
  };
}

export async function submitConsumptionReport(
  input: unknown,
): Promise<ActionResult<{ reportId: number }>> {
  const parsed = submitConsumptionReportSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const ctx = await getEmployeeContext();
  if (!ctx) return { success: false, error: "Chưa đăng nhập" };

  const rpc = ctx.supabase as unknown as RpcClient;
  const { data, error } = await rpc.rpc("employee_submit_consumption_report", {
    p_tenant_id: ctx.claims.tenant_id,
    p_attendance_id: parsed.data.attendanceId,
    p_note: parsed.data.note ?? null,
    p_lines: parsed.data.lines.map((line) => ({
      ingredient_id: line.ingredientId,
      quantity: line.quantity,
      default_item_id: line.defaultItemId ?? null,
      note: line.note ?? null,
    })),
    p_no_consumption: parsed.data.noConsumption,
  });

  if (error || typeof data !== "number") {
    return { success: false, error: mapSubmitError(error?.message) };
  }

  revalidateConsumptionPaths(ctx.branchId);
  return { success: true, data: { reportId: data } };
}

export async function approveConsumptionReport(
  input: unknown,
): Promise<ActionResult<{ stockIssueId: number | null }>> {
  const parsed = reportIdSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "ID không hợp lệ" };

  const ctx = await getAuthContext(CHECKOUT_APPROVAL_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const rpc = ctx.supabase as unknown as RpcClient;
  const { data, error } = await rpc.rpc("branch_manager_approve_consumption_report", {
    p_tenant_id: ctx.claims.tenant_id,
    p_report_id: parsed.data.reportId,
  });

  if (error) return { success: false, error: mapReviewError(error.message) };

  const payload =
    data && typeof data === "object" ? (data as { stock_issue_id?: unknown }) : {};
  const stockIssueId =
    typeof payload.stock_issue_id === "number" ? payload.stock_issue_id : null;

  revalidateConsumptionPaths();
  return { success: true, data: { stockIssueId } };
}

export async function requestConsumptionAdjustment(
  input: unknown,
): Promise<ActionResult> {
  const parsed = adjustmentSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const ctx = await getAuthContext(CHECKOUT_APPROVAL_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const rpc = ctx.supabase as unknown as RpcClient;
  const { error } = await rpc.rpc("branch_manager_request_consumption_adjustment", {
    p_tenant_id: ctx.claims.tenant_id,
    p_report_id: parsed.data.reportId,
    p_review_note: parsed.data.reviewNote,
  });

  if (error) return { success: false, error: mapReviewError(error.message) };

  revalidateConsumptionPaths();
  return { success: true };
}

export async function canApproveConsumptionForBranch(
  branchId: number | null,
): Promise<boolean> {
  const ctx = await getAuthContext(CHECKOUT_APPROVAL_ROLES);
  if (!ctx) return false;

  const { data, error } =
    branchId == null
      ? await ctx.supabase.rpc("has_permission_any", {
          p_key: PERMISSION_KEYS.HR_APPROVE_CHECKOUT,
        })
      : await ctx.supabase.rpc("has_permission", {
          p_branch_id: branchId,
          p_key: PERMISSION_KEYS.HR_APPROVE_CHECKOUT,
        });

  return !error && data === true;
}
