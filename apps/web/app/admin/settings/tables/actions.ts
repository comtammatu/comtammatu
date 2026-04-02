"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@comtammatu/database/supabase/server";
import type { StaffRole } from "@comtammatu/shared/auth";
import { getAuthContext } from "../../_lib/auth";

/* ─── Types ─── */

interface ActionResult {
  success: boolean;
  error?: string;
}

/* ─── Helpers ─── */

const SETTINGS_ROLES: StaffRole[] = ["owner", "super_manager"];

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

/* ─── Table Schemas ─── */

const createTableSchema = z.object({
  number: z.coerce.number().int().positive({ error: "Số bàn không hợp lệ" }),
  branch_id: z.coerce.number().int().positive({ error: "Chọn chi nhánh" }),
  zone_id: z.coerce.number().int().positive().optional(),
  capacity: z.coerce
    .number()
    .int()
    .min(1, { error: "Sức chứa phải ít nhất 1" })
    .default(4),
});

const TABLE_STATUSES = [
  "available",
  "occupied",
  "reserved",
  "maintenance",
] as const;

const updateTableSchema = z.object({
  id: z.coerce.number().int().positive(),
  number: z.coerce.number().int().positive({ error: "Số bàn không hợp lệ" }),
  branch_id: z.coerce.number().int().positive({ error: "Chọn chi nhánh" }),
  zone_id: z.coerce.number().int().positive().optional(),
  capacity: z.coerce
    .number()
    .int()
    .min(1, { error: "Sức chứa phải ít nhất 1" })
    .default(4),
  status: z.enum(TABLE_STATUSES).optional(),
});

/* ─── Zone Actions ─── */

export async function createZone(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = createZoneSchema.safeParse({
    name: formData.get("name"),
    branch_id: formData.get("branch_id"),
    sort_order: formData.get("sort_order") || 0,
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

  if (!(await verifyBranchOwnership(supabase, parsed.data.branch_id, claims.tenant_id))) {
    return { success: false, error: "Chi nhánh không hợp lệ" };
  }

  const { error } = await supabase.from("branch_zones").insert({
    tenant_id: claims.tenant_id,
    branch_id: parsed.data.branch_id,
    name: parsed.data.name,
    sort_order: parsed.data.sort_order,
  });

  if (error) {
    return { success: false, error: mapZoneDbError(error.code) };
  }

  revalidatePath("/admin/settings/tables");
  return { success: true };
}

export async function updateZone(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = updateZoneSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    branch_id: formData.get("branch_id"),
    sort_order: formData.get("sort_order") || 0,
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

  if (!(await verifyBranchOwnership(supabase, parsed.data.branch_id, claims.tenant_id))) {
    return { success: false, error: "Chi nhánh không hợp lệ" };
  }

  const { error } = await supabase
    .from("branch_zones")
    .update({
      name: parsed.data.name,
      branch_id: parsed.data.branch_id,
      sort_order: parsed.data.sort_order,
    })
    .eq("id", parsed.data.id)
    .eq("tenant_id", claims.tenant_id);

  if (error) {
    return { success: false, error: mapZoneDbError(error.code) };
  }

  revalidatePath("/admin/settings/tables");
  return { success: true };
}

const deleteIdSchema = z.coerce.number().int().positive();

export async function deleteZone(zoneId: number): Promise<ActionResult> {
  const parsed = deleteIdSchema.safeParse(zoneId);
  if (!parsed.success) return { success: false, error: "ID không hợp lệ" };

  const ctx = await getAuthContext(SETTINGS_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  const { data, error } = await supabase
    .from("branch_zones")
    .delete()
    .eq("id", parsed.data)
    .eq("tenant_id", claims.tenant_id)
    .select("id");

  if (error) {
    return { success: false, error: mapZoneDbError(error.code) };
  }

  if (!data || data.length === 0) {
    return { success: false, error: "Không tìm thấy khu vực" };
  }

  revalidatePath("/admin/settings/tables");
  return { success: true };
}

/* ─── Table Actions ─── */

export async function createTable(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const rawZoneId = formData.get("zone_id");
  const zoneId = rawZoneId && rawZoneId !== "none" ? rawZoneId : undefined;

  const parsed = createTableSchema.safeParse({
    number: formData.get("number"),
    branch_id: formData.get("branch_id"),
    zone_id: zoneId,
    capacity: formData.get("capacity") || 4,
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

  if (!(await verifyBranchOwnership(supabase, parsed.data.branch_id, claims.tenant_id))) {
    return { success: false, error: "Chi nhánh không hợp lệ" };
  }

  const { error } = await supabase.from("tables").insert({
    tenant_id: claims.tenant_id,
    branch_id: parsed.data.branch_id,
    zone_id: parsed.data.zone_id ?? null,
    number: parsed.data.number,
    capacity: parsed.data.capacity,
  });

  if (error) {
    return { success: false, error: mapTableDbError(error.code) };
  }

  revalidatePath("/admin/settings/tables");
  return { success: true };
}

export async function updateTable(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const rawZoneId = formData.get("zone_id");
  const zoneId = rawZoneId && rawZoneId !== "none" ? rawZoneId : undefined;

  const rawStatus = formData.get("status");

  const parsed = updateTableSchema.safeParse({
    id: formData.get("id"),
    number: formData.get("number"),
    branch_id: formData.get("branch_id"),
    zone_id: zoneId,
    capacity: formData.get("capacity") || 4,
    status: rawStatus ? rawStatus : undefined,
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

  if (!(await verifyBranchOwnership(supabase, parsed.data.branch_id, claims.tenant_id))) {
    return { success: false, error: "Chi nhánh không hợp lệ" };
  }

  const { error } = await supabase
    .from("tables")
    .update({
      number: parsed.data.number,
      branch_id: parsed.data.branch_id,
      zone_id: parsed.data.zone_id ?? null,
      capacity: parsed.data.capacity,
      ...(parsed.data.status ? { status: parsed.data.status } : {}),
    })
    .eq("id", parsed.data.id)
    .eq("tenant_id", claims.tenant_id);

  if (error) {
    return { success: false, error: mapTableDbError(error.code) };
  }

  revalidatePath("/admin/settings/tables");
  return { success: true };
}

export async function deleteTable(tableId: number): Promise<ActionResult> {
  const parsed = deleteIdSchema.safeParse(tableId);
  if (!parsed.success) return { success: false, error: "ID không hợp lệ" };

  const ctx = await getAuthContext(SETTINGS_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  const { data, error } = await supabase
    .from("tables")
    .delete()
    .eq("id", parsed.data)
    .eq("tenant_id", claims.tenant_id)
    .select("id");

  if (error) {
    return { success: false, error: mapTableDbError(error.code) };
  }

  if (!data || data.length === 0) {
    return { success: false, error: "Không tìm thấy bàn" };
  }

  revalidatePath("/admin/settings/tables");
  return { success: true };
}
