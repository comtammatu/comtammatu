"use server";

import { z } from "zod";
import { MODULE_ACL, PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { withAction } from "@/_lib/with-action";
import { branchDayReportSchema } from "./data";

const schema = z.object({
  branchId: z.coerce.number().int().positive(),
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const loadCloseDayReportDetail = withAction(
  {
    roles: MODULE_ACL.branch_close_day.allowedRoles,
    schema,
    anyPermission: [
      PERMISSION_KEYS.SETTINGS_BRANCH,
      PERMISSION_KEYS.FINANCE_VIEW,
    ],
    permissionBranchId: (data) => data.branchId,
  },
  async (data, { supabase }) => {
    const { data: raw, error } = await supabase.rpc("get_branch_day_report", {
      p_branch_id: data.branchId,
      p_business_date: data.businessDate,
    });
    if (error) {
      console.error("close-day.report_detail_failed", { code: error.code });
      return { success: false, error: "Không tải được chi tiết ngày." };
    }
    const parsed = branchDayReportSchema.safeParse(raw);
    if (!parsed.success) {
      return { success: false, error: "Không tải được chi tiết ngày." };
    }
    return { success: true, data: parsed.data };
  },
);
