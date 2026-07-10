import { notFound } from "next/navigation";
import type { StaffRole } from "@comtammatu/shared/auth";
import { PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { loadAuthState } from "@/_lib/auth";
import { fetchEntityAuditLogs, type AuditLogRow } from "@/_lib/audit";
import { currentUserHasPermission } from "@/_lib/permissions";
import { resolveInventoryListScope } from "@/(protected)/inventory/_lib/inventory-scope";
import { formatDateTime } from "@/(protected)/inventory/_lib/format";
import { fetchStockTransferDetail } from "@/(protected)/inventory/transfer-actions";
import { computeTransferLineTotal } from "@/(protected)/inventory/transfers/[id]/line-view-model";
import type { TransferDetail } from "./transfer-detail-model";

interface LoadTransferDetailPageDataOptions {
  transferId: number;
  routeBranchId?: number;
  queryBranchId?: string | string[];
  includeAudit?: boolean;
  includeCorrections?: boolean;
}

export interface TransferDetailPageData {
  transfer: TransferDetail;
  userRole: StaffRole;
  userBranchId: number | null;
  correctionBranches: Array<{ id: number; name: string }>;
  auditLogs: AuditLogRow[];
}

export async function loadTransferDetailPageData({
  transferId,
  routeBranchId,
  queryBranchId,
  includeAudit = true,
  includeCorrections = true,
}: LoadTransferDetailPageDataOptions): Promise<TransferDetailPageData> {
  const { supabase, claims } = await loadAuthState();
  const scope = await resolveInventoryListScope(supabase, claims, {
    routeBranchId,
    queryBranchId,
  });
  const scopedBranchId = scope.selectedBranchId;
  if (scope.outOfScope) notFound();

  const auditPromise = includeAudit
    ? fetchEntityAuditLogs("stock_transfer", transferId, 50)
    : Promise.resolve([] as AuditLogRow[]);
  const [res, auditLogs] = await Promise.all([
    fetchStockTransferDetail(transferId, scopedBranchId ?? undefined),
    auditPromise,
  ]);
  if (!res.success || !res.data) notFound();

  const detail = res.data as {
    transfer: {
      id: number;
      transfer_number: string;
      status: string;
      from_branch_id: number;
      to_branch_id: number;
      from_location_id: number;
      to_location_id: number;
      from_branch_name: string | null;
      to_branch_name: string | null;
      created_by: string;
      created_at: string;
      shipped_at: string | null;
      notes: string | null;
      vehicle_info: string | null;
    };
    lines: Array<{
      ingredient_id: number;
      quantity: number;
      quantity_received: number | null;
      unit_cost_at_ship: number | null;
      entry_unit_id: number | null;
      to_base_factor: number | null;
      unit_label: string | null;
      ingredients: {
        id: number;
        name: string;
      } | null;
    }>;
  };

  const { data: locations } = await supabase
    .from("inventory_locations")
    .select("id, name")
    .eq("tenant_id", claims.tenant_id)
    .in("id", [
      detail.transfer.from_location_id,
      detail.transfer.to_location_id,
    ]);
  const locationNameById = new Map(
    (locations ?? []).map((location) => [location.id, location.name] as const),
  );

  const items: TransferDetail["items"] = (detail.lines ?? []).map((line) => {
    const ingredient = line.ingredients;
    const cost = Number(line.unit_cost_at_ship ?? 0);
    const quantity = Number(line.quantity ?? 0);
    const { total } = computeTransferLineTotal({
      entryQuantity: quantity,
      baseUnitCost: cost,
      entryUnitId: line.entry_unit_id ?? null,
      toBaseFactor: line.to_base_factor ?? null,
    });

    return {
      ingredientId: line.ingredient_id ?? ingredient?.id ?? 0,
      name: ingredient?.name ?? "—",
      sku: "",
      qty: quantity,
      unit: line.unit_label ?? "",
      cost,
      total,
      received:
        line.quantity_received != null ? Number(line.quantity_received) : null,
    };
  });
  const subtotal = items.reduce((sum, item) => sum + item.total, 0);
  const transfer: TransferDetail = {
    id: detail.transfer.id ?? transferId,
    code: detail.transfer.transfer_number ?? "",
    status: detail.transfer.status ?? "draft",
    fromBranchId: detail.transfer.from_branch_id,
    toBranchId: detail.transfer.to_branch_id,
    fromBranch:
      detail.transfer.from_branch_name ??
      `Chi nhánh #${detail.transfer.from_branch_id}`,
    toBranch:
      detail.transfer.to_branch_name ??
      `Chi nhánh #${detail.transfer.to_branch_id}`,
    fromLocation:
      locationNameById.get(detail.transfer.from_location_id) ??
      detail.transfer.from_branch_name ??
      `Chi nhánh #${detail.transfer.from_branch_id}`,
    toLocation:
      locationNameById.get(detail.transfer.to_location_id) ??
      detail.transfer.to_branch_name ??
      `Chi nhánh #${detail.transfer.to_branch_id}`,
    createdBy: "—",
    date: detail.transfer.shipped_at
      ? formatDateTime(detail.transfer.shipped_at)
      : detail.transfer.created_at
        ? formatDateTime(detail.transfer.created_at)
        : "—",
    note: detail.transfer.notes ?? null,
    subtotal,
    shipping: 0,
    total: subtotal,
    items,
  };

  let correctionBranches: Array<{ id: number; name: string }> = [];
  if (includeCorrections) {
    const [canAdjustFrom, canAdjustTo] = await Promise.all([
      currentUserHasPermission(
        detail.transfer.from_branch_id,
        PERMISSION_KEYS.INVENTORY_WRITE,
      ),
      currentUserHasPermission(
        detail.transfer.to_branch_id,
        PERMISSION_KEYS.INVENTORY_WRITE,
      ),
    ]);
    correctionBranches = [
      canAdjustFrom
        ? {
            id: detail.transfer.from_branch_id,
            name:
              detail.transfer.from_branch_name ??
              `Chi nhánh #${detail.transfer.from_branch_id}`,
          }
        : null,
      canAdjustTo && detail.transfer.status === "received"
        ? {
            id: detail.transfer.to_branch_id,
            name:
              detail.transfer.to_branch_name ??
              `Chi nhánh #${detail.transfer.to_branch_id}`,
          }
        : null,
    ].filter(
      (branch): branch is { id: number; name: string } => branch != null,
    );
  }

  return {
    transfer,
    userRole: claims.user_role,
    userBranchId: scopedBranchId,
    correctionBranches,
    auditLogs,
  };
}
