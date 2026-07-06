"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withAction } from "@/_lib/with-action";

// Allowed roles for branch team board
const ROLES = ["owner", "branch_manager"] as const;

const assignChecklistSchema = z.object({
  branchId: z.coerce.number().int().positive(),
  employeeId: z.coerce.number().int().positive(),
  templateId: z.coerce.number().int().positive().nullable(),
});

export const assignChecklistTemplate = withAction(
  {
    roles: ROLES,
    schema: assignChecklistSchema,
  },
  async (data, { supabase, claims }) => {
    // Basic branch scope check for branch managers
    if (claims.user_role === "branch_manager" && claims.branch_id !== data.branchId) {
      return { success: false, error: "Không có quyền gán việc tại chi nhánh này." };
    }

    // Verify employee belongs to the branch
    const { data: employeeData, error: empError } = await supabase
      .from("employees")
      .select("profiles!inner(branch_id)")
      .eq("id", data.employeeId)
      .eq("tenant_id", claims.tenant_id)
      .single();

    if (empError || (employeeData.profiles as unknown as { branch_id: number })?.branch_id !== data.branchId) {
      return { success: false, error: "Nhân viên không hợp lệ hoặc không thuộc chi nhánh này." };
    }

    const { error: updateError } = await supabase
      .from("employees")
      .update({
        default_checklist_template_id: data.templateId,
      })
      .eq("id", data.employeeId)
      .eq("tenant_id", claims.tenant_id);

    if (updateError) {
      console.error("[team/assignments:assignChecklistTemplate] Update failed", updateError);
      return { success: false, error: "Không thể cập nhật phân công checklist." };
    }

    revalidatePath(`/br/${data.branchId}/team`);
    return { success: true };
  },
);
