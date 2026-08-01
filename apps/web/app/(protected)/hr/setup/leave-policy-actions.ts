"use server";

import { revalidatePath } from "next/cache";
import {
  PERMISSION_KEYS,
  STAFF_ROLES,
  type StaffRole,
} from "@comtammatu/shared/auth";
import { SYSTEM_SETTING_KEYS } from "@comtammatu/shared/settings";
import { messages } from "@lib/messages";
import { getAuthContextWithPermission } from "@/_lib/auth";
import { withAction } from "@/_lib/with-action";
import { fetchTenantHrLeavePolicy } from "@lib/hr/leave-policy-data";
import { hrLeavePolicySchema } from "@lib/hr/leave-policy-model";

const SETUP_ROLES: readonly StaffRole[] = STAFF_ROLES;

export async function fetchHrLeavePolicy() {
  const context = await getAuthContextWithPermission(
    SETUP_ROLES,
    PERMISSION_KEYS.HR_MANAGE_LEAVE_POLICY,
  );
  if (!context)
    return {
      success: false as const,
      error: messages.hr.client.leavePolicy.loadFailed,
    };

  const result = await fetchTenantHrLeavePolicy({
    supabase: context.supabase,
    tenantId: context.claims.tenant_id,
  });
  return result.success
    ? { success: true as const, data: result.data }
    : {
        success: false as const,
        error: messages.hr.client.leavePolicy.loadFailed,
      };
}

export const saveHrLeavePolicy = withAction(
  {
    roles: SETUP_ROLES,
    schema: hrLeavePolicySchema,
    permission: PERMISSION_KEYS.HR_MANAGE_LEAVE_POLICY,
  },
  async (data, { supabase, claims }) => {
    const { error } = await supabase.from("system_settings").upsert(
      [
        {
          tenant_id: claims.tenant_id,
          key: SYSTEM_SETTING_KEYS.HR_STANDARD_WORKDAYS,
          value: data.standardWorkdays.toString(),
        },
        {
          tenant_id: claims.tenant_id,
          key: SYSTEM_SETTING_KEYS.HR_MONTHLY_LEAVE_DAYS,
          value: data.monthlyLeaveDays.toString(),
        },
      ],
      { onConflict: "key,tenant_id" },
    );

    if (error) {
      console.error("hr.leave_policy.save_failed", { code: error.code });
      return {
        success: false,
        error: messages.hr.client.leavePolicy.saveFailed,
      };
    }

    revalidatePath("/hr");
    revalidatePath("/hr/attendance");
    revalidatePath("/hr/payroll");
    revalidatePath("/hr/setup");
    revalidatePath("/me/schedule");
    return { success: true };
  },
);
