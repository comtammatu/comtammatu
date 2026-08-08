"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  INVENTORY_OPS_ROLES,
  PERMISSION_KEYS,
  type JwtClaims,
  type StaffRole,
} from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { createServiceClient } from "@comtammatu/database/supabase/service";
import { messages } from "@lib/messages";
import { getAuthContext, getAuthContextWithPermission } from "./_lib/auth";
import type { TenantSupabase } from "@lib/inventory/types";
import { resolveEntryUnitCode } from "./_lib/entry-unit-code";
import { getIssueBaseQuantity } from "./_lib/issue-units";
import { resolveDefaultInventoryLocation } from "./_lib/inventory-location-compat";
import { getBranchSiteDisplayName } from "./_lib/branch-site-labels";
import { getEmbeddedUnitDisplayName } from "./_lib/unit-display";
import { loadInventoryMonetaryAccess } from "@lib/inventory/monetary-access";
import { inventoryPositiveQuantitySchema } from "./_lib/inventory-quantity-schema";
import {
  insufficientStockFailure,
  mapInventoryRpcFailure,
} from "./_lib/rpc-failure";
import {
  transferCancelRpcFallback,
  transferCancelRpcMappings,
  transferConfirmReceiveRpcFallback,
  transferConfirmReceiveRpcMappings,
  transferCreateRpcFallback,
  transferCreateRpcMappings,
  transferInTransitRpcFallback,
  transferInTransitRpcMappings,
  transferReceiveRpcFallback,
  transferReceiveRpcMappings,
  transferShipRpcFallback,
  transferShipRpcMappings,
} from "@lib/messages/inventory-rpc-errors";

/** Placeholder for RPC param; create_stock_transfer_draft allocates DC-YYYY-####. */
const TRANSFER_NUMBER_SERVER_ALLOCATED = "";

