"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@comtammatu/database/supabase/server";
import type { StaffRole } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getAuthContext } from "../../_lib/auth";

/* ─── Helpers ─── */

const SETTINGS_ROLES: StaffRole[] = [
  "owner",
  "super_manager",
  "area_manager",
  "branch_manager",
];

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

/** Branch manager can only operate on their own branch */
function canOperateBranch(
  claimsBranchId: number | null,
  targetBranchId: number,
): boolean {
  if (claimsBranchId === null) return true; // owner/super_manager/area_manager
  return claimsBranchId === targetBranchId;
}

function mapStationDbError(code: string | undefined): string {
  if (code === "23505") return "Tên trạm KDS đã tồn tại";
  if (code === "23503") return "Dữ liệu tham chiếu không hợp lệ";
  return "Không thể thực hiện. Vui lòng thử lại.";
}

/**
 * Typed wrapper for supabase.from() on KDS tables not yet in generated types.
 * Remove after migrations applied + pnpm db:types.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromTable(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: string,
): any {
  return (supabase.from as CallableFunction)(table);
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

/* ─── Actions ─── */

/**
 * Fetch KDS stations with their category assignments.
 * Optionally filter by branchId.
 */
export async function fetchStations(branchId?: number): Promise<ActionResult> {
  const ctx = await getAuthContext(SETTINGS_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  // If branchId provided, validate
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

  // kds_stations not yet in generated types — remove cast after pnpm db:types
  let query = fromTable(supabase, "kds_stations")
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

  // Branch manager can only see their own branch
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

/**
 * Create a new KDS station.
 */
export async function createStation(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = createStationSchema.safeParse({
    name: formData.get("name"),
    branch_id: formData.get("branch_id"),
    position: formData.get("position") || 0,
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

  // kds_stations not yet in generated types — remove cast after pnpm db:types
  const { data, error } = await fromTable(supabase, "kds_stations")
    .insert({
      tenant_id: claims.tenant_id,
      branch_id: parsed.data.branch_id,
      name: parsed.data.name,
      position: parsed.data.position,
    })
    .select("id");

  if (error) {
    return { success: false, error: mapStationDbError(error.code) };
  }

  // RLS returns { data: [], error: null } on blocked writes
  if (!data || data.length === 0) {
    return {
      success: false,
      error: "Không thể tạo trạm KDS. Kiểm tra quyền truy cập.",
    };
  }

  revalidatePath("/admin/settings/kds");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { success: true, data: { id: (data as any[])[0].id as number } };
}

/**
 * Update an existing KDS station.
 */
export async function updateStation(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const rawIsActive = formData.get("is_active");

  const parsed = updateStationSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    position: formData.get("position") || 0,
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

  const updatePayload: Record<string, unknown> = {
    name: parsed.data.name,
    position: parsed.data.position,
  };

  if (parsed.data.is_active !== undefined) {
    updatePayload.is_active = parsed.data.is_active;
  }

  // kds_stations not yet in generated types — remove cast after pnpm db:types
  let query = fromTable(supabase, "kds_stations")
    .update(updatePayload)
    .eq("id", parsed.data.id)
    .eq("tenant_id", claims.tenant_id);

  // Branch manager can only update stations in their own branch
  if (claims.branch_id !== null) {
    query = query.eq("branch_id", claims.branch_id);
  }

  const { data, error } = await query.select("id");

  if (error) {
    return { success: false, error: mapStationDbError(error.code) };
  }

  // RLS returns { data: [], error: null } on blocked writes
  if (!data || data.length === 0) {
    return {
      success: false,
      error: "Trạm KDS không tồn tại hoặc không có quyền",
    };
  }

  revalidatePath("/admin/settings/kds");
  return { success: true };
}

/**
 * Save category assignments for a KDS station.
 * Deletes existing assignments and inserts new ones.
 */
export async function saveStationCategories(
  stationId: number,
  categoryIds: number[],
): Promise<ActionResult> {
  const parsedStationId = z.coerce
    .number()
    .int()
    .positive()
    .safeParse(stationId);
  if (!parsedStationId.success) {
    return { success: false, error: "Station ID không hợp lệ" };
  }

  const parsedCategoryIds = z
    .array(z.coerce.number().int().positive())
    .safeParse(categoryIds);
  if (!parsedCategoryIds.success) {
    return { success: false, error: "Danh sách danh mục không hợp lệ" };
  }

  const ctx = await getAuthContext(SETTINGS_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase } = ctx;

  // Use atomic RPC — DELETE + INSERT in single transaction
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.rpc as any)("save_station_categories", {
    p_station_id: parsedStationId.data,
    p_category_ids: parsedCategoryIds.data,
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

  revalidatePath("/admin/settings/kds");
  return { success: true };
}
