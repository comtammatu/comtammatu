"use server";

import { getAuthContext } from "@/_lib/auth";
import { getAppUrl, getCronSecret } from "@comtammatu/shared/feedback";
import type { ActionResult } from "@comtammatu/shared/types";

const OWNER_ONLY: readonly ["owner"] = ["owner"];

/**
 * Trigger the daily report cron manually. Owner-only.
 * Calls the internal cron route with CRON_SECRET.
 */
export async function triggerDailyReportNow(): Promise<
  ActionResult<{ report_date: string; reports_generated: number }>
> {
  const ctx = await getAuthContext(OWNER_ONLY);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const appUrl = getAppUrl();
  const cronSecret = getCronSecret();

  if (!appUrl || !cronSecret) {
    return { success: false, error: "Chưa cấu hình CRON_SECRET hoặc APP_URL" };
  }

  let res: Response;
  try {
    res = await fetch(`${appUrl}/api/cron/feedback-daily-report`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cronSecret}` },
      cache: "no-store",
    });
  } catch {
    return { success: false, error: "Không thể gọi cron worker" };
  }

  if (!res.ok) {
    return { success: false, error: "Cron worker trả lỗi" };
  }

  let json: { report_date?: string; reports_generated?: number } = {};
  try {
    json = (await res.json()) as typeof json;
  } catch {
    // ignore parse error
  }

  return {
    success: true,
    data: {
      report_date: json.report_date ?? "",
      reports_generated: json.reports_generated ?? 0,
    },
  };
}