const ROLES = INVENTORY_OPS_ROLES;
const BRANCH_SCOPED_TRANSFER_ROLES: readonly StaffRole[] = ["branch_manager"];
const BRANCH_MANAGER_INTER_SITE_TRANSFER_ERROR =
  "Quản lý chi nhánh chỉ được nhận phiếu chuyển về chi nhánh.";

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
  if (!id.success)
    return { success: false, error: "Mã phiếu chuyển không hợp lệ" };
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
  if (e1 || !tr) {
    console.error("fetchStockTransferDetail.failed_fetch_transfer", {
      transferId: id.data,
      error: e1,
    });
    return { success: false, error: "Không tìm thấy phiếu chuyển." };
  }
  const requestedBranchId = branchId ?? null;
  if (isBranchScopedTransferRole(claims.user_role)) {
    const ownBranchId = claims.branch_id;
    if (ownBranchId == null || !transferInvolvesBranch(tr, ownBranchId)) {
      console.error("fetchStockTransferDetail.failed_involves_branch", {
        ownBranchId,
        from_branch_id: tr.from_branch_id,
        to_branch_id: tr.to_branch_id,
      });
      return { success: false, error: "Không tìm thấy phiếu chuyển." };
    }
  } else if (
    requestedBranchId != null &&
    !transferInvolvesBranch(tr, requestedBranchId)
  ) {
    return { success: false, error: "Không tìm thấy phiếu chuyển." };
  }
  const monetary = await loadInventoryMonetaryAccess(claims.user_role);
  const lineReadClient = monetary.valuation
    ? (monetary.client ?? supabase)
    : supabase;
  const lineQuery = monetary.valuation
    ? lineReadClient
        .from("stock_transfer_items")
        .select("*, ingredients ( id, name )")
    : lineReadClient
        .from("stock_transfer_items")
        .select(
          "id, tenant_id, transfer_id, ingredient_id, quantity, quantity_received, receive_note, entry_unit_id, ingredients ( id, name )",
        );
  const { data: lines, error: e2 } = await lineQuery
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
  const ingredientIds = [
    ...new Set((lines ?? []).map((l) => l.ingredient_id as number)),
  ];
  const toBaseFactorByKey = new Map<string, number>();
  const unitLabelByKey = new Map<string, string>();
  const baseUnitLabelByIngredient = new Map<number, string>();
  if (ingredientIds.length > 0) {
    const { data: unitRows } = await supabase
      .from("ingredient_units")
      .select(
        "ingredient_id, unit_id, to_base_factor, is_base, units!ingredient_units_unit_tenant_fkey(code, name)",
      )
      .eq("tenant_id", claims.tenant_id)
      .eq("is_active", true)
      .in("ingredient_id", ingredientIds);
    for (const row of unitRows ?? []) {
      const ingredientId = Number(row.ingredient_id);
      const unitId = Number(row.unit_id);
      if (!Number.isFinite(ingredientId) || !Number.isFinite(unitId)) continue;
      const key = `${ingredientId}:${unitId}`;
      const label = getEmbeddedUnitDisplayName(row.units);
      toBaseFactorByKey.set(key, Number(row.to_base_factor));
      if (label) unitLabelByKey.set(key, label);
      if (row.is_base === true && label) {
        baseUnitLabelByIngredient.set(ingredientId, label);
      }
    }
  }
  const linesWithFactor = (lines ?? []).map((line) => {
    const unitCost =
      monetary.valuation && "unit_cost_at_ship" in line
        ? Number(line.unit_cost_at_ship ?? 0)
        : null;
    return {
      ...line,
      unit_cost_at_ship: undefined,
      monetary: unitCost == null ? null : { unitCostAtShip: unitCost },
      to_base_factor:
        line.entry_unit_id == null
          ? null
          : (toBaseFactorByKey.get(
              `${line.ingredient_id}:${line.entry_unit_id}`,
            ) ?? null),
      unit_label:
        line.entry_unit_id == null
          ? (baseUnitLabelByIngredient.get(Number(line.ingredient_id)) ?? null)
          : (unitLabelByKey.get(
              `${line.ingredient_id}:${line.entry_unit_id}`,
            ) ?? null),
    };
  });

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
  if (error) {
    return { success: false, error: messages.inventory.transfer.loadFailed };
  }
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
  quantity: inventoryPositiveQuantitySchema,
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
  lines: z
    .array(transferLineInputSchema)
    .min(1, { error: messages.inventory.transfer.emptyIngredientsDescription }),
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
  const { fromBranchId, toBranchId } = parsed.data;
  const ctx = await getAuthContext(ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims } = ctx;
  if (claims.user_role === "branch_manager") {
    return { success: false, error: BRANCH_MANAGER_INTER_SITE_TRANSFER_ERROR };
  }
  if (
    claims.user_role !== "owner" &&
    claims.user_role !== "central_supply_ops" &&
    claims.user_role !== "central_kitchen_lead"
  ) {
    return { success: false, error: "Không có quyền tạo phiếu chuyển." };
  }
  if (claims.user_role !== "owner" && claims.branch_id !== fromBranchId) {
    return {
      success: false,
      error: "Bạn chỉ được tạo phiếu xuất từ điểm vận hành của mình.",
    };
  }

  const isIntraBranch = fromBranchId === toBranchId;
  if (isIntraBranch) {
    return {
      success: false,
      error: "Điểm nhận phải khác điểm xuất.",
    };
  }

  const { data: authorizedBranches, error: branchesError } = await supabase.rpc(
    "stock_transfer_list_branches",
  );
  const fromBranch = authorizedBranches?.find(
    (branch) => branch.id === fromBranchId,
  );
  const toBranch = authorizedBranches?.find(
    (branch) => branch.id === toBranchId,
  );
  if (branchesError || !fromBranch || !toBranch) {
    return { success: false, error: "Điểm vận hành không hợp lệ." };
  }
  if (
    !isAllowedInterSiteDirection(fromBranch.branch_kind, toBranch.branch_kind)
  ) {
    return {
      success: false,
      error:
        "Luồng luân chuyển không hợp lệ. Chỉ hỗ trợ Kho Tổng/Bếp Trung Tâm cấp chi nhánh, Kho Tổng ↔ Bếp Trung Tâm, hoặc điều chuyển giữa các chi nhánh.",
    };
  }
  const { data: canCreate, error: canCreateError } = await supabase.rpc(
    "has_permission",
    {
      p_branch_id: fromBranch.id,
      p_key: PERMISSION_KEYS.INVENTORY_TRANSFER_CREATE,
    },
  );
  if (canCreateError || canCreate !== true) {
    return { success: false, error: "Không có quyền tạo phiếu chuyển." };
  }

  const locationClient = createServiceClient();
  // Resolve locations if not provided
  const fromLocationId =
    parsed.data.fromLocationId ??
    (await resolveDefaultInventoryLocation(
      locationClient,
      claims.tenant_id,
      fromBranch.id,
      "issue",
    ));
  const toLocationId =
    parsed.data.toLocationId ??
    (await resolveDefaultInventoryLocation(
      locationClient,
      claims.tenant_id,
      toBranch.id,
      "receive",
    ));

  if (!fromLocationId || !toLocationId) {
    return {
      success: false,
      error: "Chưa cấu hình vị trí kho gửi hoặc kho nhận mặc định.",
    };
  }
  const { data: transferLocations, error: transferLocationsError } =
    await locationClient
      .from("inventory_locations")
      .select("id, branch_id")
      .eq("tenant_id", claims.tenant_id)
      .eq("is_active", true)
      .eq("location_kind", "warehouse")
      .in("id", [fromLocationId, toLocationId]);
  if (
    transferLocationsError ||
    transferLocations?.length !== 2 ||
    !transferLocations.some(
      (location) =>
        location.id === fromLocationId && location.branch_id === fromBranch.id,
    ) ||
    !transferLocations.some(
      (location) =>
        location.id === toLocationId && location.branch_id === toBranch.id,
    )
  ) {
    return {
      success: false,
      error: "Thông tin kho luân chuyển không hợp lệ.",
    };
  }

  const transferLines = parsed.data.lines.map((line) => ({
    ingredientId: line.ingredientId,
    quantity: line.quantity,
    entryUnitId: line.entryUnitId ?? null,
  }));
  if (transferLines.length > 0) {
    const ingredientIds = [
      ...new Set(transferLines.map((line) => line.ingredientId)),
    ];
    const { data: stockLevels, error: stockLevelError } = await supabase
      .from("stock_levels")
      .select("ingredient_id, current_quantity")
      .eq("tenant_id", claims.tenant_id)
      .eq("branch_id", fromBranch.id)
      .eq("location_id", fromLocationId)
      .in("ingredient_id", ingredientIds);
    if (stockLevelError) {
      return {
        success: false,
        error: messages.inventory.transfer.stockLoadFailed,
      };
    }
    const availableByIngredient = new Map(
      (stockLevels ?? []).map((level) => [
        level.ingredient_id,
        Number(level.current_quantity ?? 0),
      ]),
    );

    for (const line of transferLines) {
      const resolvedUnit = await resolveEntryUnitCode(supabase, {
        tenantId: claims.tenant_id,
        ingredientId: line.ingredientId,
        entryUnitId: line.entryUnitId,
      });
      if (!resolvedUnit.success) {
        return { success: false, error: resolvedUnit.error };
      }
      const requestedBaseQuantity = getIssueBaseQuantity(
        line.quantity,
        resolvedUnit,
      );
      const availableQuantity =
        availableByIngredient.get(line.ingredientId) ?? 0;
      if (requestedBaseQuantity > availableQuantity + 1e-9) {
        return insufficientStockFailure(line.ingredientId);
      }
    }
  }

  const { data, error } = await supabase.rpc("create_stock_transfer_draft", {
    p_from_branch_id: fromBranch.id,
    p_to_branch_id: toBranch.id,
    p_from_location_id: fromLocationId,
    p_to_location_id: toLocationId,
    p_transfer_number: TRANSFER_NUMBER_SERVER_ALLOCATED,
    p_notes: parsed.data.notes ?? undefined,
    p_vehicle_info: parsed.data.vehicleInfo ?? undefined,
    p_lines: transferLines,
  });

  if (error) {
    return mapInventoryRpcFailure(
      error,
      transferCreateRpcMappings,
      transferCreateRpcFallback,
    );
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
  if (!id.success)
    return { success: false, error: "Mã phiếu chuyển không hợp lệ" };
  const authz = await loadTransferForPermission(
    id.data,
    (transfer) =>
      transfer.from_branch_id === transfer.to_branch_id
        ? PERMISSION_KEYS.INVENTORY_TRANSFER_CREATE
        : PERMISSION_KEYS.INVENTORY_TRANSFER_SHIP,
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
    return mapInventoryRpcFailure(
      error,
      transferShipRpcMappings,
      transferShipRpcFallback,
    );
  }

  revalidatePath("/inventory/transfers");
  revalidatePath(`/inventory/transfers/${id.data}`);
  return { success: true };
}

