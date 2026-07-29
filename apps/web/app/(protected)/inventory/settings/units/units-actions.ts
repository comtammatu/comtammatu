"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@comtammatu/shared/types";
import { VALIDATION_VI } from "@comtammatu/shared/messages";
import { INVENTORY_CATALOG_ROLES, INVENTORY_CATALOG_VIEW_ROLES } from "@comtammatu/shared/auth";
import { withAction } from "@/_lib/with-action";
import { messages } from "@lib/messages";
import { getAuthContextWithAnyPermission } from "../../_lib/auth";
import {
  CATALOG_READ_PERMISSIONS,
  UNITS_MASTER_PERMISSIONS,
} from "../../_lib/catalog-permissions";
import { PG_ERR } from "../../_lib/constants";

const UNITS_PATH = "/inventory/settings/units";

export type UnitDimension = "mass" | "volume";

export interface UnitRow {
  id: number;
  code: string;
  name: string;
  is_active: boolean;
  dimension: UnitDimension | null;
  is_standard: boolean;
  standard_factor: number | null;
  inUse: boolean;
}

const unitCode = z
  .string()
  .trim()
  .min(1, { error: VALIDATION_VI.required("Mã đơn vị") })
  .transform((value) => value.toLowerCase());

const unitCreateSchema = z.object({
  code: unitCode,
  is_active: z.boolean().default(true),
});

const unitUpdateSchema = z.object({
  id: z.coerce.number().int().positive({ error: "Mã đơn vị không hợp lệ" }),
  code: unitCode,
  is_active: z.boolean().default(true),
});

const unitDeleteSchema = z.object({
  id: z.coerce.number().int().positive({ error: "Mã đơn vị không hợp lệ" }),
});

export async function fetchUnits(): Promise<ActionResult<UnitRow[]>> {
  const ctx = await getAuthContextWithAnyPermission(
    INVENTORY_CATALOG_VIEW_ROLES,
    [...CATALOG_READ_PERMISSIONS, ...UNITS_MASTER_PERMISSIONS],
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  const [unitsResult, mappingsResult] = await Promise.all([
    supabase
      .from("units")
      .select(
        "id, code, name, is_active, dimension, is_standard, standard_factor",
      )
      .eq("tenant_id", claims.tenant_id)
      .order("code"),
    supabase
      .from("ingredient_units")
      .select("unit_id, anchor_unit_id")
      .eq("tenant_id", claims.tenant_id),
  ]);

  if (unitsResult.error || mappingsResult.error) {
    return {
      success: false,
      error: messages.inventory.settings.units.loadFailed,
    };
  }

  const referencedUnitIds = new Set<number>();
  for (const mapping of mappingsResult.data ?? []) {
    referencedUnitIds.add(mapping.unit_id);
    if (mapping.anchor_unit_id != null) {
      referencedUnitIds.add(mapping.anchor_unit_id);
    }
  }

  const rows: UnitRow[] = (unitsResult.data ?? []).map((unit) => ({
    id: unit.id,
    code: unit.code,
    name: unit.name,
    is_active: unit.is_active,
    dimension: unit.dimension as UnitDimension | null,
    is_standard: unit.is_standard,
    standard_factor: unit.standard_factor,
    inUse: referencedUnitIds.has(unit.id),
  }));

  return { success: true, data: rows };
}

export const createUnit = withAction(
  {
    roles: INVENTORY_CATALOG_ROLES,
    schema: unitCreateSchema,
    anyPermission: UNITS_MASTER_PERMISSIONS,
  },
  async (data, { supabase, claims }) => {
    const { error } = await supabase.from("units").insert({
      tenant_id: claims.tenant_id,
      code: data.code,
      name: data.code,
      is_active: data.is_active,
    });

    if (error) {
      if (error.code === PG_ERR.UNIQUE_VIOLATION) {
        return { success: false, error: "Mã đơn vị này đã tồn tại." };
      }
      return { success: false, error: "Không thể tạo đơn vị." };
    }

    revalidatePath(UNITS_PATH);
    return { success: true };
  },
);

export const updateUnit = withAction(
  {
    roles: INVENTORY_CATALOG_ROLES,
    schema: unitUpdateSchema,
    anyPermission: UNITS_MASTER_PERMISSIONS,
  },
  async (data, { supabase, claims }) => {
    const [currentResult, mappingsResult] = await Promise.all([
      supabase
        .from("units")
        .select("code")
        .eq("id", data.id)
        .eq("tenant_id", claims.tenant_id)
        .maybeSingle(),
      supabase
        .from("ingredient_units")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", claims.tenant_id)
        .or(`unit_id.eq.${data.id},anchor_unit_id.eq.${data.id}`),
    ]);

    if (currentResult.error || mappingsResult.error) {
      return { success: false, error: "Không thể kiểm tra đơn vị." };
    }
    if (!currentResult.data) {
      return { success: false, error: "Đơn vị không tồn tại." };
    }
    if (
      (mappingsResult.count ?? 0) > 0 &&
      currentResult.data.code !== data.code
    ) {
      return {
        success: false,
        error:
          "Đơn vị đã gán nguyên liệu nên không thể đổi mã. Hãy tạo đơn vị mới nếu cần cách gọi khác.",
      };
    }

    const { error } = await supabase
      .from("units")
      .update({
        code: data.code,
        name: data.code,
        is_active: data.is_active,
      })
      .eq("id", data.id)
      .eq("tenant_id", claims.tenant_id);

    if (error) {
      if (error.code === PG_ERR.UNIQUE_VIOLATION) {
        return { success: false, error: "Mã đơn vị này đã tồn tại." };
      }
      return { success: false, error: "Không thể cập nhật đơn vị." };
    }

    revalidatePath(UNITS_PATH);
    return { success: true };
  },
);

export const deleteUnit = withAction(
  {
    roles: INVENTORY_CATALOG_ROLES,
    schema: unitDeleteSchema,
    anyPermission: UNITS_MASTER_PERMISSIONS,
  },
  async (data, { supabase, claims }) => {
    const { error } = await supabase
      .from("units")
      .delete()
      .eq("id", data.id)
      .eq("tenant_id", claims.tenant_id);

    if (error) {
      // ingredient_units.unit_id is ON DELETE RESTRICT: a unit still
      // referenced by an ingredient mapping cannot be removed.
      if (error.code === PG_ERR.FK_VIOLATION) {
        return {
          success: false,
          error: "Đơn vị đang được dùng, không thể xoá",
        };
      }
      return { success: false, error: "Không thể xoá đơn vị." };
    }

    revalidatePath(UNITS_PATH);
    return { success: true };
  },
);
