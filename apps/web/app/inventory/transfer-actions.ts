"use server";

import { z } from "zod";
import { INVENTORY_OPS_ROLES, PERMISSION_KEYS } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getAuthContextWithPermission } from "./_lib/auth";
import { withAction } from "@/_lib/with-action";
import type { TenantSupabase } from "./_lib/types";
import { resolveDefaultInventoryLocation } from "./_lib/inventory-location-compat";
import { PG_ERR } from "./_lib/constants";
import { getBranchSiteDisplayName } from "./_lib/branch-site-labels";

const ROLES = INVENTORY_OPS_ROLES;

export async function fetchStockTransferDetail(
  transferId: number,
): Promise<ActionResult> {
  const id = z.coerce.number().int().positive().safeParse(transferId);
  if (!id.success) return { success: false, error: "ID không hợp lệ" };
  const ctx = await getAuthContextWithPermission(ROLES, PERMISSION_KEYS.INVENTORY_TRANSFER_CREATE);
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
    .select("*, ingredients ( id, name, unit, purchase_unit )")
    .eq("transfer_id", id.data)
    .eq("tenant_id", claims.tenant_id);
  if (e2) return { success: false, error: "Không tải được dòng chuyển." };
  const { data: branches } = await supabase
    .from("branches")
    .select("id, name, branch_kind")
    .eq("tenant_id", claims.tenant_id)
    .in("id", [tr.from_branch_id, tr.to_branch_id]);
  const nameById = new Map(
    (branches ?? []).map((b) => [b.id, getBranchSiteDisplayName(b)] as const),
  );
  const enriched = {
    ...tr,
    from_branch_name: nameById.get(tr.from_branch_id) ?? null,
    to_branch_name: nameById.get(tr.to_branch_id) ?? null,
  };
  return { success: true, data: { transfer: enriched, lines: lines ?? [] } };
}

