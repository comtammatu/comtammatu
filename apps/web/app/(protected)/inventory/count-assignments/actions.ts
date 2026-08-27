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
    revalidatePath(`/br/${data.branchId}/team`);
    return { success: true };
  },
);

const setAssignmentsByTemplateSchema = z.object({
  branchId: z.coerce.number().int().positive(),
  locationId: z.coerce.number().int().positive(),
  employeeId: z.coerce.number().int().positive(),
  templateId: z.coerce.number().int().positive(),
  shiftId: z.coerce.number().int().positive().nullable().optional(),
});

export const setCountAssignmentsByTemplate = withAction(
  {
    roles: ROLES,
    schema: setAssignmentsByTemplateSchema,
    permission: PERMISSION_KEYS.INVENTORY_COUNT_ASSIGN,
    permissionBranchId: (data) => data.branchId,
    requireBranchScope: true,
  },
  async (data, { supabase }) => {
    const { error } = await supabase.rpc(
      "set_inventory_count_assignments_by_template",
      {
        p_branch_id: data.branchId,
        p_location_id: data.locationId,
        p_employee_id: data.employeeId,
        p_template_id: data.templateId,
        ...(data.shiftId == null ? {} : { p_shift_id: data.shiftId }),
      },
    );
    if (error) {
      console.error("inventory.count_assignments.set_by_template_failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      return { success: false, error: mapCountAssignRpcError(error.code) };
    }
    revalidatePath("/inventory/count-assignments");
    revalidatePath(`/br/${data.branchId}/stock/count-assignments`);
    revalidatePath(`/br/${data.branchId}/team`);
    return { success: true };
  },
);

const setStationAssignmentsSchema = z.object({
  branchId: z.coerce.number().int().positive(),
  locationId: z.coerce.number().int().positive(),
  templateId: z.coerce.number().int().positive(),
  shiftId: z.coerce.number().int().positive().nullable().optional(),
  assignments: z.array(
    z.object({
      employeeId: z.coerce.number().int().positive(),
      ingredientIds: z.array(z.coerce.number().int().positive()),
    }),
  ),
});

export const setStationCountAssignments = withAction(
  {
    roles: ROLES,
    schema: setStationAssignmentsSchema,
    permission: PERMISSION_KEYS.INVENTORY_COUNT_ASSIGN,
    permissionBranchId: (data) => data.branchId,
    requireBranchScope: true,
  },
  async (data, { supabase }) => {
    const { error } = await supabase.rpc("set_station_count_assignments", {
      p_branch_id: data.branchId,
      p_location_id: data.locationId,
      p_template_id: data.templateId,
      p_assignments: data.assignments,
      ...(data.shiftId == null ? {} : { p_shift_id: data.shiftId }),
    });
    if (error) {
      console.error("inventory.count_assignments.set_station_failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      return { success: false, error: mapCountAssignRpcError(error.code) };
    }
    revalidatePath("/inventory/count-assignments");
    revalidatePath(`/br/${data.branchId}/stock/count-assignments`);
    revalidatePath(`/br/${data.branchId}/team`);
    return { success: true };
  },
);

const saveCountTemplateSchema = z.object({
  branchId: z.coerce.number().int().positive(),
  templateId: z.coerce.number().int().positive().nullable().optional(),
  code: z.string().trim().max(64).optional(),
  name: z.string().trim().min(1).max(128),
  stationRole: z.string().trim().min(1).max(64).default("custom"),
  ingredientIds: z.array(z.coerce.number().int().positive()),
});

export const saveCountTemplate = withAction(
  {
    roles: ROLES,
    schema: saveCountTemplateSchema,
    permission: PERMISSION_KEYS.INVENTORY_COUNT_ASSIGN,
    permissionBranchId: (data) => data.branchId,
    requireBranchScope: true,
  },
  async (data, { supabase }) => {
    const { data: res, error } = await supabase.rpc(
      "upsert_inventory_count_template",
      {
        p_branch_id: data.branchId,
        p_code: data.code ?? "",
        p_name: data.name,
        p_station_role: data.stationRole,
        p_ingredient_ids: data.ingredientIds,
        ...(data.templateId == null ? {} : { p_template_id: data.templateId }),
      },
    );
    if (error) {
      console.error("inventory.count_assignments.save_template_failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      return { success: false, error: "Không thể lưu mẫu kiểm đếm." };
    }
    revalidatePath("/inventory/count-assignments");
    revalidatePath(`/br/${data.branchId}/stock/count-assignments`);
    return {
      success: true,
      templateId: (res as { template_id?: number } | null)?.template_id,
    };
  },
);

const deleteCountTemplateSchema = z.object({
  branchId: z.coerce.number().int().positive(),
  templateId: z.coerce.number().int().positive(),
});

export const deleteCountTemplate = withAction(
  {
    roles: ROLES,
    schema: deleteCountTemplateSchema,
    permission: PERMISSION_KEYS.INVENTORY_COUNT_ASSIGN,
    permissionBranchId: (data) => data.branchId,
    requireBranchScope: true,
  },
  async (data, { supabase }) => {
    const { error } = await supabase.rpc("delete_inventory_count_template", {
      p_branch_id: data.branchId,
      p_template_id: data.templateId,
    });
    if (error) {
      console.error("inventory.count_assignments.delete_template_failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      return { success: false, error: "Không thể xóa mẫu kiểm đếm." };
    }
    revalidatePath("/inventory/count-assignments");
    revalidatePath(`/br/${data.branchId}/stock/count-assignments`);
    return { success: true };
  },
);

