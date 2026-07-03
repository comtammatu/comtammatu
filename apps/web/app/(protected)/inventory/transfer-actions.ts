"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  INVENTORY_OPS_ROLES,
  PERMISSION_KEYS,
  type JwtClaims,
  type StaffRole,
} from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getAuthContext, getAuthContextWithPermission } from "./_lib/auth";
import type { TenantSupabase } from "./_lib/types";
import { resolveDefaultInventoryLocation } from "./_lib/inventory-location-compat";
import { PG_ERR } from "./_lib/constants";
import { getBranchSiteDisplayName } from "./_lib/branch-site-labels";

const ROLES = INVENTORY_OPS_ROLES;
const BRANCH_SCOPED_TRANSFER_ROLES: readonly StaffRole[] = [
  "branch_manager",
  "warehouse_manager",
  "production_manager",
];
const BRANCH_MANAGER_INTER_SITE_TRANSFER_ERROR =
  "Quản lý chi nhánh chỉ được nhận phiếu chuyển về chi nhánh.";
const INTRA_BRANCH_TRANSFER_RETIRED_ERROR =
  "Kho chi nhánh sang bếp chi nhánh là tiêu hao bán hàng, không phải phiếu điều chuyển.";

function isBranchScopedTransferRole(role: StaffRole): boolean {
  return BRANCH_SCOPED_TRANSFER_ROLES.includes(role);
}

function transferInvolvesBranch(
  transfer: Pick<TransferPermissionRow, "from_branch_id" | "to_branch_id">,
  branchId: number,
): boolean {
  return (
    transfer.from_branch_id === branchId || transfer.to_branch_id === branchId
  );
}

function isAllowedInterSiteDirection(
  fromKind: string,
  toKind: string,
): boolean {
  return (
    (fromKind === "branch" &&
      (toKind === "branch" ||
        toKind === "central_supply" ||
        toKind === "central_kitchen")) ||
    ((fromKind === "central_supply" || fromKind === "central_kitchen") &&
      toKind === "branch") ||
    (fromKind === "central_supply" && toKind === "central_kitchen") ||
    (fromKind === "central_kitchen" && toKind === "central_supply")
  );
}

function enforceTransferActionScope(
  claims: JwtClaims,
  transfer: TransferPermissionRow,
  side: "from" | "to",
  requiredPermission: string,
): string | null {
  if (!isBranchScopedTransferRole(claims.user_role)) return null;

  const ownBranchId = claims.branch_id;
  if (ownBranchId == null) {
    return "Tài khoản cần gắn với kho vận hành.";
  }

  if (claims.user_role === "branch_manager") {
    if (requiredPermission === PERMISSION_KEYS.INVENTORY_TRANSFER_SHIP) {
      return BRANCH_MANAGER_INTER_SITE_TRANSFER_ERROR;
    }

    if (requiredPermission === PERMISSION_KEYS.INVENTORY_TRANSFER_CREATE) {
      return BRANCH_MANAGER_INTER_SITE_TRANSFER_ERROR;
    }

    if (
      requiredPermission === PERMISSION_KEYS.INVENTORY_TRANSFER_RECEIVE &&
      transfer.to_branch_id !== ownBranchId
    ) {
      return "Bạn chỉ được nhận phiếu về chi nhánh của mình.";
    }
  }

  if (side === "from" && transfer.from_branch_id !== ownBranchId) {
    return "Bạn chỉ được thao tác phiếu xuất từ kho của mình.";
  }
  if (side === "to" && transfer.to_branch_id !== ownBranchId) {
    return "Bạn chỉ được thao tác phiếu nhận về kho của mình.";
  }

  return null;
}

type TransferPermissionRow = {
  id: number;
  tenant_id: number;
  from_branch_id: number;
  to_branch_id: number;
  from_location_id: number | null;
  to_location_id: number | null;
  status: string;
};

type TransferPermissionCheck =
  | {
      success: true;
      supabase: TenantSupabase;
      transfer: TransferPermissionRow;
    }
  | { success: false; error: string };

