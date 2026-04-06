"use server";

import { z } from "zod";
import type { StaffRole } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getAuthContext } from "../../_lib/auth";

const AREA_ADMIN_ROLES: readonly StaffRole[] = ["owner", "super_manager"];

/* ─── fetchAreas ─── */

export async function fetchAreas(): Promise<ActionResult> {
  const ctx = await getAuthContext(AREA_ADMIN_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  const { data: areas, error } = await supabase
    .from("areas")
    .select(
      `
      id,
      name,
      is_active,
      area_branches (
        id,
        branch_id,
        branches (
          id,
          name
        )
      )
    `,
    )
    .eq("tenant_id", claims.tenant_id)
    .order("name");

  if (error) {
    return { success: false, error: "Không thể tải danh sách khu vực." };
  }

  return { success: true, data: areas ?? [] };
}

/* ─── createArea ─── */

const createAreaSchema = z.object({
  name: z.string().min(1, { error: "Tên khu vực không được để trống" }),
});

export async function createArea(name: string): Promise<ActionResult> {
  const parsed = createAreaSchema.safeParse({ name });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const ctx = await getAuthContext(AREA_ADMIN_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  const { data, error } = await supabase
    .from("areas")
    .insert({ tenant_id: claims.tenant_id, name: parsed.data.name })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { success: false, error: "Khu vực này đã tồn tại." };
    }
    return { success: false, error: "Không thể tạo khu vực." };
  }

  return { success: true, data };
}

/* ─── updateArea ─── */

const updateAreaSchema = z.object({
  id: z.coerce.number().int().positive(),
  name: z.string().min(1, { error: "Tên khu vực không được để trống" }),
});

export async function updateArea(
  id: number,
  name: string,
): Promise<ActionResult> {
  const parsed = updateAreaSchema.safeParse({ id, name });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const ctx = await getAuthContext(AREA_ADMIN_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  const { error } = await supabase
    .from("areas")
    .update({ name: parsed.data.name })
    .eq("id", parsed.data.id)
    .eq("tenant_id", claims.tenant_id);

  if (error) {
    if (error.code === "23505") {
      return { success: false, error: "Tên khu vực đã tồn tại." };
    }
    return { success: false, error: "Không thể cập nhật khu vực." };
  }

  return { success: true };
}

/* ─── assignBranchToArea ─── */

const assignSchema = z.object({
  areaId: z.coerce.number().int().positive(),
  branchId: z.coerce.number().int().positive(),
});

export async function assignBranchToArea(
  areaId: number,
  branchId: number,
): Promise<ActionResult> {
  const parsed = assignSchema.safeParse({ areaId, branchId });
  if (!parsed.success) {
    return { success: false, error: "Dữ liệu không hợp lệ" };
  }

  const ctx = await getAuthContext(AREA_ADMIN_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  const { error } = await supabase.from("area_branches").insert({
    tenant_id: claims.tenant_id,
    area_id: parsed.data.areaId,
    branch_id: parsed.data.branchId,
  });

  if (error) {
    if (error.code === "23505") {
      return { success: false, error: "Chi nhánh đã thuộc khu vực này." };
    }
    return { success: false, error: "Không thể gán chi nhánh." };
  }

  return { success: true };
}

/* ─── removeBranchFromArea ─── */

export async function removeBranchFromArea(
  areaBranchId: number,
): Promise<ActionResult> {
  const idSchema = z.coerce.number().int().positive();
  const parsed = idSchema.safeParse(areaBranchId);
  if (!parsed.success) {
    return { success: false, error: "ID không hợp lệ" };
  }

  const ctx = await getAuthContext(AREA_ADMIN_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  const { error } = await supabase
    .from("area_branches")
    .delete()
    .eq("id", parsed.data)
    .eq("tenant_id", claims.tenant_id);

  if (error) {
    return { success: false, error: "Không thể xóa chi nhánh khỏi khu vực." };
  }

  return { success: true };
}
