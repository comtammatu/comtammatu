"use server";

import { z } from "zod";
import { createClient } from "@comtammatu/database/supabase/server";
import { extractClaims } from "@comtammatu/shared/auth";

interface ActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

async function getAuthContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { supabase, tenantId: null, userRole: null };

  const claims = extractClaims(user.app_metadata);
  return {
    supabase,
    tenantId: claims?.tenant_id ?? null,
    userRole: claims?.user_role ?? null,
  };
}

// ─── Branch ────────────────────────────────────────────────────────────────

export type BranchRow = {
  id: number;
  tenant_id: number;
  name: string;
  is_active: boolean;
  is_headquarters: boolean;
};

export async function getBranches(): Promise<ActionResult<BranchRow[]>> {
  const { supabase, tenantId } = await getAuthContext();

  if (!tenantId) return { success: false, error: "Không có quyền truy cập" };

  const { data, error } = await supabase
    .from("branches")
    .select("id, tenant_id, name, is_active, is_headquarters")
    .eq("tenant_id", tenantId)
    .order("name", { ascending: true });

  if (error) return { success: false, error: "Không thể tải danh sách chi nhánh" };

  return { success: true, data: data ?? [] };
}

// ─── Zone ──────────────────────────────────────────────────────────────────

export type ZoneRow = {
  id: number;
  tenant_id: number;
  branch_id: number;
  name: string;
  sort_order: number;
  is_active: boolean;
};

const zoneSchema = z.object({
  name: z.string().min(1, { error: "Tên khu vực không được để trống" }),
  sort_order: z.number().int().min(0).optional(),
  is_active: z.boolean().optional(),
});

export async function getZones(branchId: number): Promise<ActionResult<ZoneRow[]>> {
  const { supabase, tenantId } = await getAuthContext();

  if (!tenantId) return { success: false, error: "Không có quyền truy cập" };

  const { data, error } = await supabase
    .from("branch_zones")
    .select("*")
    .eq("branch_id", branchId)
    .eq("tenant_id", tenantId)
    .order("sort_order", { ascending: true });

  if (error) return { success: false, error: "Không thể tải danh sách khu vực" };

  return { success: true, data: data ?? [] };
}

export async function createZone(
  branchId: number,
  formData: z.infer<typeof zoneSchema>,
): Promise<ActionResult<ZoneRow>> {
  const { supabase, tenantId } = await getAuthContext();

  if (!tenantId) return { success: false, error: "Không có quyền truy cập" };

  const parsed = zoneSchema.safeParse(formData);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const { data, error } = await supabase
    .from("branch_zones")
    .insert({
      tenant_id: tenantId,
      branch_id: branchId,
      name: parsed.data.name,
      sort_order: parsed.data.sort_order ?? 0,
      is_active: parsed.data.is_active ?? true,
    })
    .select()
    .single();

  if (error) return { success: false, error: "Không thể tạo khu vực" };

  return { success: true, data };
}

export async function updateZone(
  id: number,
  formData: z.infer<typeof zoneSchema>,
): Promise<ActionResult<ZoneRow>> {
  const { supabase, tenantId } = await getAuthContext();

  if (!tenantId) return { success: false, error: "Không có quyền truy cập" };

  const parsed = zoneSchema.safeParse(formData);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const { data: existing } = await supabase
    .from("branch_zones")
    .select("id")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .single();

  if (!existing) return { success: false, error: "Khu vực không tồn tại" };

  const { data, error } = await supabase
    .from("branch_zones")
    .update({
      name: parsed.data.name,
      sort_order: parsed.data.sort_order ?? 0,
      is_active: parsed.data.is_active ?? true,
    })
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select()
    .single();

  if (error) return { success: false, error: "Không thể cập nhật khu vực" };

  return { success: true, data };
}