async function loadTransferForPermission(
  transferId: number,
  permission: string | ((transfer: TransferPermissionRow) => string),
  side: "from" | "to",
): Promise<TransferPermissionCheck> {
  const ctx = await getAuthContext(ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims } = ctx;
  const { data: transfer, error: transferError } = await supabase
    .from("stock_transfers")
    .select(
      "id, tenant_id, from_branch_id, to_branch_id, from_location_id, to_location_id, status",
    )
    .eq("tenant_id", claims.tenant_id)
    .eq("id", transferId)
    .single();
  if (transferError || !transfer) {
    return { success: false, error: "Không tìm thấy phiếu chuyển." };
  }
  if (transfer.from_branch_id === transfer.to_branch_id) {
    return { success: false, error: INTRA_BRANCH_TRANSFER_RETIRED_ERROR };
  }

  const branchId =
    side === "from" ? transfer.from_branch_id : transfer.to_branch_id;
  const requiredPermission =
    typeof permission === "function" ? permission(transfer) : permission;
  const scopeError = enforceTransferActionScope(
    claims,
    transfer,
    side,
    requiredPermission,
  );
  if (scopeError) {
    return { success: false, error: scopeError };
  }
  const { data: allowed, error: permissionError } = await supabase.rpc(
    "has_permission",
    {
      p_branch_id: branchId,
      p_key: requiredPermission,
    },
  );
  if (permissionError || allowed !== true) {
    return { success: false, error: "Không có quyền" };
  }

  return { success: true, supabase, transfer };
}

export async function fetchStockTransferDetail(
  transferId: number,
  branchId?: number,
): Promise<ActionResult> {
  const id = z.coerce.number().int().positive().safeParse(transferId);
  if (!id.success) return { success: false, error: "ID không hợp lệ" };
  const ctx = await getAuthContextWithPermission(
    ROLES,
    PERMISSION_KEYS.INVENTORY_READ,
  );
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
  const requestedBranchId = branchId ?? null;
  if (isBranchScopedTransferRole(claims.user_role)) {
    if (
      claims.branch_id == null ||
      !transferInvolvesBranch(tr, claims.branch_id)
    ) {
      return { success: false, error: "Không tìm thấy phiếu chuyển." };
    }
  } else if (
    requestedBranchId != null &&
    !transferInvolvesBranch(tr, requestedBranchId)
  ) {
    return { success: false, error: "Không tìm thấy phiếu chuyển." };
  }
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

  // entry_unit_id on the line is the unit `quantity` is expressed in;
  // unit_cost_at_ship is per BASE unit (set by stock_transfer_confirm_ship).
  // Look up to_base_factor so the caller can convert before pricing the line.
  const entryUnitIds = [
    ...new Set(
      (lines ?? [])
        .map((l) => l.entry_unit_id as number | null)
        .filter((v): v is number => v != null),
    ),
  ];
  const ingredientIds = [
    ...new Set((lines ?? []).map((l) => l.ingredient_id as number)),
  ];
  let toBaseFactorByKey = new Map<string, number>();
  if (entryUnitIds.length > 0 && ingredientIds.length > 0) {
    const { data: unitRows } = await supabase
      .from("ingredient_units")
      .select("ingredient_id, unit_id, to_base_factor")
      .eq("tenant_id", claims.tenant_id)
      .in("ingredient_id", ingredientIds)
      .in("unit_id", entryUnitIds);
    toBaseFactorByKey = new Map(
      (unitRows ?? []).map((row) => [
        `${row.ingredient_id}:${row.unit_id}`,
        Number(row.to_base_factor),
      ]),
    );
  }
  const linesWithFactor = (lines ?? []).map((l) => ({
    ...l,
    to_base_factor:
      l.entry_unit_id == null
        ? null
        : (toBaseFactorByKey.get(`${l.ingredient_id}:${l.entry_unit_id}`) ??
          null),
  }));

  return {
    success: true,
    data: { transfer: enriched, lines: linesWithFactor },
  };
}

export async function fetchStockTransfers(
  branchId?: number,
): Promise<ActionResult> {
  const ctx = await getAuthContextWithPermission(
    ROLES,
    PERMISSION_KEYS.INVENTORY_READ,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims } = ctx;
  let transferQuery = supabase
    .from("stock_transfers")
    .select(
      "id, transfer_number, status, notes, vehicle_info, shipped_at, received_at, receive_started_at, from_branch_id, to_branch_id, from_location_id, to_location_id, created_at",
    )
    .eq("tenant_id", claims.tenant_id);

  const requestedBranchId = branchId ?? null;
  const involvingBranch = isBranchScopedTransferRole(claims.user_role)
    ? claims.branch_id
    : requestedBranchId;
  if (isBranchScopedTransferRole(claims.user_role) && involvingBranch == null) {
    return { success: false, error: "Tài khoản cần gắn với kho vận hành." };
  }
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
  // Issue-role unit the qty was entered in. NULL = already base;
  // stock_transfer_confirm_ship converts to base via inv_to_base().
  entryUnitId: z.coerce.number().int().positive().nullable().optional(),
});

