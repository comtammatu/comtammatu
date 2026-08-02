import "server-only";

import {
  SYSTEM_SETTING_DEFAULTS,
  SYSTEM_SETTING_KEYS,
} from "@comtammatu/shared/settings";
import type { TenantSupabase } from "@lib/inventory/types";
import { hrLeavePolicySchema, type HrLeavePolicy } from "./leave-policy-model";

const HR_LEAVE_POLICY_SETTING_KEYS = [
  SYSTEM_SETTING_KEYS.HR_STANDARD_WORKDAYS,
  SYSTEM_SETTING_KEYS.HR_MONTHLY_LEAVE_DAYS,
] as const;

export type HrLeavePolicyResult =
  | { success: true; data: HrLeavePolicy; isPersisted: boolean }
  | { success: false };

export async function fetchTenantHrLeavePolicy(input: {
  supabase: TenantSupabase;
  tenantId: number;
}): Promise<HrLeavePolicyResult> {
  const { data, error } = await input.supabase
    .from("system_settings")
    .select("key, value")
    .eq("tenant_id", input.tenantId)
    .in("key", HR_LEAVE_POLICY_SETTING_KEYS);

  if (error) return { success: false };

  const values = new Map(data.map((row) => [row.key, row.value]));

  const policy = hrLeavePolicySchema.safeParse({
    standardWorkdays:
      values.get(SYSTEM_SETTING_KEYS.HR_STANDARD_WORKDAYS) ??
      SYSTEM_SETTING_DEFAULTS[SYSTEM_SETTING_KEYS.HR_STANDARD_WORKDAYS],
    monthlyLeaveDays:
      values.get(SYSTEM_SETTING_KEYS.HR_MONTHLY_LEAVE_DAYS) ??
      SYSTEM_SETTING_DEFAULTS[SYSTEM_SETTING_KEYS.HR_MONTHLY_LEAVE_DAYS],
  });

  return policy.success
    ? {
        success: true,
        data: policy.data,
        isPersisted: HR_LEAVE_POLICY_SETTING_KEYS.every((key) =>
          values.has(key),
        ),
      }
    : { success: false };
}
