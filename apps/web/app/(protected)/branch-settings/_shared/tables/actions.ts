"use server";

import { z } from "zod";
import {
  BRANCH_FLOOR_SETTINGS_ROLES,
  PERMISSION_KEYS,
  type StaffRole,
} from "@comtammatu/shared/auth";
import { revalidatePath, updateTag } from "next/cache";
import { withAction, withFormAction } from "@/_lib/with-action";
import { canOperateBranch, verifyBranchOwnership } from "../branch-guards";
import { TABLE_STATE_VALUES } from "./constants";

/* ─── Helpers ─── */

const SETTINGS_ROLES: readonly StaffRole[] = BRANCH_FLOOR_SETTINGS_ROLES;
const ACTIVE_TABLE_ORDER_STATES = ["pending", "preparing", "ready", "served"];

function revalidateTableSettings(branchId: number) {
  revalidatePath(`/br/${String(branchId)}/settings/tables`);
  // Bust POS cached tables list (apps/web/app/(protected)/br/[branchId]/pos/session-actions.ts).
  updateTag("tables");
}

function mapZoneDbError(code: string | undefined): string {
  if (code === "23505") return "Tên khu vực đã tồn tại";
  if (code === "23503") return "Dữ liệu tham chiếu không hợp lệ";
  return "Không thể thực hiện. Vui lòng thử lại.";
}

function mapTableDbError(code: string | undefined): string {
  if (code === "23505") return "Số bàn đã tồn tại";
  if (code === "23503") return "Dữ liệu tham chiếu không hợp lệ";
  return "Không thể thực hiện. Vui lòng thử lại.";
}

/* ─── Zone Schemas ─── */

const createZoneSchema = z.object({
  name: z.string().min(1, { error: "Tên khu vực không được để trống" }),
  branch_id: z.coerce.number().int().positive({ error: "Chọn chi nhánh" }),
  sort_order: z.coerce.number().int().min(0).default(0),
});

const updateZoneSchema = z.object({
  id: z.coerce.number().int().positive(),
  name: z.string().min(1, { error: "Tên khu vực không được để trống" }),
  branch_id: z.coerce.number().int().positive({ error: "Chọn chi nhánh" }),
  sort_order: z.coerce.number().int().min(0).default(0),
});

const deleteIdSchema = z.object({
  id: z.coerce.number().int().positive({ error: "ID không hợp lệ" }),
});

/* ─── Table Schemas ─── */

const createTableSchema = z.object({
  number: z.coerce.number().int().positive({ error: "Số bàn không hợp lệ" }),
  branch_id: z.coerce.number().int().positive({ error: "Chọn chi nhánh" }),
  zone_id: z.coerce.number().int().positive().optional(),
});

const updateTableSchema = z.object({
  id: z.coerce.number().int().positive(),
  number: z.coerce.number().int().positive({ error: "Số bàn không hợp lệ" }),
  branch_id: z.coerce.number().int().positive({ error: "Chọn chi nhánh" }),
  zone_id: z.coerce.number().int().positive().optional(),
  status: z.enum(TABLE_STATE_VALUES).optional(),
});

/* ─── Zone Actions ─── */

