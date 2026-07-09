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
import { resolveCentralSiteHomeBranchId } from "@/_lib/branch-hub-device";
import { messages } from "@lib/messages";
import { getAuthContext, getAuthContextWithPermission } from "./_lib/auth";
import type { TenantSupabase } from "./_lib/types";
import { resolveEntryUnitCode } from "./_lib/entry-unit-code";
import { getIssueBaseQuantity } from "./_lib/issue-units";
import { resolveDefaultInventoryLocation } from "./_lib/inventory-location-compat";
import { PG_ERR } from "./_lib/constants";
import { getBranchSiteDisplayName } from "./_lib/branch-site-labels";
import { getEmbeddedUnitDisplayName } from "./_lib/unit-display";

const ROLES = INVENTORY_OPS_ROLES;
const BRANCH_SCOPED_TRANSFER_ROLES: readonly StaffRole[] = [
  "branch_manager",
  "warehouse_manager",
  "production_manager",
];
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

async function enforceTransferActionScope(
  supabase: Parameters<typeof resolveCentralSiteHomeBranchId>[0],
  claims: JwtClaims,
  transfer: TransferPermissionRow,
  side: "from" | "to",
  requiredPermission: string,
): Promise<string | null> {
  if (!isBranchScopedTransferRole(claims.user_role)) return null;

  // Central-site operators (warehouse_manager, production_manager) carry
  // branch_id null in claims (D055 §1); resolve their central home before the
  // scope comparison. Pinned branch roles keep the strict claim value. Only a
  // genuinely unassigned account (no claim, no resolvable home) is rejected.
  const ownBranchId =
    claims.branch_id ??
    (await resolveCentralSiteHomeBranchId(supabase, claims));
  if (ownBranchId == null) {
    return "Tài khoản cần gắn với kho vận hành.";
  }

  if (claims.user_role === "branch_manager") {
    if (requiredPermission === PERMISSION_KEYS.INVENTORY_TRANSFER_SHIP) {
      return BRANCH_MANAGER_INTER_SITE_TRANSFER_ERROR;
    }

    if (
      requiredPermission === PERMISSION_KEYS.INVENTORY_TRANSFER_CREATE &&
      transfer.from_branch_id !== transfer.to_branch_id
    ) {
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
  const scopeError = await enforceTransferActionScope(
    supabase,
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
  if (e1 || !tr) {
    console.error("fetchStockTransferDetail.failed_fetch_transfer", {
      transferId: id.data,
      error: e1,
    });
    return { success: false, error: "Không tìm thấy phiếu chuyển." };
  }
  const requestedBranchId = branchId ?? null;
  if (isBranchScopedTransferRole(claims.user_role)) {
    const ownBranchId =
      claims.branch_id ??
      (await resolveCentralSiteHomeBranchId(supabase, claims));
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
  const { data: lines, error: e2 } = await supabase
    .from("stock_transfer_items")
    .select("*, ingredients ( id, name )")
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
  const linesWithFactor = (lines ?? []).map((l) => ({
    ...l,
    to_base_factor:
      l.entry_unit_id == null
        ? null
        : (toBaseFactorByKey.get(`${l.ingredient_id}:${l.entry_unit_id}`) ??
          null),
    unit_label:
      l.entry_unit_id == null
        ? (baseUnitLabelByIngredient.get(Number(l.ingredient_id)) ?? null)
        : (unitLabelByKey.get(`${l.ingredient_id}:${l.entry_unit_id}`) ?? null),
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
  quantity: z.coerce.number().positive(),
  // Issue-role unit the qty was entered in. NULL = already base;
  // stock_transfer_confirm_ship converts to base via inv_to_base().
  entryUnitId: z.coerce.number().int().positive().nullable().optional(),
});

const transferCreateSchema = z.object({
  fromBranchId: z.coerce.number().int().positive(),
  toBranchId: z.coerce.number().int().positive(),
  fromLocationId: z.coerce.number().int().positive().optional(),
  toLocationId: z.coerce.number().int().positive().optional(),
  toLocationKind: z.enum(["default_receive", "branch_kitchen"]).optional(),
  notes: z.string().max(500, { error: "Ghi chú tối đa 500 ký tự" }).optional(),
  vehicleInfo: z.string().optional(),
  lines: z
    .array(transferLineInputSchema)
    .min(1, { error: messages.inventory.transfer.emptyIngredientsDescription }),
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

async function resolveBranchKitchenLocation(
  supabase: TenantSupabase,
  tenantId: number,
  branchId: number,
): Promise<number | null> {
  const { data, error } = await supabase
    .from("inventory_locations")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("branch_id", branchId)
    .eq("location_kind", "kitchen")
    .eq("is_active", true)
    .order("is_default_consumption", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data?.id ?? null;
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

  if (
    claims.user_role === "warehouse_manager" ||
    claims.user_role === "production_manager"
  ) {
    // Central-site operators carry branch_id null (D055 §1); resolve their
    // central home before comparing against the source branch so they can
    // issue transfers from their own Kho Tổng / Bếp Trung Tâm.
    const effectiveFromBranchId =
      claims.branch_id ??
      (await resolveCentralSiteHomeBranchId(supabase, claims));
    if (
      effectiveFromBranchId == null ||
      fromBranchId !== effectiveFromBranchId
    ) {
      return {
        success: false,
        error: "Bạn chỉ được tạo phiếu xuất từ kho của mình.",
      };
    }
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
  const wantsBranchKitchenTarget =
    isIntraBranch || parsed.data.toLocationKind === "branch_kitchen";
  if (wantsBranchKitchenTarget && toKind !== "branch") {
    return { success: false, error: "Bếp CN chỉ áp dụng cho chi nhánh." };
  }
  if (!isAllowedInterSiteDirection(fromKind, toKind)) {
    return {
      success: false,
      error:
        "Luồng luân chuyển không hợp lệ. Chỉ hỗ trợ Kho Tổng/Bếp Trung Tâm cấp chi nhánh hoặc điều chuyển giữa các chi nhánh.",
    };
  }
  if (claims.user_role === "branch_manager") {
    if (
      claims.branch_id == null ||
      toBranchId !== claims.branch_id ||
      (isIntraBranch && fromBranchId !== claims.branch_id)
    ) {
      return {
        success: false,
        error: "Quản lý chi nhánh chỉ được yêu cầu hàng về chi nhánh của mình.",
      };
    }
    if (
      !isIntraBranch &&
      fromKind !== "central_supply" &&
      fromKind !== "central_kitchen"
    ) {
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
    (wantsBranchKitchenTarget
      ? await resolveBranchKitchenLocation(
          supabase,
          claims.tenant_id,
          toBranchId,
        )
      : await resolveDefaultInventoryLocation(
          supabase,
          claims.tenant_id,
          toBranchId,
          "receive",
        ));

  if (!fromLocationId || !toLocationId) {
    return {
      success: false,
      error: wantsBranchKitchenTarget
        ? "Chưa cấu hình Bếp CN để nhận hàng."
        : "Chưa cấu hình vị trí kho gửi hoặc kho nhận mặc định.",
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
      .eq("branch_id", fromBranchId)
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
        return { success: false, error: "Số lượng vượt tồn hiện tại." };
      }
    }
  }

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
    return {
      success: false,
      error: "Không thể xác nhận xuất (kiểm tra tồn kho gửi).",
    };
  }

  // Inter-site transfers move straight to transit after ship confirmation.
  if (authz.transfer.from_branch_id !== authz.transfer.to_branch_id) {
    const { error: transitError } = await authz.supabase.rpc(
      "stock_transfer_mark_in_transit",
      {
        p_transfer_id: id.data,
      },
    );
    if (transitError) {
      console.error("inventory.transfer.mark_in_transit_auto_failed", {
        error: transitError,
      });
      return {
        success: false,
        error:
          "Đã xác nhận xuất kho nhưng không thể tự động chuyển sang đang vận chuyển.",
      };
    }
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
      error: error,
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

  if (authz.transfer.status === "confirmed_ship") {
    const { error: transitError } = await authz.supabase.rpc(
      "stock_transfer_mark_in_transit",
      {
        p_transfer_id: id.data,
      },
    );
    if (transitError) {
      console.error("inventory.transfer.mark_in_transit_auto_receive_failed", {
        error:
          transitError instanceof Error
            ? transitError.message
            : String(transitError),
      });
      return {
        success: false,
        error: "Phiếu đã xuất nhưng chưa chuyển sang đang vận chuyển.",
      };
    }
  }

  if (
    authz.transfer.status === "confirmed_ship" ||
    authz.transfer.status === "in_transit"
  ) {
    const { error: confirmReceiveError } = await authz.supabase.rpc(
      "stock_transfer_confirm_receive",
      {
        p_transfer_id: id.data,
      },
    );
    if (confirmReceiveError) {
      console.error("inventory.transfer.confirm_receive_auto_failed", {
        error:
          confirmReceiveError instanceof Error
            ? confirmReceiveError.message
            : String(confirmReceiveError),
      });
      return { success: false, error: "Không thể bắt đầu kiểm nhận hàng." };
    }
  }

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

const quickInternalTransferSchema = z.object({
  branchId: z.coerce.number().int().positive(),
  ingredientId: z.coerce.number().int().positive(),
  quantity: z.coerce.number().positive(),
  entryUnitId: z.coerce.number().int().positive().nullable().optional(),
  reason: z.string().optional(),
});

export async function quickInternalTransfer(
  input: z.infer<typeof quickInternalTransferSchema>,
): Promise<ActionResult> {
  const parsed = quickInternalTransferSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }
  const { branchId, ingredientId, quantity, entryUnitId, reason } = parsed.data;

  const ctx = await getAuthContext(ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims } = ctx;

  if (isBranchScopedTransferRole(claims.user_role)) {
    const ownBranchId =
      claims.branch_id ??
      (await resolveCentralSiteHomeBranchId(supabase, claims));
    if (ownBranchId == null || ownBranchId !== branchId) {
      return {
        success: false,
        error: "Bạn chỉ được thao tác tại chi nhánh của mình.",
      };
    }
  }

  const { data: canCreate, error: canCreateError } = await supabase.rpc(
    "has_permission",
    {
      p_branch_id: branchId,
      p_key: PERMISSION_KEYS.INVENTORY_TRANSFER_CREATE,
    },
  );
  if (canCreateError || canCreate !== true) {
    return { success: false, error: "Không có quyền tạo phiếu chuyển." };
  }

  const fromLocationId = await resolveDefaultInventoryLocation(
    supabase,
    claims.tenant_id,
    branchId,
    "issue",
  );

  const toLocationId = await resolveBranchKitchenLocation(
    supabase,
    claims.tenant_id,
    branchId,
  );

  if (!fromLocationId || !toLocationId) {
    return {
      success: false,
      error: "Chưa cấu hình kho xuất mặc định hoặc Bếp CN.",
    };
  }

  const { data: stockLevels, error: stockLevelError } = await supabase
    .from("stock_levels")
    .select("current_quantity")
    .eq("tenant_id", claims.tenant_id)
    .eq("branch_id", branchId)
    .eq("location_id", fromLocationId)
    .eq("ingredient_id", ingredientId)
    .maybeSingle();

  if (stockLevelError) {
    return {
      success: false,
      error: messages.inventory.transfer.stockLoadFailed,
    };
  }

  const availableQuantity = Number(stockLevels?.current_quantity ?? 0);

  const resolvedUnit = await resolveEntryUnitCode(supabase, {
    tenantId: claims.tenant_id,
    ingredientId: ingredientId,
    entryUnitId: entryUnitId ?? null,
  });
  if (!resolvedUnit.success) {
    return { success: false, error: resolvedUnit.error };
  }
  const requestedBaseQuantity = getIssueBaseQuantity(quantity, resolvedUnit);
  if (requestedBaseQuantity > availableQuantity + 1e-9) {
    return { success: false, error: "Số lượng vượt tồn hiện tại." };
  }

  const transferNumber = `INT-${randomUUID().slice(0, 8)}`;

  const { error } = await supabase.rpc("commit_intra_branch_transfer", {
    p_branch_id: branchId,
    p_from_location_id: fromLocationId,
    p_to_location_id: toLocationId,
    p_transfer_number: transferNumber,
    p_notes: reason,
    p_lines: [
      {
        ingredient_id: ingredientId,
        quantity,
        entry_unit_id: entryUnitId ?? null,
      },
    ],
  });

  if (error) {
    console.error("quickInternalTransfer.failed", error);
    return { success: false, error: "Không thể thực hiện chuyển nội bộ." };
  }

  revalidatePath("/inventory/stock");
  return { success: true };
}
