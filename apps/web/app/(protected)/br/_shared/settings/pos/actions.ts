"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  BRANCH_FLOOR_SETTINGS_ROLES,
  PERMISSION_KEYS,
  type StaffRole,
} from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import {
  type ActionContext,
  withActionPositional,
  withFormAction,
} from "@/_lib/with-action";
import { INVENTORY_FEATURE_FLAGS } from "@/(protected)/inventory/_lib/feature-flags";
import { canOperateBranch, verifyBranchOwnership } from "../branch-guards";

const SETTINGS_ROLES: readonly StaffRole[] = BRANCH_FLOOR_SETTINGS_ROLES;
const OWNER_ONLY_ROLES: readonly StaffRole[] = ["owner"];

/* ─── Helpers ─── */

function revalidatePosSettings(branchId: number) {
  revalidatePath(`/br/${String(branchId)}/settings/pos`);
}

function mapTerminalDbError(code: string | undefined): string {
  if (code === "23505") return "Tên máy POS đã tồn tại ở chi nhánh này";
  if (code === "23503") return "Dữ liệu tham chiếu không hợp lệ";
  return "Không thể thực hiện. Vui lòng thử lại.";
}

/* ─── Schemas ─── */

const createTerminalSchema = z.object({
  name: z.string().min(1, { error: "Tên đăng ký không được để trống" }),
  branch_id: z.coerce.number().int().positive({ error: "Chọn chi nhánh" }),
});

const updateTerminalSchema = z.object({
  id: z.coerce.number().int().positive(),
  name: z.string().min(1, { error: "Tên đăng ký không được để trống" }),
  is_active: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
});

/* ─── Actions ─── */

export const createTerminal = withFormAction(
  {
    roles: SETTINGS_ROLES,
    schema: createTerminalSchema,
    permission: PERMISSION_KEYS.SETTINGS_BRANCH,
    permissionBranchId: (data) => data.branch_id,
    requireBranchScope: true,
    extract: (fd) => ({
      name: fd.get("name"),
      branch_id: fd.get("branch_id"),
    }),
  },
  async (data, { supabase, claims }) => {
    if (!canOperateBranch(claims.branch_id, data.branch_id)) {
      return { success: false, error: "Không có quyền thao tác chi nhánh này" };
    }

    if (
      !(await verifyBranchOwnership(supabase, data.branch_id, claims.tenant_id))
    ) {
      return { success: false, error: "Chi nhánh không hợp lệ" };
    }

    const { data: result, error } = await supabase
      .from("pos_terminals")
      .insert({
        tenant_id: claims.tenant_id,
        branch_id: data.branch_id,
        name: data.name,
      })
      .select("id");

    if (error) {
      console.error("[branch-settings/pos:createTerminal] Insert POS terminal error:", error);
      return { success: false, error: mapTerminalDbError(error.code) };
    }

    if (!result || result.length === 0) {
      return {
        success: false,
        error: "Không thể tạo máy POS. Kiểm tra quyền truy cập.",
      };
    }

    revalidatePosSettings(data.branch_id);
    return { success: true, data: { id: result[0]!.id } };
  },
);

export const updateTerminal = withFormAction(
  {
    roles: SETTINGS_ROLES,
    schema: updateTerminalSchema,
    permission: PERMISSION_KEYS.SETTINGS_BRANCH,
    requireBranchScope: true,
    extract: (fd) => {
      const rawIsActive = fd.get("is_active");
      return {
        id: fd.get("id"),
        name: fd.get("name"),
        is_active: rawIsActive ? rawIsActive : undefined,
      };
    },
  },
  async (data, { supabase, claims }) => {
    const updatePayload: {
      name: string;
      is_active?: boolean;
    } = {
      name: data.name,
    };

    if (data.is_active !== undefined) {
      updatePayload.is_active = data.is_active;
    }

    let query = supabase
      .from("pos_terminals")
      .update(updatePayload)
      .eq("id", data.id)
      .eq("tenant_id", claims.tenant_id);

    if (claims.branch_id !== null) {
      query = query.eq("branch_id", claims.branch_id);
    }

    const { data: result, error } = await query.select("id, branch_id");

    if (error) {
      console.error("[branch-settings/pos:updateTerminal] Update POS terminal error:", error);
      return { success: false, error: mapTerminalDbError(error.code) };
    }

    if (!result || result.length === 0) {
      return {
        success: false,
        error: "Máy POS không tồn tại hoặc không có quyền",
      };
    }

    revalidatePosSettings(result[0]!.branch_id);
    return { success: true };
  },
);

/* ─── Feature-flag upserts (stock posting, stock gate) ─── */

const featureFlagSchema = z.object({
  branchId: z.coerce.number().int().positive({ error: "Chọn chi nhánh" }),
  enabled: z.boolean(),
});

function upsertBranchFeatureFlag(
  supabase: ActionContext["supabase"],
  branchId: number,
  flagKey: string,
  enabled: boolean,
  userId: string,
) {
  const now = new Date().toISOString();
  return supabase.from("branch_feature_flags").upsert(
    {
      branch_id: branchId,
      flag_key: flagKey,
      enabled,
      enabled_by: userId,
      enabled_at: enabled ? now : null,
      disabled_at: enabled ? null : now,
      updated_at: now,
    },
    { onConflict: "branch_id,flag_key" },
  );
}

export const setBranchStockOutcomePosting = withActionPositional(
  {
    roles: OWNER_ONLY_ROLES,
    schema: featureFlagSchema,
    permission: PERMISSION_KEYS.SETTINGS_BRANCH,
    permissionBranchId: (data) => data.branchId,
    requireBranchScope: true,
    argsToInput: (branchId: number, enabled: boolean) => ({
      branchId,
      enabled,
    }),
  },
  async (data, { supabase, claims, user }): Promise<ActionResult> => {
    if (!canOperateBranch(claims.branch_id, data.branchId)) {
      return { success: false, error: "Không có quyền thao tác chi nhánh này" };
    }

    if (
      !(await verifyBranchOwnership(supabase, data.branchId, claims.tenant_id))
    ) {
      return { success: false, error: "Chi nhánh không hợp lệ" };
    }

    const { error } = await upsertBranchFeatureFlag(
      supabase,
      data.branchId,
      INVENTORY_FEATURE_FLAGS.POS_STOCK_OUTCOME_POSTING,
      data.enabled,
      user.id,
    );

    if (error) {
      console.error("[branch-settings/pos:setBranchStockOutcomePosting] Upsert stock outcome posting flag error:", error);
      return { success: false, error: "Không thể lưu cấu hình. Vui lòng thử lại." };
    }

    revalidatePosSettings(data.branchId);
    return { success: true };
  },
);