const transferCreateSchema = z.object({
  fromBranchId: z.coerce.number().int().positive(),
  toBranchId: z.coerce.number().int().positive(),
  fromLocationId: z.coerce.number().int().positive().optional(),
  toLocationId: z.coerce.number().int().positive().optional(),
  notes: z.string().max(500, { error: "Ghi chú tối đa 500 ký tự" }).optional(),
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
  const { fromBranchId, toBranchId } = parsed.data;
  const ctx = await getAuthContext(ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims } = ctx;

  const isIntraBranch = fromBranchId === toBranchId;

  if (isIntraBranch) {
    return {
      success: false,
      error: INTRA_BRANCH_TRANSFER_RETIRED_ERROR,
    };
  }

  if (
    (claims.user_role === "warehouse_manager" ||
      claims.user_role === "production_manager") &&
    (claims.branch_id == null || fromBranchId !== claims.branch_id)
  ) {
    return {
      success: false,
      error: "Bạn chỉ được tạo phiếu xuất từ kho của mình.",
    };
  }

  const fromKind = await loadBranchKind(
    supabase,
    claims.tenant_id,
    fromBranchId,
  );
  const toKind = await loadBranchKind(supabase, claims.tenant_id, toBranchId);
  if (!fromKind || !toKind) {
    return { success: false, error: "Điểm vận hành không hợp lệ." };
  }
  if (!isAllowedInterSiteDirection(fromKind, toKind)) {
    return {
      success: false,
      error:
        "Luồng luân chuyển không hợp lệ. Chỉ hỗ trợ Kho Tổng/Bếp Trung Tâm cấp chi nhánh hoặc điều chuyển giữa các chi nhánh.",
    };
  }
  if (claims.user_role === "branch_manager") {
    if (claims.branch_id == null || toBranchId !== claims.branch_id) {
      return {
        success: false,
        error: "Quản lý chi nhánh chỉ được yêu cầu hàng về chi nhánh của mình.",
      };
    }
    if (fromKind !== "central_supply" && fromKind !== "central_kitchen") {
      return {
        success: false,
        error:
          "Quản lý chi nhánh chỉ được yêu cầu hàng từ Kho Tổng hoặc Bếp Trung Tâm.",
      };
    }
  }

  const permissionBranchId =
    claims.user_role === "branch_manager" ? toBranchId : fromBranchId;
  const { data: canCreate, error: canCreateError } = await supabase.rpc(
    "has_permission",
    {
      p_branch_id: permissionBranchId,
      p_key: PERMISSION_KEYS.INVENTORY_TRANSFER_CREATE,
    },
  );
  if (canCreateError || canCreate !== true) {
    return { success: false, error: "Không có quyền tạo phiếu chuyển." };
  }

  // Branch-scoped role check
  if (
    claims.user_role &&
    ["branch_manager", "warehouse_manager", "production_manager"].includes(
      claims.user_role,
    ) &&
    claims.branch_id != null
  ) {
    const my = claims.branch_id;
    if (fromBranchId !== my && toBranchId !== my) {
      return {
        success: false,
        error: "Bạn chỉ được tạo phiếu chuyển liên quan đến kho của mình.",
      };
    }
  }

  const transferNumber = `TRF-${randomUUID().slice(0, 8)}`;

  // Resolve locations if not provided
  const fromLocationId =
    parsed.data.fromLocationId ??
    (await resolveDefaultInventoryLocation(
      supabase,
      claims.tenant_id,
      fromBranchId,
      "issue",
    ));
  const toLocationId =
    parsed.data.toLocationId ??
    (await resolveDefaultInventoryLocation(
      supabase,
      claims.tenant_id,
      toBranchId,
      "receive",
    ));

  if (!fromLocationId || !toLocationId) {
    return {
      success: false,
      error: "Chưa cấu hình vị trí kho gửi hoặc kho nhận mặc định.",
    };
  }

  const transferLines = (parsed.data.lines ?? []).map((line) => ({
    ingredientId: line.ingredientId,
    quantity: line.quantity,
    unit: line.unit,
    entryUnitId: line.entryUnitId ?? null,
  }));

  const { data, error } = await supabase.rpc("create_stock_transfer_draft", {
    p_from_branch_id: fromBranchId,
    p_to_branch_id: toBranchId,
    p_from_location_id: fromLocationId,
    p_to_location_id: toLocationId,
    p_transfer_number: transferNumber,
    p_notes: parsed.data.notes ?? undefined,
    p_vehicle_info: parsed.data.vehicleInfo ?? undefined,
    p_lines: transferLines,
  });

  if (error) {
    if (error.code === PG_ERR.INSUFFICIENT_PRIVILEGE) {
      return { success: false, error: "Không có quyền tạo phiếu chuyển." };
    }
    if (
      error.code === PG_ERR.CHECK_VIOLATION ||
      error.code === PG_ERR.INVALID_TEXT_REPRESENTATION
    ) {
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

export async function transferConfirmShip(
  transferId: number,
): Promise<ActionResult> {
  const id = z.coerce.number().int().positive().safeParse(transferId);
  if (!id.success) return { success: false, error: "ID không hợp lệ" };
  const authz = await loadTransferForPermission(
    id.data,
    PERMISSION_KEYS.INVENTORY_TRANSFER_SHIP,
    "from",
  );
  if (!authz.success) return { success: false, error: authz.error };
  const { error } = await authz.supabase.rpc("stock_transfer_confirm_ship", {
    p_transfer_id: id.data,
  });
  if (error) {
    console.error("inventory.transfer.confirm_ship_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      success: false,
      error: "Không thể xác nhận xuất (kiểm tra tồn kho gửi).",
    };
  }
  revalidatePath("/inventory/transfers");
  revalidatePath(`/inventory/transfers/${id.data}`);
  return { success: true };
}

export async function transferMarkInTransit(
  transferId: number,
): Promise<ActionResult> {
  const id = z.coerce.number().int().positive().safeParse(transferId);
  if (!id.success) return { success: false, error: "ID không hợp lệ" };
  const authz = await loadTransferForPermission(
    id.data,
    PERMISSION_KEYS.INVENTORY_TRANSFER_SHIP,
    "from",
  );
  if (!authz.success) return { success: false, error: authz.error };
  const { error } = await authz.supabase.rpc("stock_transfer_mark_in_transit", {
    p_transfer_id: id.data,
  });
  if (error) {
    console.error("inventory.transfer.mark_in_transit_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { success: false, error: "Không thể chuyển trạng thái vận chuyển." };
  }
  revalidatePath("/inventory/transfers");
  revalidatePath(`/inventory/transfers/${id.data}`);
  return { success: true };
}

export async function transferConfirmReceive(
  transferId: number,
): Promise<ActionResult> {
  const id = z.coerce.number().int().positive().safeParse(transferId);
  if (!id.success) return { success: false, error: "ID không hợp lệ" };
  const authz = await loadTransferForPermission(
    id.data,
    PERMISSION_KEYS.INVENTORY_TRANSFER_RECEIVE,
    "to",
  );
  if (!authz.success) return { success: false, error: authz.error };
  const { error } = await authz.supabase.rpc("stock_transfer_confirm_receive", {
    p_transfer_id: id.data,
  });
  if (error) {
    console.error("inventory.transfer.confirm_receive_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      success: false,
      error: "Không thể bắt đầu kiểm nhận (phiếu phải đang vận chuyển).",
    };
  }
  revalidatePath("/inventory/transfers");
  revalidatePath(`/inventory/transfers/${id.data}`);
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

  const authz = await loadTransferForPermission(
    id.data,
    PERMISSION_KEYS.INVENTORY_TRANSFER_RECEIVE,
    "to",
  );
  if (!authz.success) return { success: false, error: authz.error };
  const { error } = await authz.supabase.rpc("stock_transfer_receive", {
    p_transfer_id: id.data,
    p_items: items ?? null,
  });
  if (error) {
    console.error("inventory.transfer.receive_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { success: false, error: "Không thể xác nhận nhập kho đích." };
  }
  revalidatePath("/inventory/transfers");
  revalidatePath(`/inventory/transfers/${id.data}`);
  return { success: true };
}

export async function fetchBranchesForTransfer(): Promise<ActionResult> {
  const ctx = await getAuthContextWithPermission(
    ROLES,
    PERMISSION_KEYS.INVENTORY_READ,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims } = ctx;
  const { data, error } = await supabase.rpc("stock_transfer_list_branches");
  if (error)
    return { success: false, error: "Không thể tải danh sách chi nhánh." };
  const branches = data ?? [];
  if (claims.user_role === "branch_manager") {
    return {
      success: true,
      data:
        claims.branch_id == null
          ? []
          : branches.filter(
              (branch: { id: number; branch_kind?: string | null }) =>
                branch.id === claims.branch_id ||
                branch.branch_kind === "central_supply" ||
                branch.branch_kind === "central_kitchen",
            ),
    };
  }
  return { success: true, data: branches };
}
