"use server";

import { z } from "zod";
import {
  PERMISSION_KEYS,
  TENANT_STRATEGY_SETTINGS_ROLES,
} from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getAuthContextWithPermission } from "@/_lib/auth";
import { revalidateSurfacePath } from "@/_lib/revalidate-surface";
import { messages } from "@lib/messages";
import { holidaySurchargeFormSchema } from "./schema";

type RpcResult = PromiseLike<{
  data: unknown;
  error: { code?: string | null } | null;
}>;

type HolidaySurchargeRpcClient = {
  rpc: (name: string, args: Record<string, unknown>) => RpcResult;
};

const toggleSchema = z.object({
  policyId: z.number().int().positive(),
  isActive: z.boolean(),
});

function localDateTimeToIso(value: string): string | null {
  const date = new Date(`${value}:00+07:00`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function upsertHolidaySurchargePolicy(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const raw = {
    policy_id: formData.get("policy_id")?.toString() || undefined,
    name: (formData.get("name") ?? "").toString(),
    branch_scope: (formData.get("branch_scope") ?? "").toString(),
    calculation_type: (formData.get("calculation_type") ?? "").toString(),
    value: (formData.get("value") ?? "").toString(),
    starts_at_local: (formData.get("starts_at_local") ?? "").toString(),
    ends_at_local: (formData.get("ends_at_local") ?? "").toString(),
    is_active: (formData.get("is_active") ?? "").toString(),
  };
  const parsed = holidaySurchargeFormSchema.safeParse(raw);

  if (!parsed.success) {
    return {
      success: false,
      error:
        parsed.error.issues[0]?.message ??
        messages.settings.holidaySurcharges.invalid,
    };
  }

  const startsAt = localDateTimeToIso(parsed.data.starts_at_local);
  const endsAt = localDateTimeToIso(parsed.data.ends_at_local);
  if (!startsAt || !endsAt || endsAt <= startsAt) {
    return {
      success: false,
      error: messages.settings.holidaySurcharges.invalidTime,
    };
  }

  const context = await getAuthContextWithPermission(
    TENANT_STRATEGY_SETTINGS_ROLES,
    PERMISSION_KEYS.SETTINGS_TENANT,
  );
  if (!context) {
    return { success: false, error: "Không có quyền" };
  }

  const rpc = context.supabase as unknown as HolidaySurchargeRpcClient;
  const { error } = await rpc.rpc("upsert_holiday_surcharge_policy", {
    p_policy_id: parsed.data.policy_id ? Number(parsed.data.policy_id) : null,
    p_name: parsed.data.name,
    p_branch_id:
      parsed.data.branch_scope === "tenant"
        ? null
        : Number(parsed.data.branch_scope),
    p_calculation_type: parsed.data.calculation_type,
    p_value: Number(parsed.data.value),
    p_starts_at: startsAt,
    p_ends_at: endsAt,
    p_is_active: parsed.data.is_active === "true",
  });

  if (error) {
    return {
      success: false,
      error:
        error.code === "23P01"
          ? messages.settings.holidaySurcharges.overlap
          : messages.settings.holidaySurcharges.saveFailed,
    };
  }

  revalidateSurfacePath("/settings/holiday-surcharges");
  return { success: true };
}

export async function setHolidaySurchargePolicyActive(
  policyId: number,
  isActive: boolean,
): Promise<ActionResult> {
  const parsed = toggleSchema.safeParse({ policyId, isActive });
  if (!parsed.success) {
    return {
      success: false,
      error: messages.settings.holidaySurcharges.invalid,
    };
  }

  const context = await getAuthContextWithPermission(
    TENANT_STRATEGY_SETTINGS_ROLES,
    PERMISSION_KEYS.SETTINGS_TENANT,
  );
  if (!context) {
    return { success: false, error: "Không có quyền" };
  }

  const rpc = context.supabase as unknown as HolidaySurchargeRpcClient;
  const { error } = await rpc.rpc("set_holiday_surcharge_policy_active", {
    p_policy_id: parsed.data.policyId,
    p_is_active: parsed.data.isActive,
  });

  if (error) {
    return {
      success: false,
      error:
        error.code === "23P01"
          ? messages.settings.holidaySurcharges.overlap
          : messages.settings.holidaySurcharges.toggleFailed,
    };
  }

  revalidateSurfacePath("/settings/holiday-surcharges");
  return { success: true };
}
