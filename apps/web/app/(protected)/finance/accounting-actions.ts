"use server";

import { z } from "zod";
import { PERMISSION_KEYS, type StaffRole } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getAuthContextWithPermission } from "@/_lib/auth";

const REPORT_ROLES: readonly StaffRole[] = ["owner", "branch_manager"];

const fetchFoodCostSchema = z.object({
  startDate: z.string().date().optional(),
  endDate: z.string().date().optional(),
  branchId: z.coerce.number().int().positive().optional(),
});

export async function fetchFoodCost(
  input?: z.infer<typeof fetchFoodCostSchema>,
): Promise<ActionResult> {
  const parsed = fetchFoodCostSchema.safeParse(input ?? {});
  if (!parsed.success) {
    return { success: false, error: "Tham số không hợp lệ" };
  }

  const ctx = await getAuthContextWithPermission(
    REPORT_ROLES,
    PERMISSION_KEYS.FINANCE_VIEW,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase } = ctx;

  const { data, error } = await supabase.rpc("get_food_cost", {
    p_branch_id: parsed.data.branchId ?? undefined,
    p_start_date: parsed.data.startDate ?? undefined,
    p_end_date: parsed.data.endDate ?? undefined,
  });

  if (error) {
    return { success: false, error: "Không thể tải dữ liệu food cost." };
  }

  return { success: true, data: data ?? [] };
}
