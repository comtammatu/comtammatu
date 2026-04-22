"use server";

import { z } from "zod";
import { PERMISSION_KEYS, type StaffRole } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getAuthContextWithPermission } from "@/_lib/auth";
import { withAction } from "@/_lib/with-action";

const AREA_ADMIN_ROLES: readonly StaffRole[] = ["owner", "super_manager"];

/* ─── Schemas ─── */

const createAreaSchema = z.object({
  name: z.string().min(1, { error: "Tên khu vực không được để trống" }),
});

const updateAreaSchema = z.object({
  id: z.coerce.number().int().positive(),
  name: z.string().min(1, { error: "Tên khu vực không được để trống" }),
});

const assignSchema = z.object({
  areaId: z.coerce.number().int().positive(),
  branchId: z.coerce.number().int().positive(),
});

const removeSchema = z.object({
  areaBranchId: z.coerce.number().int().positive(),
});

/* ─── fetchAreas ─── */

export async function fetchAreas(): Promise<ActionResult> {
  const ctx = await getAuthContextWithPermission(
    AREA_ADMIN_ROLES,
    PERMISSION_KEYS.SETTINGS_TENANT,
  );
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

export const createArea = withAction(
  {
    roles: AREA_ADMIN_ROLES,
    schema: createAreaSchema,
    permission: PERMISSION_KEYS.SETTINGS_TENANT,
  },
  async (data, { supabase, claims }) => {
    const { data: result, error } = await supabase
      .from("areas")
      .insert({ tenant_id: claims.tenant_id, name: data.name })
      .select("id")
      .single();

    if (error) {
      if (error.code === "23505") {
        return { success: false, error: "Khu vực này đã tồn tại." };
      }
      return { success: false, error: "Không thể tạo khu vực." };
    }

    return { success: true, data: result };
  },
);

/* ─── updateArea ─── */

export const updateArea = withAction(
  {
    roles: AREA_ADMIN_ROLES,
    schema: updateAreaSchema,
    permission: PERMISSION_KEYS.SETTINGS_TENANT,
  },
  async (data, { supabase, claims }) => {
    const { error } = await supabase
      .from("areas")
      .update({ name: data.name })
      .eq("id", data.id)
      .eq("tenant_id", claims.tenant_id);

    if (error) {
      if (error.code === "23505") {
        return { success: false, error: "Tên khu vực đã tồn tại." };
      }
      return { success: false, error: "Không thể cập nhật khu vực." };
    }

    return { success: true };
  },
);

/* ─── assignBranchToArea ─── */

export const assignBranchToArea = withAction(
  {
    roles: AREA_ADMIN_ROLES,
    schema: assignSchema,
    permission: PERMISSION_KEYS.SETTINGS_TENANT,
  },
  async (data, { supabase, claims }) => {
    const { error } = await supabase.from("area_branches").insert({
      tenant_id: claims.tenant_id,
      area_id: data.areaId,
      branch_id: data.branchId,
    });

    if (error) {
      if (error.code === "23505") {
        return { success: false, error: "Chi nhánh đã thuộc khu vực này." };
      }
      return { success: false, error: "Không thể gán chi nhánh." };
    }

    return { success: true };
  },
);

/* ─── removeBranchFromArea ─── */

export const removeBranchFromArea = withAction(
  {
    roles: AREA_ADMIN_ROLES,
    schema: removeSchema,
    permission: PERMISSION_KEYS.SETTINGS_TENANT,
  },
  async (data, { supabase, claims }) => {
    const { error } = await supabase
      .from("area_branches")
      .delete()
      .eq("id", data.areaBranchId)
      .eq("tenant_id", claims.tenant_id);

    if (error) {
      return {
        success: false,
        error: "Không thể xóa chi nhánh khỏi khu vực.",
      };
    }

    return { success: true };
  },
);