export async function deleteZone(id: number): Promise<ActionResult> {
  const { supabase, tenantId } = await getAuthContext();

  if (!tenantId) return { success: false, error: "Không có quyền truy cập" };

  const { data: existing } = await supabase
    .from("branch_zones")
    .select("id")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .single();

  if (!existing) return { success: false, error: "Khu vực không tồn tại" };

  const { error } = await supabase
    .from("branch_zones")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId);

  if (error) return { success: false, error: "Không thể xóa khu vực" };

  return { success: true };
}

// ─── Table ─────────────────────────────────────────────────────────────────

export type TableRow = {
  id: number;
  tenant_id: number;
  branch_id: number;
  zone_id: number | null;
  name: string;
  capacity: number;
  is_active: boolean;
  zone_name?: string | null;
};

const tableSchema = z.object({
  name: z.string().min(1, { error: "Tên bàn không được để trống" }),
  capacity: z.number().int().min(1, { error: "Số chỗ ngồi phải ít nhất 1" }),
  zone_id: z.number().int().nullable().optional(),
  is_active: z.boolean().optional(),
});

export async function getTables(branchId: number): Promise<ActionResult<TableRow[]>> {
  const { supabase, tenantId } = await getAuthContext();

  if (!tenantId) return { success: false, error: "Không có quyền truy cập" };

  const { data, error } = await supabase
    .from("tables")
    .select("*, branch_zones(name)")
    .eq("branch_id", branchId)
    .eq("tenant_id", tenantId)
    .order("name", { ascending: true });

  if (error) return { success: false, error: "Không thể tải danh sách bàn" };

  const rows: TableRow[] = (data ?? []).map((row) => ({
    id: row.id,
    tenant_id: row.tenant_id,
    branch_id: row.branch_id,
    zone_id: row.zone_id,
    name: row.name,
    capacity: row.capacity,
    is_active: row.is_active,
    zone_name: (row.branch_zones as { name: string } | null)?.name ?? null,
  }));

  return { success: true, data: rows };
}

export async function createTable(
  branchId: number,
  formData: z.infer<typeof tableSchema>,
): Promise<ActionResult<TableRow>> {
  const { supabase, tenantId } = await getAuthContext();

  if (!tenantId) return { success: false, error: "Không có quyền truy cập" };

  const parsed = tableSchema.safeParse(formData);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const { data, error } = await supabase
    .from("tables")
    .insert({
      tenant_id: tenantId,
      branch_id: branchId,
      name: parsed.data.name,
      capacity: parsed.data.capacity,
      zone_id: parsed.data.zone_id ?? null,
      is_active: parsed.data.is_active ?? true,
    })
    .select()
    .single();

  if (error) return { success: false, error: "Không thể tạo bàn" };

  return { success: true, data };
}

export async function updateTable(
  id: number,
  formData: z.infer<typeof tableSchema>,
): Promise<ActionResult<TableRow>> {
  const { supabase, tenantId } = await getAuthContext();

  if (!tenantId) return { success: false, error: "Không có quyền truy cập" };

  const parsed = tableSchema.safeParse(formData);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const { data: existing } = await supabase
    .from("tables")
    .select("id")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .single();

  if (!existing) return { success: false, error: "Bàn không tồn tại" };

  const { data, error } = await supabase
    .from("tables")
    .update({
      name: parsed.data.name,
      capacity: parsed.data.capacity,
      zone_id: parsed.data.zone_id ?? null,
      is_active: parsed.data.is_active ?? true,
    })
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select()
    .single();

  if (error) return { success: false, error: "Không thể cập nhật bàn" };

  return { success: true, data };
}

export async function deleteTable(id: number): Promise<ActionResult> {
  const { supabase, tenantId } = await getAuthContext();

  if (!tenantId) return { success: false, error: "Không có quyền truy cập" };

  const { data: existing } = await supabase
    .from("tables")
    .select("id")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .single();

  if (!existing) return { success: false, error: "Bàn không tồn tại" };

  const { error } = await supabase
    .from("tables")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId);

  if (error) return { success: false, error: "Không thể xóa bàn" };

  return { success: true };
}