export async function transferMarkInTransit(
  transferId: number,
): Promise<ActionResult> {
  const id = z.coerce.number().int().positive().safeParse(transferId);
  if (!id.success)
    return { success: false, error: "Mã phiếu chuyển không hợp lệ" };
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
      error: error,
    });
    return mapInventoryRpcFailure(
      error,
      transferInTransitRpcMappings,
      transferInTransitRpcFallback,
    );
  }
  revalidatePath("/inventory/transfers");
  revalidatePath(`/inventory/transfers/${id.data}`);
  return { success: true };
}

export async function transferConfirmReceive(
  transferId: number,
): Promise<ActionResult> {
  const id = z.coerce.number().int().positive().safeParse(transferId);
  if (!id.success)
    return { success: false, error: "Mã phiếu chuyển không hợp lệ" };
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
    return mapInventoryRpcFailure(
      error,
      transferConfirmReceiveRpcMappings,
      transferConfirmReceiveRpcFallback,
    );
  }
  revalidatePath("/inventory/transfers");
  revalidatePath(`/inventory/transfers/${id.data}`);
  revalidatePath(`/br/${authz.transfer.to_branch_id}/stock`);
  revalidatePath(
    `/br/${authz.transfer.to_branch_id}/stock/receive/${id.data}`,
  );
  return { success: true };
}