export async function fetchStockTransfers(
  branchId?: number,
): Promise<ActionResult> {
  const ctx = await getAuthContextWithPermission(ROLES, PERMISSION_KEYS.INVENTORY_TRANSFER_CREATE);
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims } = ctx;
  let transferQuery = supabase
    .from("stock_transfers")
    .select(
      "id, transfer_number, status, notes, vehicle_info, shipped_at, received_at, receive_started_at, from_branch_id, to_branch_id, from_location_id, to_location_id, created_at",
    )
    .eq("tenant_id", claims.tenant_id);

  // Explicit filter wins; otherwise branch-scoped roles are limited to their own branch.
  const involvingBranch = branchId ?? claims.branch_id ?? null;
  if (involvingBranch != null) {
    transferQuery = transferQuery.or(
      `from_branch_id.eq.${involvingBranch},to_branch_id.eq.${involvingBranch}`,
    );
  }

  const { data: transfers, error } = await transferQuery.order("created_at", {
    ascending: false,
  });
  if (error) return { success: false, error: "Không thể tải phiếu chuyển." };
  const { data: branches } = await supabase
    .from("branches")
    .select("id, name, branch_kind")
    .eq("tenant_id", claims.tenant_id);
  const nameById = new Map(
    (branches ?? []).map((b) => [b.id, getBranchSiteDisplayName(b)] as const),
  );
  const enriched = (transfers ?? []).map((t) => ({
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

const transferCreateSchema = z.object({
  fromBranchId: z.coerce.number().int().positive(),
  toBranchId: z.coerce.number().int().positive(),
  fromLocationId: z.coerce.number().int().positive().optional(),
  toLocationId: z.coerce.number().int().positive().optional(),
  notes: z.string().optional(),
  vehicleInfo: z.string().optional(),
  lines: z.array(transferLineInputSchema).optional(),
});

async function loadBranchKind(
  supabase: TenantSupabase,
  tenantId: number,
  branchId: number,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("branches")
    .select("branch_kind")
    .eq("tenant_id", tenantId)
    .eq("id", branchId)
    .maybeSingle();
  if (error || !data) return null;
  return data.branch_kind;
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
  const ctx = await getAuthContextWithPermission(ROLES, PERMISSION_KEYS.INVENTORY_TRANSFER_CREATE);
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims } = ctx;

  const { fromBranchId, toBranchId } = parsed.data;
  const isIntraBranch = fromBranchId === toBranchId;

  // Intra-branch: must have different locations
  if (isIntraBranch) {
    if (!parsed.data.fromLocationId || !parsed.data.toLocationId) {
      return { success: false, error: "Chuyển nội bộ cần chọn vị trí kho gửi và nhận." };
    }
    if (parsed.data.fromLocationId === parsed.data.toLocationId) {
      return { success: false, error: "Vị trí gửi và nhận phải khác nhau." };
    }
  }

  // Validate branch_kind for inter-branch transfers
  if (!isIntraBranch) {
    const fromKind = await loadBranchKind(supabase, claims.tenant_id, fromBranchId);
    const toKind = await loadBranchKind(supabase, claims.tenant_id, toBranchId);
    if (!fromKind || !toKind) {
      return { success: false, error: "Chi nhánh không hợp lệ." };
    }
    // branch → branch not allowed (Kho Bếp CN1 → Kho Bếp CN2)
    if (fromKind === "branch" && toKind === "branch") {
      return { success: false, error: "Không được chuyển giữa hai chi nhánh vận hành." };
    }
  }

  // Branch-scoped role check
  if (
    claims.user_role &&
    ["branch_manager", "warehouse_manager", "production_manager"].includes(claims.user_role) &&
    claims.branch_id != null
  ) {
    const my = claims.branch_id;
    if (fromBranchId !== my && toBranchId !== my) {
      return { success: false, error: "Bạn chỉ được tạo phiếu chuyển liên quan đến kho của mình." };
    }
  }

  const transferNumber = await nextTransferNumber(supabase);

  // Resolve locations if not provided
  const fromLocationId = parsed.data.fromLocationId ?? await resolveDefaultInventoryLocation(
    supabase,
    claims.tenant_id,
    fromBranchId,
    "issue",
  );
  const toLocationId = parsed.data.toLocationId ?? await resolveDefaultInventoryLocation(
    supabase,
    claims.tenant_id,
    toBranchId,
    "receive",
  );

  const transferLines = (parsed.data.lines ?? []).map((line) => ({
    ingredientId: line.ingredientId,
    quantity: line.quantity,
    unit: line.unit,
  }));
  const { data, error } = await supabase.rpc("create_stock_transfer_draft", {
    p_from_branch_id: fromBranchId,
    p_to_branch_id: toBranchId,
    p_from_location_id: fromLocationId ?? undefined,
    p_to_location_id: toLocationId ?? undefined,
    p_transfer_number: transferNumber,
    p_notes: parsed.data.notes ?? undefined,
    p_vehicle_info: isIntraBranch ? undefined : (parsed.data.vehicleInfo ?? undefined),
    p_lines: transferLines,
  });

  if (error) {
    if (error.code === PG_ERR.INSUFFICIENT_PRIVILEGE) {
      return { success: false, error: "Không có quyền tạo phiếu chuyển." };
    }
    if (error.code === PG_ERR.CHECK_VIOLATION || error.code === PG_ERR.INVALID_TEXT_REPRESENTATION) {
      return {
        success: false,
        error: "Thông tin kho luân chuyển không hợp lệ.",
      };
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

export const upsertTransferLine = withAction(
  { roles: ROLES, schema: transferLineSchema },
  async (d, { supabase, claims }) => {
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
  },
);

export async function transferConfirmShip(
  transferId: number,
): Promise<ActionResult> {
  const id = z.coerce.number().int().positive().safeParse(transferId);
  if (!id.success) return { success: false, error: "ID không hợp lệ" };
  const ctx = await getAuthContextWithPermission(ROLES, PERMISSION_KEYS.INVENTORY_TRANSFER_CREATE);
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase } = ctx;
  const { error } = await supabase.rpc("stock_transfer_confirm_ship", {
    p_transfer_id: id.data,
  });
  if (error) {
    console.error("transferConfirmShip", error);
    return {
      success: false,
      error: "Không thể xác nhận xuất (kiểm tra tồn kho gửi).",
    };
  }
  return { success: true };
}

export async function transferMarkInTransit(
  transferId: number,
): Promise<ActionResult> {
  const id = z.coerce.number().int().positive().safeParse(transferId);
  if (!id.success) return { success: false, error: "ID không hợp lệ" };
  const ctx = await getAuthContextWithPermission(ROLES, PERMISSION_KEYS.INVENTORY_TRANSFER_CREATE);
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
  const ctx = await getAuthContextWithPermission(ROLES, PERMISSION_KEYS.INVENTORY_TRANSFER_CREATE);
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

  const ctx = await getAuthContextWithPermission(ROLES, PERMISSION_KEYS.INVENTORY_TRANSFER_CREATE);
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
  const ctx = await getAuthContextWithPermission(ROLES, PERMISSION_KEYS.INVENTORY_TRANSFER_CREATE);
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase } = ctx;
  const { data, error } = await supabase.rpc("stock_transfer_list_branches");
  if (error) return { success: false, error: "Không thể tải danh sách kho." };
  return { success: true, data: data ?? [] };
}

export async function fetchInventoryLocationsForBranch(
  branchId: number,
): Promise<ActionResult> {
  const id = z.coerce.number().int().positive().safeParse(branchId);
  if (!id.success) return { success: false, error: "ID không hợp lệ" };
  const ctx = await getAuthContextWithPermission(ROLES, PERMISSION_KEYS.INVENTORY_TRANSFER_CREATE);
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims } = ctx;

  // Branch-scoped roles may only read their own branch's locations
  if (
    claims.branch_id != null &&
    ["branch_manager", "warehouse_manager", "production_manager"].includes(
      claims.user_role ?? "",
    ) &&
    id.data !== claims.branch_id
  ) {
    return { success: false, error: "Không có quyền xem vị trí kho này." };
  }

  const { data, error } = await supabase
    .from("inventory_locations")
    .select("id, name, code, location_kind")
    .eq("tenant_id", claims.tenant_id)
    .eq("branch_id", id.data)
    .eq("is_active", true)
    .order("sort_order");
  if (error) return { success: false, error: "Không thể tải vị trí kho." };
  return { success: true, data: data ?? [] };
}

/* ─── Helpers ─── */

async function nextTransferNumber(supabase: TenantSupabase): Promise<string> {
  const { data, error } = await supabase.rpc("next_inventory_doc_number", {
    p_kind: "trf",
  });
  if (error || typeof data !== "string" || data.length === 0) {
    // Fallback so a transient sequence-grant glitch doesn't block transfers.
    // Format mirrors the sequence output to keep downstream consumers happy.
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const fallback = String(Date.now()).slice(-4);
    return `TRF-${today}-${fallback}`;
  }
  return data;
}

/* ─── createStockRequisitionsFromIngredients (Smart Requisition from Stock) ─── */

const smartRequisitionSchema = z.object({
  toBranchId: z.coerce.number().int().positive(),
  fromBranchId: z.coerce.number().int().positive(),
  items: z
    .array(
      z.object({
        ingredientId: z.coerce.number().int().positive(),
        quantity: z.coerce.number().positive(),
        unit: z.string().min(1).optional(),
      }),
    )
    .min(1)
    .max(200),
  notes: z.string().max(500).optional(),
});

export interface SmartRequisitionResult {
  transfer_id: number;
  transfer_number: string;
  from_branch_id: number;
  to_branch_id: number;
  line_count: number;
}

const SMART_REQ_RPC_ERROR_MAP: Record<string, string> = {
  branches_required: "Thiếu thông tin chi nhánh.",
  branch_not_found: "Chi nhánh không tồn tại.",
  source_must_be_procurement:
    "Nguồn cấp phải là Kho Tổng hoặc Bếp Trung Tâm.",
  requisition_same_branch: "Không thể yêu cầu cấp hàng cho chính kho mình.",
  requisition_branch_to_branch:
    "Không được tạo yêu cầu giữa hai chi nhánh vận hành.",
  branch_scope_violation: "Bạn chỉ được tạo phiếu liên quan đến kho của mình.",
  forbidden: "Bạn không có quyền tạo phiếu chuyển.",
  items_required: "Cần chọn ít nhất 1 nguyên liệu.",
  no_lines_inserted: "Không tạo được dòng nguyên liệu nào.",
};

export const createStockRequisitionsFromIngredients = withAction(
  {
    roles: ROLES,
    schema: smartRequisitionSchema,
    permission: PERMISSION_KEYS.INVENTORY_TRANSFER_CREATE,
  },
  async (
    data,
    { supabase, claims },
  ): Promise<ActionResult<SmartRequisitionResult>> => {
    if (data.fromBranchId === data.toBranchId) {
      return {
        success: false,
        error: "Không thể yêu cầu cấp hàng cho chính kho mình.",
      };
    }

    // Branch-scoped role check (mirrors createStockTransfer).
    if (
      claims.user_role &&
      ["branch_manager", "warehouse_manager", "production_manager"].includes(
        claims.user_role,
      ) &&
      claims.branch_id != null
    ) {
      const my = claims.branch_id;
      if (data.fromBranchId !== my && data.toBranchId !== my) {
        return {
          success: false,
          error: "Bạn chỉ được tạo phiếu liên quan đến kho của mình.",
        };
      }
    }

    const { data: rpcData, error } = await supabase.rpc(
      "create_stock_requisitions_from_ingredients",
      {
        p_to_branch_id: data.toBranchId,
        p_from_branch_id: data.fromBranchId,
        p_items: data.items.map((item) => ({
          ingredientId: item.ingredientId,
          quantity: item.quantity,
          unit: item.unit ?? null,
        })),
        ...(data.notes !== undefined && { p_notes: data.notes }),
      },
    );

    if (error) {
      const mapped = SMART_REQ_RPC_ERROR_MAP[error.message];
      return {
        success: false,
        error: mapped ?? "Không thể tạo yêu cầu cấp hàng.",
      };
    }

    const payload = rpcData as unknown as SmartRequisitionResult | null;
    if (!payload || typeof payload.transfer_id !== "number") {
      return { success: false, error: "Không thể tạo yêu cầu cấp hàng." };
    }

    return { success: true, data: payload };
  },
);
