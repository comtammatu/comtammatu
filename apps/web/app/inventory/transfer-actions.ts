"use server";

import { randomUUID } from "crypto";
import { z } from "zod";
import type { StaffRole } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getAuthContext } from "./_lib/auth";
import { fetchHeadquartersBranchId } from "./_lib/headquarters";
import type { Database, SupabaseClient } from "@comtammatu/database";
import {
  resolveDefaultInventoryLocation,
  withInventoryLocationCompatFallback,
} from "./_lib/inventory-location-compat";

type TenantSupabase = SupabaseClient<Database>;

const ROLES: readonly StaffRole[] = [
  "super_manager",
  "area_manager",
  "branch_manager",
];

/** For RSC/UI: id điểm vận hành Trụ sở (nhãn nút luân chuyển). */
export async function resolveHeadquartersBranchId(): Promise<number | null> {
  const ctx = await getAuthContext(ROLES);
  if (!ctx) return null;
  return fetchHeadquartersBranchId(ctx.supabase, ctx.claims.tenant_id);
}

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- location columns are compatibility-prep before db:types regenerate
  const sb = supabase as any;
  const { data: transfers, error } = await withInventoryLocationCompatFallback(
    () =>
      sb
        .from("stock_transfers")
        .select(
          "id, transfer_number, status, notes, vehicle_info, shipped_at, received_at, receive_started_at, from_branch_id, to_branch_id, from_location_id, to_location_id, created_at",
        )
        .eq("tenant_id", claims.tenant_id)
        .order("created_at", { ascending: false }),
    () =>
      sb
        .from("stock_transfers")
        .select(
          "id, transfer_number, status, notes, vehicle_info, shipped_at, received_at, receive_started_at, from_branch_id, to_branch_id, created_at",
        )
        .eq("tenant_id", claims.tenant_id)
        .order("created_at", { ascending: false }),
  );
  if (error) return { success: false, error: "Không thể tải phiếu chuyển." };
  const { data: branches } = await supabase
    .from("branches")
    .select("id, name")
    .eq("tenant_id", claims.tenant_id);
  const nameById = new Map(
    (branches ?? []).map((b) => [b.id, b.name] as const),
  );
  const transferRows = (transfers ?? []) as Array<{
    from_branch_id: number;
    to_branch_id: number;
  } & Record<string, unknown>>;
  const enriched = transferRows.map((t) => ({
    ...t,
    from_branch_name: nameById.get(t.from_branch_id) ?? "—",
    to_branch_name: nameById.get(t.to_branch_id) ?? "—",
  }));
  return { success: true, data: enriched };
}

const transferLineInputSchema = z.object({
  ingredientId: z.coerce.number().int().positive(),
  quantity: z.coerce.number().positive(),
  unit: z.string().min(1),
});

const transferCreateSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("hq_to_branch"),
    toBranchId: z.coerce.number().int().positive(),
    notes: z.string().optional(),
    vehicleInfo: z.string().optional(),
    lines: z.array(transferLineInputSchema).optional(),
  }),
  z.object({
    kind: z.literal("branch_to_hq"),
    fromBranchId: z.coerce.number().int().positive(),
    notes: z.string().optional(),
    vehicleInfo: z.string().optional(),
    lines: z.array(transferLineInputSchema).optional(),
  }),
  z.object({
    kind: z.literal("branch_to_branch"),
    fromBranchId: z.coerce.number().int().positive(),
    toBranchId: z.coerce.number().int().positive(),
    notes: z.string().optional(),
    vehicleInfo: z.string().optional(),
    lines: z.array(transferLineInputSchema).optional(),
  }),
]);

