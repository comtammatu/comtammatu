import { notFound } from "next/navigation";
import {
  PERMISSION_KEYS,
  STOCK_REQUEST_FULFILL_ROLES,
  type StaffRole,
} from "@comtammatu/shared/auth";
import { loadAuthState } from "@/_lib/auth";
import { fetchEntityAuditLogs, type AuditLogRow } from "@/_lib/audit";
import { currentUserHasPermission } from "@/_lib/permissions";
import { resolveInventoryListScope } from "@/(protected)/inventory/_lib/inventory-scope";
import { formatDateTime } from "@lib/inventory/format";
import { fetchStockTransferDetail } from "@/(protected)/inventory/transfer-actions";
import { computeTransferLineTotal } from "@/(protected)/inventory/transfers/[id]/line-view-model";
import type { TransferDetail } from "./transfer-detail-model";
import {
  formatInventoryLocationLabelVi,
  UNKNOWN_LABEL_VI,
} from "@comtammatu/shared/labels";
import {
  loadIntraSiteTransferData,
  type IntraSiteTransferData,
} from "./intra-site-transfer-data";

interface LoadTransferDetailPageDataOptions {
  transferId: number;
  routeBranchId?: number;
  queryBranch?: string | string[];
  includeAudit?: boolean;
  includeCorrections?: boolean;
}

type TransferLocationBranch = {
  name: string | null;
  branch_kind: string | null;
};

type TransferLocationRow = {
  id: number;
  name: string | null;
  location_kind: string | null;
  branches: TransferLocationBranch | TransferLocationBranch[] | null;
};

function relatedOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function formatTransferLocationLabel(
  location: TransferLocationRow | undefined,
  fallbackBranchName: string | null,
): string {
  const branch = location ? relatedOne(location.branches) : null;
  const formatted = formatInventoryLocationLabelVi({
    branchName: branch?.name ?? fallbackBranchName,
    siteKind: branch?.branch_kind,
    locationKind: location?.location_kind,
    fallbackName: location?.name,
  });
  if (formatted) return formatted;
  return fallbackBranchName ?? UNKNOWN_LABEL_VI;
}

export interface TransferDetailPageData {
  transfer: TransferDetail;
  userRole: StaffRole;
  userBranchId: number | null;
  correctionBranches: Array<{ id: number; name: string }>;
  auditLogs: AuditLogRow[];
  intraSiteData: IntraSiteTransferData | null;
}

