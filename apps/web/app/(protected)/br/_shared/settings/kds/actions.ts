"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  BRANCH_FLOOR_SETTINGS_ROLES,
  PERMISSION_KEYS,
  type StaffRole,
} from "@comtammatu/shared/auth";
import type { TablesUpdate } from "@comtammatu/database/types";
import { withAction, withFormAction } from "@/_lib/with-action";
import { canOperateBranch, verifyBranchOwnership } from "../branch-guards";

function revalidateKdsSettings(branchId: number) {
  revalidatePath(`/br/${String(branchId)}/settings/kds`);
}

/* ─── Helpers ─── */

const SETTINGS_ROLES: readonly StaffRole[] = BRANCH_FLOOR_SETTINGS_ROLES;

function mapStationDbError(code: string | undefined): string {
  if (code === "23505") return "Tên trạm KDS đã tồn tại";
  if (code === "23503") return "Dữ liệu tham chiếu không hợp lệ";
  return "Không thể thực hiện. Vui lòng thử lại.";
}

/* ─── Schemas ─── */

const createStationSchema = z.object({
  name: z.string().min(1, { error: "Tên trạm không được để trống" }),
  branch_id: z.coerce.number().int().positive({ error: "Chọn chi nhánh" }),
  position: z.coerce.number().int().min(0).default(0),
});

const updateStationSchema = z.object({
  id: z.coerce.number().int().positive(),
  name: z.string().min(1, { error: "Tên trạm không được để trống" }),
  position: z.coerce.number().int().min(0).default(0),
  is_active: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
});

const saveStationCategoriesSchema = z.object({
  stationId: z.coerce
    .number()
    .int()
    .positive({ error: "Mã trạm không hợp lệ" }),
  categoryIds: z.array(z.coerce.number().int().positive()),
});

/* ─── Actions ─── */

export const createStation = withFormAction(
  {
    roles: SETTINGS_ROLES,
    schema: createStationSchema,
    permission: PERMISSION_KEYS.SETTINGS_BRANCH,
    permissionBranchId: (data) => data.branch_id,
    requireBranchScope: true,
    extract: (fd) => ({
      name: fd.get("name"),
      branch_id: fd.get("branch_id"),
      position: fd.get("position") || 0,
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
      .from("kds_stations")
      .insert({
        tenant_id: claims.tenant_id,
        branch_id: data.branch_id,
        name: data.name,
        position: data.position,
      })
      .select("id");

    if (error) {
      console.error("[branch-settings/kds:createStation] Insert station error:", error);
      return { success: false, error: mapStationDbError(error.code) };
    }

    if (!result || result.length === 0) {
      return {
        success: false,
        error: "Không thể tạo trạm KDS. Kiểm tra quyền truy cập.",
      };
    }

    revalidateKdsSettings(data.branch_id);
    return { success: true, data: { id: result[0]!.id } };
  },
);

export const updateStation = withFormAction(
  {
    roles: SETTINGS_ROLES,
    schema: updateStationSchema,
    permission: PERMISSION_KEYS.SETTINGS_BRANCH,
    requireBranchScope: true,
    extract: (fd) => {
      const rawIsActive = fd.get("is_active");
      return {
        id: fd.get("id"),
        name: fd.get("name"),
        position: fd.get("position") || 0,
        is_active: rawIsActive ? rawIsActive : undefined,
      };
    },
  },
  async (data, { supabase, claims }) => {
    const updatePayload: TablesUpdate<"kds_stations"> = {
      name: data.name,
      position: data.position,
    };

    if (data.is_active !== undefined) {
      updatePayload.is_active = data.is_active;
    }

    let query = supabase
      .from("kds_stations")
      .update(updatePayload)
      .eq("id", data.id)
      .eq("tenant_id", claims.tenant_id);

    if (claims.branch_id !== null) {
      query = query.eq("branch_id", claims.branch_id);
    }

    const { data: result, error } = await query.select("id, branch_id");

    if (error) {
      console.error("[branch-settings/kds:updateStation] Update station error:", error);
      return { success: false, error: mapStationDbError(error.code) };
    }

    if (!result || result.length === 0) {
      return {
        success: false,
        error: "Trạm KDS không tồn tại hoặc không có quyền",
      };
    }

    revalidateKdsSettings(result[0]!.branch_id);
    return { success: true };
  },
);

export const saveStationCategories = withAction(
  {
    roles: SETTINGS_ROLES,
    schema: saveStationCategoriesSchema,
    permission: PERMISSION_KEYS.SETTINGS_BRANCH,
    requireBranchScope: true,
  },
  async (data, { supabase, claims }) => {
    const { data: station } = await supabase
      .from("kds_stations")
      .select("id, branch_id")
      .eq("id", data.stationId)
      .eq("tenant_id", claims.tenant_id)
      .single();

    if (!station) {
      return { success: false, error: "Trạm KDS không tồn tại" };
    }

    if (
      claims.user_role === "branch_manager" &&
      station.branch_id !== claims.branch_id
    ) {
      return { success: false, error: "Không có quyền chỉnh sửa trạm này" };
    }

    const { error } = await supabase.rpc("save_station_categories", {
      p_station_id: data.stationId,
      p_category_ids: data.categoryIds,
    });

    if (error) {
      console.error("[branch-settings/kds:saveStationCategories] RPC save_station_categories error:", error);
      if (error.message?.includes("not found")) {
        return { success: false, error: "Trạm KDS không tồn tại" };
      }
      return {
        success: false,
        error: "Không thể cập nhật danh mục. Vui lòng thử lại.",
      };
    }

    revalidateKdsSettings(station.branch_id);
    return { success: true };
  },
);

/* ─── upsertStationWithCategories (atomic station + categories) ─── */

const upsertStationSchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  branchId: z.coerce.number().int().positive({ error: "Chọn chi nhánh" }),
  name: z.string().min(1, { error: "Tên trạm không được để trống" }),
  position: z.coerce.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
  categoryIds: z.array(z.coerce.number().int().positive()).default([]),
});

export const upsertStationWithCategories = withAction(
  {
    roles: SETTINGS_ROLES,
    schema: upsertStationSchema,
    permission: PERMISSION_KEYS.SETTINGS_BRANCH,
    permissionBranchId: (data) => data.branchId,
    requireBranchScope: true,
  },
  async (data, { supabase, claims }) => {
    if (!canOperateBranch(claims.branch_id, data.branchId)) {
      return { success: false, error: "Không có quyền thao tác chi nhánh này" };
    }

    const { data: stationId, error } = await supabase.rpc(
      "upsert_station_with_categories",
      {
        p_station_id: data.id,
        p_branch_id: data.branchId,
        p_name: data.name,
        p_position: data.position,
        p_is_active: data.isActive,
        p_category_ids: data.categoryIds,
      },
    );

    if (error) {
      console.error("[branch-settings/kds:upsertStationWithCategories] RPC upsert_station_with_categories error:", error);
      return { success: false, error: mapStationDbError(error.code) };
    }

    revalidateKdsSettings(data.branchId);
    return {
      success: true,
      data: stationId != null ? { id: Number(stationId) } : undefined,
    };
  },
);
