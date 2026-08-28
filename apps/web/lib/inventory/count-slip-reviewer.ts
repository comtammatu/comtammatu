import "server-only";

import { cache } from "react";
import { createServiceClient } from "@comtammatu/database/supabase/service";

export const resolveCountSlipReviewerEmployeeId = cache(
  async function resolveCountSlipReviewerEmployeeId(
    tenantId: number,
    userId: string,
  ): Promise<number | null> {
    const { data, error } = await createServiceClient()
      .from("employees")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("profile_id", userId)
      .maybeSingle();

    if (error) {
      console.error("inventory.count_slips.reviewer_employee_fetch_failed", {
        code: error.code,
      });
      return null;
    }

    const employeeId = Number(data?.id);
    return Number.isSafeInteger(employeeId) && employeeId > 0
      ? employeeId
      : null;
  },
);