export async function loadTransferDetailPageData({
  transferId,
  routeBranchId,
  queryBranch,
  includeAudit = true,
  includeCorrections = true,
}: LoadTransferDetailPageDataOptions): Promise<TransferDetailPageData> {
  const { supabase, claims } = await loadAuthState();
  if (
    routeBranchId == null &&
    !STOCK_REQUEST_FULFILL_ROLES.includes(
      claims.user_role as (typeof STOCK_REQUEST_FULFILL_ROLES)[number],
    )
  ) {
    notFound();
  }
  const scope = await resolveInventoryListScope(supabase, claims, {
    routeBranchId,
    queryBranch,
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
      transfer_scope: "inter_site" | "intra_site" | null;
      reverses_transfer_id: number | null;
      stock_request_id: number | null;
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
      monetary: { unitCostAtShip: number } | null;
      entry_unit_id: number | null;
      to_base_factor: number | null;
      unit_label: string | null;
      base_unit_label: string | null;
      ingredients: {
        id: number;
        name: string;
      } | null;
    }>;
  };

  const transferScope = detail.transfer.transfer_scope ?? "inter_site";
  const remainingByIngredient = new Map<number, number>();
  if (transferScope === "intra_site") {
    const { data: remaining, error: remainingError } = await supabase.rpc(
      "get_intra_site_transfer_remaining" as never,
      { p_transfer_id: detail.transfer.id } as never,
    );
    if (remainingError) {
      console.error("inventory.transfer.remaining_failed", {
        transferId: detail.transfer.id,
        error: remainingError,
      });
    } else {
      for (const row of (remaining ?? []) as unknown as Array<{
        ingredient_id: number;
        remaining_quantity: number;
      }>) {
        remainingByIngredient.set(
          Number(row.ingredient_id),
          Number(row.remaining_quantity),
        );
      }
    }
  }

  const { data: locations } = await supabase
    .from("inventory_locations")
    .select(
      "id, name, location_kind, branches!inventory_locations_branch_id_fkey ( name, branch_kind )",
    )
    .eq("tenant_id", claims.tenant_id)
    .in("id", [
      detail.transfer.from_location_id,
      detail.transfer.to_location_id,
    ]);
  const locationById = new Map(
    ((locations ?? []) as unknown as TransferLocationRow[]).map(
      (location) => [location.id, location] as const,
    ),
  );

  const items: TransferDetail["items"] = (detail.lines ?? []).map((line) => {
    const ingredient = line.ingredients;
    const cost = line.monetary?.unitCostAtShip ?? null;
    const quantity = Number(line.quantity ?? 0);
    const total =
      cost == null
        ? null
        : computeTransferLineTotal({
            entryQuantity: quantity,
            baseUnitCost: cost,
            entryUnitId: line.entry_unit_id ?? null,
            toBaseFactor: line.to_base_factor ?? null,
          }).total;

    return {
      ingredientId: line.ingredient_id ?? ingredient?.id ?? 0,
      entryUnitId: line.entry_unit_id ?? null,
      name: ingredient?.name ?? "—",
      sku: "",
      qty: quantity,
      unit: line.unit_label ?? "",
      baseUnit: line.base_unit_label ?? line.unit_label ?? "",
      toBaseFactor: line.to_base_factor ?? null,
      monetary: cost == null || total == null ? null : { cost, total },
      received:
        line.quantity_received != null ? Number(line.quantity_received) : null,
      reversibleQty:
        transferScope === "intra_site"
          ? (remainingByIngredient.get(Number(line.ingredient_id)) ?? 0)
          : 0,
    };
  });
  const canReadMonetary = items.some((item) => item.monetary != null);
  const subtotal = items.reduce(
    (sum, item) => sum + (item.monetary?.total ?? 0),
    0,
  );
  const stockRequestId =
    detail.transfer.stock_request_id != null &&
    Number.isInteger(detail.transfer.stock_request_id) &&
    detail.transfer.stock_request_id > 0
      ? detail.transfer.stock_request_id
      : null;
  let stockRequestNumber: string | null = null;
  if (stockRequestId != null) {
    const { data: parentRequest } = await supabase
      .from("stock_requests")
      .select("request_number")
      .eq("tenant_id", claims.tenant_id)
      .eq("id", stockRequestId)
      .maybeSingle();
    stockRequestNumber = parentRequest?.request_number ?? null;
  }
  const transfer: TransferDetail = {
    id: detail.transfer.id ?? transferId,
    code: detail.transfer.transfer_number ?? "",
    status: detail.transfer.status ?? "draft",
    transferScope,
    reversesTransferId: detail.transfer.reverses_transfer_id ?? null,
    stockRequestId,
    stockRequestNumber,
    fromBranchId: detail.transfer.from_branch_id,
    toBranchId: detail.transfer.to_branch_id,
    fromLocationId: detail.transfer.from_location_id,
    toLocationId: detail.transfer.to_location_id,
    fromBranch: detail.transfer.from_branch_name ?? UNKNOWN_LABEL_VI,
    toBranch: detail.transfer.to_branch_name ?? UNKNOWN_LABEL_VI,
    fromLocation: formatTransferLocationLabel(
      locationById.get(detail.transfer.from_location_id),
      detail.transfer.from_branch_name,
    ),
    toLocation: formatTransferLocationLabel(
      locationById.get(detail.transfer.to_location_id),
      detail.transfer.to_branch_name,
    ),
    createdBy: "—",
    date: detail.transfer.shipped_at
      ? formatDateTime(detail.transfer.shipped_at)
      : detail.transfer.created_at
        ? formatDateTime(detail.transfer.created_at)
        : "—",
    note: detail.transfer.notes ?? null,
    monetary: canReadMonetary
      ? { subtotal, shipping: 0, total: subtotal }
      : null,
    items,
  };

  let correctionBranches: Array<{ id: number; name: string }> = [];
  if (includeCorrections && transferScope === "inter_site") {
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
            name: detail.transfer.from_branch_name ?? UNKNOWN_LABEL_VI,
          }
        : null,
      canAdjustTo && detail.transfer.status === "received"
        ? {
            id: detail.transfer.to_branch_id,
            name: detail.transfer.to_branch_name ?? UNKNOWN_LABEL_VI,
          }
        : null,
    ].filter(
      (branch): branch is { id: number; name: string } => branch != null,
    );
  }

  const intraSiteData =
    transferScope === "inter_site" &&
    transfer.status === "received" &&
    (claims.user_role === "owner" ||
      (claims.user_role === "branch_manager" &&
        claims.branch_id === transfer.toBranchId))
      ? await loadIntraSiteTransferData({
          supabase,
          tenantId: claims.tenant_id,
          branchId: transfer.toBranchId,
        })
      : null;

  return {
    transfer,
    userRole: claims.user_role,
    userBranchId: scopedBranchId,
    correctionBranches,
    auditLogs,
    intraSiteData,
  };
}