export const createZone = withFormAction(
  {
    roles: SETTINGS_ROLES,
    schema: createZoneSchema,
    permission: PERMISSION_KEYS.SETTINGS_BRANCH,
    permissionBranchId: (data) => data.branch_id,
    requireBranchScope: true,
    extract: (fd) => ({
      name: fd.get("name"),
      branch_id: fd.get("branch_id"),
      sort_order: fd.get("sort_order") || 0,
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

    const { error } = await supabase.from("branch_zones").insert({
      tenant_id: claims.tenant_id,
      branch_id: data.branch_id,
      name: data.name,
      sort_order: data.sort_order,
    });

    if (error) {
      console.error("[branch-settings/tables:createZone] Insert zone error:", error);
      return { success: false, error: mapZoneDbError(error.code) };
    }

    revalidateTableSettings(data.branch_id);
    return { success: true };
  },
);

export const updateZone = withFormAction(
  {
    roles: SETTINGS_ROLES,
    schema: updateZoneSchema,
    permission: PERMISSION_KEYS.SETTINGS_BRANCH,
    permissionBranchId: (data) => data.branch_id,
    requireBranchScope: true,
    extract: (fd) => ({
      id: fd.get("id"),
      name: fd.get("name"),
      branch_id: fd.get("branch_id"),
      sort_order: fd.get("sort_order") || 0,
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

    const { error } = await supabase
      .from("branch_zones")
      .update({
        name: data.name,
        branch_id: data.branch_id,
        sort_order: data.sort_order,
      })
      .eq("id", data.id)
      .eq("tenant_id", claims.tenant_id);

    if (error) {
      console.error("[branch-settings/tables:updateZone] Update zone error:", error);
      return { success: false, error: mapZoneDbError(error.code) };
    }

    revalidateTableSettings(data.branch_id);
    return { success: true };
  },
);

export const deleteZone = withAction(
  {
    roles: SETTINGS_ROLES,
    schema: deleteIdSchema,
    permission: PERMISSION_KEYS.SETTINGS_BRANCH,
    requireBranchScope: true,
  },
  async (data, { supabase, claims }) => {
    let deleteQuery = supabase
      .from("branch_zones")
      .delete()
      .eq("id", data.id)
      .eq("tenant_id", claims.tenant_id);

    if (claims.branch_id) {
      deleteQuery = deleteQuery.eq("branch_id", claims.branch_id);
    }

    const { data: result, error } = await deleteQuery.select("id, branch_id");

    if (error) {
      console.error("[branch-settings/tables:deleteZone] Delete zone error:", error);
      return { success: false, error: mapZoneDbError(error.code) };
    }

    if (!result || result.length === 0) {
      return { success: false, error: "Không tìm thấy khu vực" };
    }

    revalidateTableSettings(result[0]!.branch_id);
    return { success: true };
  },
);

/* ─── Table Actions ─── */

export const createTable = withFormAction(
  {
    roles: SETTINGS_ROLES,
    schema: createTableSchema,
    permission: PERMISSION_KEYS.SETTINGS_BRANCH,
    permissionBranchId: (data) => data.branch_id,
    requireBranchScope: true,
    extract: (fd) => {
      const rawZoneId = fd.get("zone_id");
      const zoneId = rawZoneId && rawZoneId !== "none" ? rawZoneId : undefined;
      return {
        number: fd.get("number"),
        branch_id: fd.get("branch_id"),
        zone_id: zoneId,
      };
    },
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

    const { error } = await supabase.from("tables").insert({
      tenant_id: claims.tenant_id,
      branch_id: data.branch_id,
      zone_id: data.zone_id ?? null,
      number: data.number,
    });

    if (error) {
      console.error("[branch-settings/tables:createTable] Insert table error:", error);
      return { success: false, error: mapTableDbError(error.code) };
    }

    revalidateTableSettings(data.branch_id);
    return { success: true };
  },
);

export const updateTable = withFormAction(
  {
    roles: SETTINGS_ROLES,
    schema: updateTableSchema,
    permission: PERMISSION_KEYS.SETTINGS_BRANCH,
    permissionBranchId: (data) => data.branch_id,
    requireBranchScope: true,
    extract: (fd) => {
      const rawZoneId = fd.get("zone_id");
      const zoneId = rawZoneId && rawZoneId !== "none" ? rawZoneId : undefined;
      const rawStatus = fd.get("status");
      return {
        id: fd.get("id"),
        number: fd.get("number"),
        branch_id: fd.get("branch_id"),
        zone_id: zoneId,
        status: rawStatus ? rawStatus : undefined,
      };
    },
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

    if (data.status && data.status !== "occupied") {
      const { count, error: activeOrderError } = await supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", claims.tenant_id)
        .eq("branch_id", data.branch_id)
        .eq("table_id", data.id)
        .in("status", ACTIVE_TABLE_ORDER_STATES);

      if (activeOrderError) {
        console.error("[branch-settings/tables:updateTable] Check active orders on table error:", activeOrderError);
        return {
          success: false,
          error: "Không thể kiểm tra trạng thái đơn của bàn.",
        };
      }

      if ((count ?? 0) > 0) {
        return {
          success: false,
          error:
            "Bàn còn đơn đang mở. Hãy thanh toán hoặc hủy đơn trước khi đổi trạng thái bàn.",
        };
      }
    }

    const { error } = await supabase
      .from("tables")
      .update({
        number: data.number,
        branch_id: data.branch_id,
        zone_id: data.zone_id ?? null,
        ...(data.status ? { status: data.status } : {}),
      })
      .eq("id", data.id)
      .eq("tenant_id", claims.tenant_id);

    if (error) {
      console.error("[branch-settings/tables:updateTable] Update table error:", error);
      return { success: false, error: mapTableDbError(error.code) };
    }

    revalidateTableSettings(data.branch_id);
    return { success: true };
  },
);

export const deleteTable = withAction(
  {
    roles: SETTINGS_ROLES,
    schema: deleteIdSchema,
    permission: PERMISSION_KEYS.SETTINGS_BRANCH,
    requireBranchScope: true,
  },
  async (data, { supabase, claims }) => {
    let deleteTableQuery = supabase
      .from("tables")
      .delete()
      .eq("id", data.id)
      .eq("tenant_id", claims.tenant_id);

    if (claims.branch_id) {
      deleteTableQuery = deleteTableQuery.eq("branch_id", claims.branch_id);
    }

    const { data: result, error } =
      await deleteTableQuery.select("id, branch_id");

    if (error) {
      console.error("[branch-settings/tables:deleteTable] Delete table error:", error);
      return { success: false, error: mapTableDbError(error.code) };
    }

    if (!result || result.length === 0) {
      return { success: false, error: "Không tìm thấy bàn" };
    }

    revalidateTableSettings(result[0]!.branch_id);
    return { success: true };
  },
);
