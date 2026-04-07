"use server";

import { z } from "zod";
import type { StaffRole } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getAuthContext } from "../_lib/auth";
import { fetchHeadquartersBranchId } from "./_lib/headquarters";

const ROLES: readonly StaffRole[] = [
  "owner",
  "super_manager",
  "area_manager",
  "branch_manager",
];

export async function fetchStockTransferDetail(
  transferId: number,
): Promise<ActionResult> {
  const id = z.coerce.number().int().positive().safeParse(transferId);
  if (!id.success) return { success: false, error: "ID không hợp lệ" };
  const ctx = await getAuthContext(ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims } = ctx;
  const { data: tr, error: e1 } = await supabase
    .from("stock_transfers")
    .select("*")
    .eq("id", id.data)
    .eq("tenant_id", claims.tenant_id)
    .single();
  if (e1 || !tr)
    return { success: false, error: "Không tìm thấy phiếu chuyển." };
  const { data: lines, error: e2 } = await supabase
    .from("stock_transfer_items")
    .select("*, ingredients ( id, name, unit )")
    .eq("transfer_id", id.data)
    .eq("tenant_id", claims.tenant_id);
  if (e2) return { success: false, error: "Không tải được dòng chuyển." };
  return { success: true, data: { transfer: tr, lines: lines ?? [] } };
}

export async function fetchStockTransfers(): Promise<ActionResult> {
  const ctx = await getAuthContext(ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims } = ctx;
  const { data: transfers, error } = await supabase
    .from("stock_transfers")
    .select(
      "id, transfer_number, status, notes, vehicle_info, shipped_at, received_at, from_branch_id, to_branch_id, created_at",
    )
    .eq("tenant_id", claims.tenant_id)
    .order("created_at", { ascending: false });
  if (error) return { success: false, error: "Không thể tải phiếu chuyển." };
  const { data: branches } = await supabase
    .from("branches")
    .select("id, name")
    .eq("tenant_id", claims.tenant_id);
  const nameById = new Map(
    (branches ?? []).map((b) => [b.id, b.name] as const),
  );
  const enriched = (transfers ?? []).map((t) => ({
    ...t,
    from_branch_name: nameById.get(t.from_branch_id) ?? "—",
    to_branch_name: nameById.get(t.to_branch_id) ?? "—",
  }));
  return { success: true, data: enriched };
}

const transferCreateSchema = z.object({
  toBranchId: z.coerce.number().int().positive(),
  notes: z.string().optional(),
  vehicleInfo: z.string().optional(),
});

export async function createStockTransfer(
  input: z.infer<typeof transferCreateSchema>,
): Promise<ActionResult> {
  const parsed = transferCreateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }
  const ctx = await getAuthContext(ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims, user } = ctx;
  const hqId = await fetchHeadquartersBranchId(supabase, claims.tenant_id);
  if (!hqId) {
    return { success: false, error: "Chưa cấu hình Trụ sở." };
  }
  if (parsed.data.toBranchId === hqId) {
    return { success: false, error: "Chi nhánh đích phải khác Trụ sở." };
  }
  const transferNumber = `TRF-${Date.now()}`;
  const { data, error } = await supabase
    .from("stock_transfers")
    .insert({
      tenant_id: claims.tenant_id,
      from_branch_id: hqId,
      to_branch_id: parsed.data.toBranchId,
      transfer_number: transferNumber,
      status: "draft",
      notes: parsed.data.notes ?? null,
      vehicle_info: parsed.data.vehicleInfo ?? null,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error) {
    return { success: false, error: "Không thể tạo phiếu chuyển." };
  }
  return { success: true, data };
}

const transferLineSchema = z.object({
  transferId: z.coerce.number().int().positive(),
  ingredientId: z.coerce.number().int().positive(),
  quantity: z.coerce.number().positive(),
  unit: z.string().min(1),
});

export async function upsertTransferLine(
  input: z.infer<typeof transferLineSchema>,
): Promise<ActionResult> {
  const parsed = transferLineSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }
  const ctx = await getAuthContext(ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims } = ctx;
  const d = parsed.data;
  const { error } = await supabase.from("stock_transfer_items").upsert(
    {
      tenant_id: claims.tenant_id,
      transfer_id: d.transferId,
      ingredient_id: d.ingredientId,
      quantity: d.quantity,
      unit: d.unit,
    },
    { onConflict: "transfer_id,ingredient_id,tenant_id" },
  );
  if (error) {
    return { success: false, error: "Không thể lưu dòng chuyển." };
  }
  return { success: true };
}

export async function transferConfirmShip(
  transferId: number,
): Promise<ActionResult> {
  const id = z.coerce.number().int().positive().safeParse(transferId);
  if (!id.success) return { success: false, error: "ID không hợp lệ" };
  const ctx = await getAuthContext(ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase } = ctx;
  const { error } = await supabase.rpc("stock_transfer_confirm_ship", {
    p_transfer_id: id.data,
  });
  if (error) {
    console.error("transferConfirmShip", error);
    return {
      success: false,
      error: "Không thể xác nhận xuất (kiểm tra tồn Trụ sở).",
    };
  }
  return { success: true };
}

export async function transferMarkInTransit(
  transferId: number,
): Promise<ActionResult> {
  const id = z.coerce.number().int().positive().safeParse(transferId);
  if (!id.success) return { success: false, error: "ID không hợp lệ" };
  const ctx = await getAuthContext(ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase } = ctx;
  const { error } = await supabase.rpc("stock_transfer_mark_in_transit", {
    p_transfer_id: id.data,
  });
  if (error) {
    console.error("transferMarkInTransit", error);
    return { success: false, error: "Không thể chuyển trạng thái vận chuyển." };
  }
  return { success: true };
}

export async function transferReceive(
  transferId: number,
  items: Record<string, number> | null,
): Promise<ActionResult> {
  const id = z.coerce.number().int().positive().safeParse(transferId);
  if (!id.success) return { success: false, error: "ID không hợp lệ" };
  const ctx = await getAuthContext(ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase } = ctx;
  const { error } = await supabase.rpc("stock_transfer_receive", {
    p_transfer_id: id.data,
    p_items: items ?? null,
  });
  if (error) {
    console.error("transferReceive", error);
    return { success: false, error: "Không thể xác nhận nhập chi nhánh." };
  }
  return { success: true };
}

export async function fetchBranchesForTransfer(): Promise<ActionResult> {
  const ctx = await getAuthContext(ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims } = ctx;
  const { data, error } = await supabase
    .from("branches")
    .select("id, name, is_headquarters, is_active")
    .eq("tenant_id", claims.tenant_id)
    .eq("is_active", true)
    .order("name");
  if (error) return { success: false, error: "Không thể tải chi nhánh." };
  const ops = (data ?? []).filter((b) => !b.is_headquarters);
  return { success: true, data: ops };
}
