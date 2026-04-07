"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@comtammatu/database/supabase/server";
import {
  BRANCH_FLOOR_SETTINGS_ROLES,
  type StaffRole,
} from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getAuthContext } from "../../_lib/auth";

const SETTINGS_ROLES: readonly StaffRole[] = BRANCH_FLOOR_SETTINGS_ROLES;

async function verifyBranchOwnership(
  supabase: Awaited<ReturnType<typeof createClient>>,
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

export async function createTerminal(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = createTerminalSchema.safeParse({
    name: formData.get("name"),
    branch_id: formData.get("branch_id"),
    device_id: formData.get("device_id") ?? undefined,
  });

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const ctx = await getAuthContext(SETTINGS_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  if (!canOperateBranch(claims.branch_id, parsed.data.branch_id)) {
    return { success: false, error: "Không có quyền thao tác chi nhánh này" };
  }

  if (
    !(await verifyBranchOwnership(
      supabase,
      parsed.data.branch_id,
      claims.tenant_id,
    ))
  ) {
    return { success: false, error: "Chi nhánh không hợp lệ" };
  }

  const { data, error } = await supabase
    .from("pos_terminals")
    .insert({
      tenant_id: claims.tenant_id,
      branch_id: parsed.data.branch_id,
      name: parsed.data.name,
      device_id: parsed.data.device_id,
    })
    .select("id");

  if (error) {
    return { success: false, error: mapTerminalDbError(error.code) };
  }

  if (!data || data.length === 0) {
    return {
      success: false,
      error: "Không thể tạo máy POS. Kiểm tra quyền truy cập.",
    };
  }

  revalidatePath("/admin/settings/pos");
  return { success: true, data: { id: data[0]!.id } };
}

export async function updateTerminal(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const rawIsActive = formData.get("is_active");

  const parsed = updateTerminalSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    device_id: formData.get("device_id") ?? undefined,
    is_active: rawIsActive ? rawIsActive : undefined,
  });

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const ctx = await getAuthContext(SETTINGS_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  const updatePayload: {
    name: string;
    device_id: string | null;
    is_active?: boolean;
  } = {
    name: parsed.data.name,
    device_id: parsed.data.device_id,
  };

  if (parsed.data.is_active !== undefined) {
    updatePayload.is_active = parsed.data.is_active;
  }

  let query = supabase
    .from("pos_terminals")
    .update(updatePayload)
    .eq("id", parsed.data.id)
    .eq("tenant_id", claims.tenant_id);

  if (claims.branch_id !== null) {
    query = query.eq("branch_id", claims.branch_id);
  }

  const { data, error } = await query.select("id");

  if (error) {
    return { success: false, error: mapTerminalDbError(error.code) };
  }

  if (!data || data.length === 0) {
    return {
      success: false,
      error: "Máy POS không tồn tại hoặc không có quyền",
    };
  }

  revalidatePath("/admin/settings/pos");
  return { success: true };
}