export async function transferReceive(
  transferId: number,
  items: Record<string, number | { qty: number; note?: string }> | null,
): Promise<ActionResult> {
  const id = z.coerce.number().int().positive().safeParse(transferId);
  if (!id.success)
    return { success: false, error: "Mã phiếu chuyển không hợp lệ" };

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

  if (authz.transfer.status !== "confirmed_receive") {
    return {
      success: false,
      error: "Hãy bắt đầu kiểm nhận trước khi xác nhận số lượng.",
    };
  }

  const { error } = await authz.supabase.rpc("stock_transfer_receive", {
    p_transfer_id: id.data,
    p_items: items ?? null,
  });
  if (error) {
    console.error("inventory.transfer.receive_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return mapInventoryRpcFailure(
      error,
      transferReceiveRpcMappings,
      transferReceiveRpcFallback,
    );
  }
  revalidatePath("/inventory/transfers");
  revalidatePath(`/inventory/transfers/${id.data}`);
  return { success: true };
}

export async function cancelStockTransfer(
  transferId: number,
  reason: string,
): Promise<ActionResult> {
  const parsed = z
    .object({
      transferId: z.coerce.number().int().positive(),
      reason: z.string().trim().min(5).max(500),
    })
    .safeParse({ transferId, reason });
  if (!parsed.success) {
    return { success: false, error: "Vui lòng nhập lý do ít nhất 5 ký tự." };
  }
  const authz = await loadTransferForPermission(
    parsed.data.transferId,
    PERMISSION_KEYS.INVENTORY_TRANSFER_CREATE,
    "from",
  );
  if (!authz.success) return { success: false, error: authz.error };
  const { error } = await authz.supabase.rpc(
    "cancel_stock_transfer" as never,
    {
      p_transfer_id: parsed.data.transferId,
      p_reason: parsed.data.reason,
    } as never,
  );
  if (error) {
    return mapInventoryRpcFailure(
      error,
      transferCancelRpcMappings,
      transferCancelRpcFallback,
    );
  }
  revalidatePath("/inventory/transfers");
  revalidatePath(`/inventory/transfers/${parsed.data.transferId}`);
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
  if (error) {
    return {
      success: false,
      error: messages.inventory.transfer.branchesLoadFailed,
    };
  }
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
