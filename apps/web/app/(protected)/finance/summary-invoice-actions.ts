"use server";

/**
 * Admin manual trigger + queue dashboard for daily B2C summary HĐĐT.
 *
 * Counterpart to the Vercel cron route at
 * apps/web/app/api/cron/hddt-daily-summary/route.ts. Both share
 * apps/web/lib/hddt-daily-summary.ts::executeSummaryRun().
 *
 * Permission gates:
 *   - runDailySummaryForBranch: settings:tenant + branch scope
 *   - listSummaryRunQueue:      finance:view
 *
 * Feature flag: HDDT_DAILY_SUMMARY_ENABLED=true required. Default off until
 * PR-6 cutover.
 *
 * Service-role client is used for the privileged DB ops (queue write +
 * tax_invoices state machine + tax_invoice_orders junction). Permission
 * is enforced HERE at the action layer BEFORE the service-role escalation.
 */

import { z } from "zod";
import { PERMISSION_KEYS, type StaffRole } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { createServiceClient } from "@comtammatu/database/supabase/service";
import { getInvoiceProvider } from "@comtammatu/shared/providers";
import { getVNDateStringDaysAgo } from "@comtammatu/shared/time";
import { ensureInvoiceProviderRegistered } from "@lib/invoice-provider-init";
import { executeSummaryRun } from "@lib/hddt-daily-summary";
import { getAuthContextWithPermission } from "@/_lib/auth";
import { canAccessBranch } from "@/_lib/branch-scope";

const FINANCE_ROLES: readonly StaffRole[] = ["owner", "super_manager"];
const READ_ROLES: readonly StaffRole[] = [
  "owner",
  "super_manager",
  "area_manager",
  "branch_manager",
];

const runSchema = z.object({
  branchId: z.coerce.number().int().positive(),
  summaryDate: z.string().date(),
});

export async function runDailySummaryForBranch(
  branchId: number,
  summaryDate: string,
): Promise<ActionResult> {
  const enabled =
    (process.env["HDDT_DAILY_SUMMARY_ENABLED"] ?? "false") === "true";
  if (!enabled) {
    return {
      success: false,
      error: "Tính năng HĐĐT tổng hợp B2C chưa được kích hoạt.",
    };
  }

  const parsed = runSchema.safeParse({ branchId, summaryDate });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const ctx = await getAuthContextWithPermission(
    FINANCE_ROLES,
    PERMISSION_KEYS.SETTINGS_TENANT,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase: authSupabase, claims, user } = ctx;

  if (!(await canAccessBranch(authSupabase, claims, parsed.data.branchId))) {
    return {
      success: false,
      error: "Không có quyền tạo HĐ tổng hợp cho chi nhánh này.",
    };
  }

  ensureInvoiceProviderRegistered();
  const provider = getInvoiceProvider();
  if (!provider) {
    return {
      success: false,
      error: "Provider HĐĐT chưa được cấu hình.",
    };
  }

  // Service-role client for the privileged DB ops (queue + state machine +
  // tax_invoices update). Permission already enforced above.
  const supabase = createServiceClient();

  const { data: queueRow, error: queueErr } = await supabase
    .from("summary_run_queue")
    .insert({
      tenant_id: claims.tenant_id,
      branch_id: parsed.data.branchId,
      summary_date: parsed.data.summaryDate,
      trigger_source: "manual",
      triggered_by: user.id,
      status: "running",
      attempt_count: 1,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (queueErr || !queueRow) {
    return {
      success: false,
      error: "Không thể ghi nhận yêu cầu xử lý.",
    };
  }

  const result = await executeSummaryRun({
    supabase,
    provider,
    branchId: parsed.data.branchId,
    summaryDate: parsed.data.summaryDate,
    queueId: queueRow.id,
  });

  if (result.outcome === "failed") {
    return {
      success: false,
      error: "Xử lý HĐ tổng hợp thất bại. Kiểm tra dashboard hàng đợi.",
    };
  }

  return {
    success: true,
    data: {
      outcome: result.outcome,
      tax_invoice_id: result.taxInvoiceId,
      queue_id: queueRow.id,
    },
  };
}

const listSchema = z.object({
  branchId: z.coerce.number().int().positive().nullable(),
  daysBack: z.coerce.number().int().min(1).max(180),
});

export async function listSummaryRunQueue(
  branchId: number | null = null,
  daysBack: number = 30,
): Promise<ActionResult> {
  const parsed = listSchema.safeParse({ branchId, daysBack });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Tham số không hợp lệ",
    };
  }

  const ctx = await getAuthContextWithPermission(
    READ_ROLES,
    PERMISSION_KEYS.FINANCE_VIEW,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  const cutoffStr = getVNDateStringDaysAgo(parsed.data.daysBack);

  let query = supabase
    .from("summary_run_queue")
    .select(
      "id, branch_id, summary_date, status, trigger_source, triggered_by, attempt_count, last_error, tax_invoice_id, started_at, finished_at, created_at",
    )
    .eq("tenant_id", claims.tenant_id)
    .gte("summary_date", cutoffStr)
    .order("created_at", { ascending: false })
    .limit(500);

  if (parsed.data.branchId !== null) {
    query = query.eq("branch_id", parsed.data.branchId);
  }

  const { data, error } = await query;
  if (error) {
    return { success: false, error: "Không thể tải hàng đợi." };
  }

  return { success: true, data: data ?? [] };
}
