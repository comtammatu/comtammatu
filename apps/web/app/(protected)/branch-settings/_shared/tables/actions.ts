"use server";

import { randomBytes } from "node:crypto";
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
const SELF_ORDER_QR_SELECT =
  "id, branch_id, self_order_token, self_order_enabled, self_order_token_rotated_at";

interface SelfOrderTableRow {
  id: number;
  branch_id: number;
  self_order_token: string | null;
  self_order_enabled: boolean;
  self_order_token_rotated_at: string | null;
}

interface SelfOrderQrActionData {
  token: string;
  enabled: boolean;
  rotatedAt: string | null;
}

interface DbErrorLike {
  code?: string;
  message?: string;
}

type ReadBuilder<T> = {
  eq(column: string, value: unknown): ReadBuilder<T>;
  maybeSingle(): Promise<{ data: T | null; error: DbErrorLike | null }>;
};

type UpdateBuilder<T> = {
  eq(column: string, value: unknown): UpdateBuilder<T>;
  select(columns: string): {
    maybeSingle(): Promise<{ data: T | null; error: DbErrorLike | null }>;
  };
};

type UntypedTablesClient = {
  select<T>(columns: string): ReadBuilder<T>;
  update<T>(values: Record<string, unknown>): UpdateBuilder<T>;
};

type SupabaseFrom = {
  from(table: string): unknown;
};

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

function mapSelfOrderQrDbError(code: string | undefined): string {
  if (code === "23505") return "Không thể tạo mã QR. Vui lòng thử lại.";
  return "Không xử lý được QR gọi món. Vui lòng thử lại.";
}

function tablesClient(supabase: unknown): UntypedTablesClient {
  return (supabase as SupabaseFrom).from("tables") as UntypedTablesClient;
}

function generateSelfOrderToken() {
  return randomBytes(24).toString("base64url");
}

function toQrActionData(row: SelfOrderTableRow): SelfOrderQrActionData | null {
  if (!row.self_order_token) return null;
  return {
    token: row.self_order_token,
    enabled: row.self_order_enabled,
    rotatedAt: row.self_order_token_rotated_at,
  };
}

async function loadSelfOrderTable(input: {
  supabase: unknown;
  tenantId: number;
  branchId: number | null;
  tableId: number;
}) {
  let query = tablesClient(input.supabase)
    .select<SelfOrderTableRow>(SELF_ORDER_QR_SELECT)
    .eq("id", input.tableId)
    .eq("tenant_id", input.tenantId);

  if (input.branchId) query = query.eq("branch_id", input.branchId);

  const { data, error } = await query.maybeSingle();
  if (error) {
    console.error("[branch-settings/tables:selfOrderQr] Load table error:", error);
    return { success: false as const, error: mapSelfOrderQrDbError(error.code) };
  }
  if (!data) {
    return { success: false as const, error: "Không tìm thấy bàn" };
  }
  if (!canOperateBranch(input.branchId, data.branch_id)) {
    return {
      success: false as const,
      error: "Không có quyền thao tác chi nhánh này",
    };
  }
  return { success: true as const, data };
}