async function loadBranchHeadquartersFlag(
  supabase: TenantSupabase,
  tenantId: number,
  branchId: number,
): Promise<boolean | null> {
  const { data, error } = await supabase
    .from("branches")
    .select("is_headquarters")
    .eq("tenant_id", tenantId)
    .eq("id", branchId)
    .single();
  if (error || !data) return null;
  return data.is_headquarters;
}

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
  const { supabase, claims } = ctx;
  const hqId = await fetchHeadquartersBranchId(supabase, claims.tenant_id);
  if (!hqId) {
    return { success: false, error: "Chưa cấu hình Trụ sở." };
  }

  let fromBranchId: number;
  let toBranchId: number;

  if (parsed.data.kind === "hq_to_branch") {
    const toHq = await loadBranchHeadquartersFlag(
      supabase,
      claims.tenant_id,
      parsed.data.toBranchId,
    );
    if (toHq == null || toHq === true || parsed.data.toBranchId === hqId) {
      return {
        success: false,
        error: "Kho nhận phải là điểm vận hành (không phải Trụ sở).",
      };
    }
    fromBranchId = hqId;
    toBranchId = parsed.data.toBranchId;
  } else if (parsed.data.kind === "branch_to_hq") {
    const fromHq = await loadBranchHeadquartersFlag(
      supabase,
      claims.tenant_id,
      parsed.data.fromBranchId,
    );
    if (
      fromHq == null ||
      fromHq === true ||
      parsed.data.fromBranchId === hqId
    ) {
      return {
        success: false,
        error: "Kho gửi phải là điểm vận hành (không phải Trụ sở).",
      };
    }
    fromBranchId = parsed.data.fromBranchId;
    toBranchId = hqId;
  } else {
    if (parsed.data.fromBranchId === parsed.data.toBranchId) {
      return { success: false, error: "Kho gửi và kho nhận phải khác nhau." };
    }
    const fromHq = await loadBranchHeadquartersFlag(
      supabase,
      claims.tenant_id,
      parsed.data.fromBranchId,
    );
    const toHq = await loadBranchHeadquartersFlag(
      supabase,
      claims.tenant_id,
      parsed.data.toBranchId,
    );
    if (fromHq == null || toHq == null || fromHq === true || toHq === true) {
      return {
        success: false,
        error: "Luân chuyển nội bộ chỉ áp dụng giữa các kho vận hành.",
      };
    }
    fromBranchId = parsed.data.fromBranchId;
    toBranchId = parsed.data.toBranchId;
  }

  if (claims.user_role === "branch_manager" && claims.branch_id != null) {
    const my = claims.branch_id;
    if (my === hqId) {
      if (parsed.data.kind === "hq_to_branch") {
        /* xuất từ Trụ sở */
      } else if (parsed.data.kind === "branch_to_hq" && toBranchId === hqId) {
        /* nhập về Trụ sở từ chi nhánh */
      } else {
        return {
          success: false,
          error:
            "Tài khoản Trụ sở chỉ tạo phiếu xuất đi kho vận hành hoặc nhập về Trụ sở.",
        };
      }
    } else if (parsed.data.kind === "hq_to_branch") {
      if (toBranchId !== my) {
        return {
          success: false,
          error: "Phiếu nhập chỉ nhận về kho của bạn.",
        };
      }
    } else if (fromBranchId !== my) {
      return {
        success: false,
        error: "Phiếu xuất chỉ gửi từ kho của bạn.",
      };
    }
  }

  const transferNumber = `TRF-${randomUUID().slice(0, 8)}`;
  const fromLocationId = await resolveDefaultInventoryLocation(
    supabase,
    claims.tenant_id,
    fromBranchId,
    "issue",
  );
  const toLocationId = await resolveDefaultInventoryLocation(
    supabase,
    claims.tenant_id,
    toBranchId,
    "receive",
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- compatibility RPC payload before db:types regenerate
  const sb = supabase as any;
  const transferLines = (parsed.data.lines ?? []).map((line) => ({
    ingredientId: line.ingredientId,
    quantity: line.quantity,
    unit: line.unit,
  }));
  const { data, error } = await withInventoryLocationCompatFallback(
    () =>
      sb.rpc("create_stock_transfer_draft", {
        p_from_branch_id: fromBranchId,
        p_to_branch_id: toBranchId,
        p_from_location_id: fromLocationId,
        p_to_location_id: toLocationId,
        p_transfer_number: transferNumber,
        p_notes: parsed.data.notes ?? null,
        p_vehicle_info: parsed.data.vehicleInfo ?? null,
        p_lines: transferLines,
      }),
    () =>
      sb.rpc("create_stock_transfer_draft", {
        p_from_branch_id: fromBranchId,
        p_to_branch_id: toBranchId,
        p_transfer_number: transferNumber,
        p_notes: parsed.data.notes ?? null,
        p_vehicle_info: parsed.data.vehicleInfo ?? null,
        p_lines: transferLines,
      }),
  );

  if (error) {
    if (error.code === "42501") {
      return { success: false, error: "Không có quyền tạo phiếu chuyển." };
    }
    if (error.code === "23514" || error.code === "22023") {
      return { success: false, error: "Thông tin kho luân chuyển không hợp lệ." };
    }
    return { success: false, error: "Không thể tạo phiếu chuyển." };
  }

  const result = data as unknown as { id?: number } | null;
  if (!result?.id) {
    return { success: false, error: "Không thể tạo phiếu chuyển." };
  }

  return { success: true, data: { id: result.id } };
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

export async function transferConfirmReceive(
  transferId: number,
): Promise<ActionResult> {
  const id = z.coerce.number().int().positive().safeParse(transferId);
  if (!id.success) return { success: false, error: "ID không hợp lệ" };
  const ctx = await getAuthContext(ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase } = ctx;
  const { error } = await supabase.rpc("stock_transfer_confirm_receive", {
    p_transfer_id: id.data,
  });
  if (error) {
    console.error("transferConfirmReceive", error);
    return {
      success: false,
      error: "Không thể bắt đầu kiểm nhận (phiếu phải đang vận chuyển).",
    };
  }
  return { success: true };
}

export async function transferReceive(
  transferId: number,
  items: Record<string, number | { qty: number; note?: string }> | null,
): Promise<ActionResult> {
  const id = z.coerce.number().int().positive().safeParse(transferId);
  if (!id.success) return { success: false, error: "ID không hợp lệ" };

  // Validate items shape
  if (items) {
    for (const val of Object.values(items)) {
      if (typeof val === "object" && val !== null) {
        if (typeof val.qty !== "number" || val.qty < 0) {
          return { success: false, error: "Số lượng nhận không hợp lệ." };
        }
      } else if (typeof val !== "number" || val < 0) {
        return { success: false, error: "Số lượng nhận không hợp lệ." };
      }
    }
  }

  const ctx = await getAuthContext(ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase } = ctx;
  const { error } = await supabase.rpc("stock_transfer_receive", {
    p_transfer_id: id.data,
    p_items: items ?? null,
  });
  if (error) {
    console.error("transferReceive", error);
    return { success: false, error: "Không thể xác nhận nhập kho đích." };
  }
  return { success: true };
}

export async function fetchBranchesForTransfer(): Promise<ActionResult> {
  const ctx = await getAuthContext(ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase } = ctx;
  const { data, error } = await supabase.rpc("stock_transfer_list_branches");
  if (error) return { success: false, error: "Không thể tải danh sách kho." };
  return { success: true, data: data ?? [] };
}
