"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  BRANCH_FLOOR_SETTINGS_ROLES,
  PERMISSION_KEYS,
  type StaffRole,
} from "@comtammatu/shared/auth";
import { withAction } from "@/_lib/with-action";
import { canOperateBranch } from "../branch-guards";

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