async function updateSelfOrderTable(input: {
  supabase: unknown;
  tenantId: number;
  table: SelfOrderTableRow;
  values: Record<string, unknown>;
}) {
  const { data, error } = await tablesClient(input.supabase)
    .update<SelfOrderTableRow>(input.values)
    .eq("id", input.table.id)
    .eq("tenant_id", input.tenantId)
    .eq("branch_id", input.table.branch_id)
    .select(SELF_ORDER_QR_SELECT)
    .maybeSingle();

  if (error) {
    console.error("[branch-settings/tables:selfOrderQr] Update table error:", error);
    return { success: false as const, error: mapSelfOrderQrDbError(error.code) };
  }
  if (!data) {
    return { success: false as const, error: "Không tìm thấy bàn" };
  }
  revalidateTableSettings(data.branch_id);
  return { success: true as const, data };
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

const setTableSelfOrderQrEnabledSchema = z.object({
  id: z.coerce.number().int().positive({ error: "ID không hợp lệ" }),
  enabled: z.boolean(),
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

export const createTableSelfOrderQr = withAction<
  typeof deleteIdSchema,
  SelfOrderQrActionData
>(
  {
    roles: SETTINGS_ROLES,
    schema: deleteIdSchema,
    permission: PERMISSION_KEYS.SETTINGS_BRANCH,
    requireBranchScope: true,
  },
  async (data, { supabase, claims }) => {
    const loaded = await loadSelfOrderTable({
      supabase,
      tenantId: claims.tenant_id,
      branchId: claims.branch_id,
      tableId: data.id,
    });
    if (!loaded.success) return { success: false, error: loaded.error };

    const now = new Date().toISOString();
    const token = loaded.data.self_order_token ?? generateSelfOrderToken();
    const rotatedAt = loaded.data.self_order_token_rotated_at ?? now;
    const updated = await updateSelfOrderTable({
      supabase,
      tenantId: claims.tenant_id,
      table: loaded.data,
      values: {
        self_order_token: token,
        self_order_enabled: true,
        self_order_token_rotated_at: rotatedAt,
      },
    });
    if (!updated.success) return { success: false, error: updated.error };

    const qrData = toQrActionData(updated.data);
    if (!qrData) return { success: false, error: mapSelfOrderQrDbError(undefined) };
    return { success: true, data: qrData };
  },
);

export const setTableSelfOrderQrEnabled = withAction<
  typeof setTableSelfOrderQrEnabledSchema,
  SelfOrderQrActionData
>(
  {
    roles: SETTINGS_ROLES,
    schema: setTableSelfOrderQrEnabledSchema,
    permission: PERMISSION_KEYS.SETTINGS_BRANCH,
    requireBranchScope: true,
  },
  async (data, { supabase, claims }) => {
    const loaded = await loadSelfOrderTable({
      supabase,
      tenantId: claims.tenant_id,
      branchId: claims.branch_id,
      tableId: data.id,
    });
    if (!loaded.success) return { success: false, error: loaded.error };

    const token = loaded.data.self_order_token ?? generateSelfOrderToken();
    const rotatedAt =
      loaded.data.self_order_token_rotated_at ?? new Date().toISOString();
    const updated = await updateSelfOrderTable({
      supabase,
      tenantId: claims.tenant_id,
      table: loaded.data,
      values: {
        self_order_token: token,
        self_order_enabled: data.enabled,
        self_order_token_rotated_at: rotatedAt,
      },
    });
    if (!updated.success) return { success: false, error: updated.error };

    const qrData = toQrActionData(updated.data);
    if (!qrData) return { success: false, error: mapSelfOrderQrDbError(undefined) };
    return { success: true, data: qrData };
  },
);

export const rotateTableSelfOrderQr = withAction<
  typeof deleteIdSchema,
  SelfOrderQrActionData
>(
  {
    roles: SETTINGS_ROLES,
    schema: deleteIdSchema,
    permission: PERMISSION_KEYS.SETTINGS_BRANCH,
    requireBranchScope: true,
  },
  async (data, { supabase, claims }) => {
    const loaded = await loadSelfOrderTable({
      supabase,
      tenantId: claims.tenant_id,
      branchId: claims.branch_id,
      tableId: data.id,
    });
    if (!loaded.success) return { success: false, error: loaded.error };

    const updated = await updateSelfOrderTable({
      supabase,
      tenantId: claims.tenant_id,
      table: loaded.data,
      values: {
        self_order_token: generateSelfOrderToken(),
        self_order_enabled: true,
        self_order_token_rotated_at: new Date().toISOString(),
      },
    });
    if (!updated.success) return { success: false, error: updated.error };

    const qrData = toQrActionData(updated.data);
    if (!qrData) return { success: false, error: mapSelfOrderQrDbError(undefined) };
    return { success: true, data: qrData };
  },
);
