"use server";

import { z } from "zod";
import {
  BRANCH_FLOOR_SETTINGS_ROLES,
  PERMISSION_KEYS,
  type StaffRole,
} from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getAuthContextWithPermission } from "@/_lib/auth";
import { revalidateSurfacePath } from "@/_lib/revalidate-surface";
import { withAction, withFormAction, type ActionContext } from "@/_lib/with-action";

/* ─── Helpers ─── */

const SETTINGS_ROLES: readonly StaffRole[] = BRANCH_FLOOR_SETTINGS_ROLES;

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
  stationId: z.coerce.number().int().positive({ error: "Station ID không hợp lệ" }),
  categoryIds: z.array(z.coerce.number().int().positive()),
});

/* ─── Actions ─── */

/**
 * Fetch KDS stations with their category assignments.
 * Optionally filter by branchId. Kept manual (auth-only + complex optional filter).
 */
export async function fetchStations(branchId?: number): Promise<ActionResult> {
  const ctx = await getAuthContextWithPermission(
    SETTINGS_ROLES,
    PERMISSION_KEYS.SETTINGS_BRANCH,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  if (branchId !== undefined) {
    const parsedBranchId = z.coerce
      .number()
      .int()
      .positive()
      .safeParse(branchId);
    if (!parsedBranchId.success) {
      return { success: false, error: "Branch ID không hợp lệ" };
    }

    if (!canOperateBranch(claims.branch_id, parsedBranchId.data)) {
      return {
        success: false,
        error: "Không có quyền truy cập chi nhánh này",
      };
    }
  }

  let query = supabase
    .from("kds_stations")
    .select(
      `
      id,
      name,
      branch_id,
      position,
      is_active,
      created_at,
      updated_at,
      kds_station_categories (
        id,
        category_id
      )
    `,
    )
    .eq("tenant_id", claims.tenant_id)
    .order("position", { ascending: true });

  if (branchId !== undefined) {
    query = query.eq("branch_id", branchId);
  }

  if (claims.branch_id !== null && branchId === undefined) {
    query = query.eq("branch_id", claims.branch_id);
  }

  const { data: stations, error } = await query;

  if (error) {
    return {
      success: false,
      error: "Không thể tải danh sách trạm KDS. Vui lòng thử lại.",
    };
  }

  return { success: true, data: stations ?? [] };
}

export const createStation = withFormAction(
  {
    roles: SETTINGS_ROLES,
    schema: createStationSchema,
    permission: PERMISSION_KEYS.SETTINGS_BRANCH,
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
      return { success: false, error: mapStationDbError(error.code) };
    }

    if (!result || result.length === 0) {
      return {
        success: false,
        error: "Không thể tạo trạm KDS. Kiểm tra quyền truy cập.",
      };
    }

    revalidateSurfacePath("/admin/settings/kds");
    return { success: true, data: { id: result[0]!.id } };
  },
);

export const updateStation = withFormAction(
  {
    roles: SETTINGS_ROLES,
    schema: updateStationSchema,
    permission: PERMISSION_KEYS.SETTINGS_BRANCH,
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
    const updatePayload: Record<string, unknown> = {
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

    const { data: result, error } = await query.select("id");

    if (error) {
      return { success: false, error: mapStationDbError(error.code) };
    }

    if (!result || result.length === 0) {
      return {
        success: false,
        error: "Trạm KDS không tồn tại hoặc không có quyền",
      };
    }

    revalidateSurfacePath("/admin/settings/kds");
    return { success: true };
  },
);

export const saveStationCategories = withAction(
  { roles: SETTINGS_ROLES, schema: saveStationCategoriesSchema, permission: PERMISSION_KEYS.SETTINGS_BRANCH },
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
      if (error.message?.includes("not found")) {
        return { success: false, error: "Trạm KDS không tồn tại" };
      }
      return {
        success: false,
        error: "Không thể cập nhật danh mục. Vui lòng thử lại.",
      };
    }

    revalidateSurfacePath("/admin/settings/kds");
    return { success: true };
  },
);
