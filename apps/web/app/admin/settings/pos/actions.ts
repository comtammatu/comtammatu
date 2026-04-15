"use server";

import { z } from "zod";
import {
  BRANCH_FLOOR_SETTINGS_ROLES,
  type StaffRole,
} from "@comtammatu/shared/auth";
import { revalidateSurfacePath } from "@/_lib/revalidate-surface";
import { withFormAction, type ActionContext } from "@/_lib/with-action";

const SETTINGS_ROLES: readonly StaffRole[] = BRANCH_FLOOR_SETTINGS_ROLES;

/* ─── Helpers ─── */

async function verifyBranchOwnership(
  supabase: ActionContext["supabase"],
  branchId: number,
  tenantId: number,
): Promise<boolean> {
  const { data } = await supabase
    .from("branches")
    .select("id")
    .eq("id", branchId)
    .eq("tenant_id", tenantId)
    .single();
  return !!data;
}

function canOperateBranch(
  claimsBranchId: number | null,
  targetBranchId: number,
): boolean {
  if (claimsBranchId === null) return true;
  return claimsBranchId === targetBranchId;
}

function mapTerminalDbError(code: string | undefined): string {
  if (code === "23505") return "Tên máy POS đã tồn tại ở chi nhánh này";
  if (code === "23503") return "Dữ liệu tham chiếu không hợp lệ";
  return "Không thể thực hiện. Vui lòng thử lại.";
}

/* ─── Schemas ─── */

const optionalDeviceId = z
  .string()
  .optional()
  .transform((s) => {
    if (s === undefined || s === "") return null;
    const t = s.trim();
    return t === "" ? null : t;
  });

const createTerminalSchema = z.object({
  name: z.string().min(1, { error: "Tên máy không được để trống" }),
  branch_id: z.coerce.number().int().positive({ error: "Chọn chi nhánh" }),
  device_id: optionalDeviceId,
});

const updateTerminalSchema = z.object({
  id: z.coerce.number().int().positive(),
  name: z.string().min(1, { error: "Tên máy không được để trống" }),
  device_id: optionalDeviceId,
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
    extract: (fd) => ({
      name: fd.get("name"),
      branch_id: fd.get("branch_id"),
      device_id: fd.get("device_id") ?? undefined,
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
        device_id: data.device_id,
      })
      .select("id");

    if (error) {
      return { success: false, error: mapTerminalDbError(error.code) };
    }

    if (!result || result.length === 0) {
      return {
        success: false,
        error: "Không thể tạo máy POS. Kiểm tra quyền truy cập.",
      };
    }

    revalidateSurfacePath("/admin/settings/pos");
    return { success: true, data: { id: result[0]!.id } };
  },
);

export const updateTerminal = withFormAction(
  {
    roles: SETTINGS_ROLES,
    schema: updateTerminalSchema,
    extract: (fd) => {
      const rawIsActive = fd.get("is_active");
      return {
        id: fd.get("id"),
        name: fd.get("name"),
        device_id: fd.get("device_id") ?? undefined,
        is_active: rawIsActive ? rawIsActive : undefined,
      };
    },
  },
  async (data, { supabase, claims }) => {
    const updatePayload: {
      name: string;
      device_id: string | null;
      is_active?: boolean;
    } = {
      name: data.name,
      device_id: data.device_id,
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

    const { data: result, error } = await query.select("id");

    if (error) {
      return { success: false, error: mapTerminalDbError(error.code) };
    }

    if (!result || result.length === 0) {
      return {
        success: false,
        error: "Máy POS không tồn tại hoặc không có quyền",
      };
    }

    revalidateSurfacePath("/admin/settings/pos");
    return { success: true };
  },
);
