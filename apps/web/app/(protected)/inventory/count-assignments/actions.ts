"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { INVENTORY_OPS_ROLES, PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { withAction } from "@/_lib/with-action";

const ROLES = INVENTORY_OPS_ROLES;

const setAssignmentsSchema = z.object({
  branchId: z.coerce.number().int().positive(),
  locationId: z.coerce.number().int().positive(),
  employeeId: z.coerce.number().int().positive(),
  shiftId: z.coerce.number().int().positive().nullable().optional(),
  ingredientIds: z.array(z.coerce.number().int().positive()),
});

/**
 * Map the `set_inventory_count_assignments` RPC error codes to short
 * Vietnamese copy. The RPC raises 42501 (forbidden) and P0002 (referenced
 * branch/location/employee not found); 23xxx covers FK/constraint breaches.
 * Never surface the raw Postgres message.
 */
function mapCountAssignRpcError(code: string | undefined): string {
  switch (code) {
    case "42501":
      return "Không có quyền phân công đếm tồn tại chi nhánh này.";
    case "P0002":
      return "Không tìm thấy chi nhánh, kho hoặc nhân viên.";
    case "23503":
      return "Nguyên liệu hoặc nhân viên không hợp lệ.";
    default:
      return "Không thể lưu phân công đếm tồn.";
  }
}

export const setCountAssignments = withAction(
  {
    roles: ROLES,
    schema: setAssignmentsSchema,
    permission: PERMISSION_KEYS.INVENTORY_COUNT_ASSIGN,
    permissionBranchId: (data) => data.branchId,
    requireBranchScope: true,
  },
  async (data, { supabase }) => {
    const { error } = await supabase.rpc("set_inventory_count_assignments", {
      p_branch_id: data.branchId,
      p_location_id: data.locationId,
      p_employee_id: data.employeeId,
      p_ingredient_ids: data.ingredientIds,
      ...(data.shiftId == null ? {} : { p_shift_id: data.shiftId }),
    });
    if (error) {
      console.error("inventory.count_assignments.set_failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      return { success: false, error: mapCountAssignRpcError(error.code) };
    }
    revalidatePath("/inventory/count-assignments");
    revalidatePath(`/br/${data.branchId}/stock/count-assignments`);
    return { success: true };
  },
);
