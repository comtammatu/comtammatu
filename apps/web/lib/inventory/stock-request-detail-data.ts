import "server-only";

import { fetchEntityAuditLogs, type AuditLogRow } from "@/_lib/audit";
import type { TenantSupabase } from "@lib/inventory/types";
import { getStockJourney, type StockJourney } from "./stock-journey-model";

export type StockRequestDetailItem = {
  id: number;
  ingredientId: number;
  ingredientName: string;
  entryUnitId: number;
  unitLabel: string;
  quantity: number;
  fulfillSiteKind: "central_supply" | "central_kitchen";
  status: string;
  transferId: number | null;
  notes: string | null;
};

export type StockRequestDetailTransfer = {
  id: number;
  transferNumber: string;
  status: string;
  fromBranchKind: "central_supply" | "central_kitchen" | "branch";
  fromBranchName: string;
  toBranchName: string;
};

export type StockRequestDetailData = {
  id: number;
  requestNumber: string;
  status: string;
  branchId: number;
  branchName: string;
  neededAt: string | null;
  notes: string | null;
  statusReason: string | null;
  submittedAt: string | null;
  closedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  items: StockRequestDetailItem[];
  transfers: StockRequestDetailTransfer[];
  journey: StockJourney;
  auditLogs: AuditLogRow[];
};

export async function loadStockRequestDetail({
  supabase,
  tenantId,
  requestId,
  branchId,
}: {
  supabase: TenantSupabase;
  tenantId: number;
  requestId: number;
  branchId?: number;
}): Promise<StockRequestDetailData | null> {
  let requestQuery = supabase
    .from("stock_requests")
    .select(
      "id, request_number, status, branch_id, needed_at, notes, status_reason, submitted_at, closed_at, cancelled_at, created_at",
    )
    .eq("tenant_id", tenantId)
    .eq("id", requestId);
  if (branchId != null) requestQuery = requestQuery.eq("branch_id", branchId);

  const { data: rawRequest, error: requestError } =
    await requestQuery.maybeSingle();
  if (requestError) {
    throw new Error("inventory.stock_request_detail.load_failed");
  }
  if (!rawRequest) return null;

  const request = rawRequest as unknown as {
    id: number;
    request_number: string;
    status: string;
    branch_id: number;
    needed_at: string | null;
    notes: string | null;
    status_reason: string | null;
    submitted_at: string | null;
    closed_at: string | null;
    cancelled_at: string | null;
    created_at: string;
  };

  const [itemsResult, transfersResult, branchesResult, unitsResult, auditLogs] =
    await Promise.all([
      supabase
        .from("stock_request_items")
        .select(
          "id, ingredient_id, entry_unit_id, quantity, fulfill_site_kind, status, transfer_id, notes, ingredients(name)",
        )
        .eq("tenant_id", tenantId)
        .eq("request_id", requestId)
        .order("id"),
      supabase
        .from("stock_transfers")
        .select("id, transfer_number, status, from_branch_id, to_branch_id")
        .eq("tenant_id", tenantId)
        .or(`stock_request_id.eq.${requestId}`)
        .order("created_at"),
      supabase
        .from("branches")
        .select("id, name, branch_kind")
        .eq("tenant_id", tenantId),
      supabase.from("units").select("id, name, code").eq("tenant_id", tenantId),
      fetchEntityAuditLogs("stock_request", requestId),
    ]);

  if (
    itemsResult.error ||
    transfersResult.error ||
    branchesResult.error ||
    unitsResult.error
  ) {
    throw new Error("inventory.stock_request_detail.load_failed");
  }

  const branchNames = new Map(
    (branchesResult.data ?? []).map((branch) => [branch.id, branch.name]),
  );
  const branchKinds = new Map(
    (branchesResult.data ?? []).map((branch) => [
      branch.id,
      branch.branch_kind as "central_supply" | "central_kitchen" | "branch",
    ]),
  );
  const unitLabels = new Map(
    (unitsResult.data ?? []).map((unit) => [unit.id, unit.name || unit.code]),
  );
  const items: StockRequestDetailItem[] = (itemsResult.data ?? []).map(
    (item) => ({
      id: item.id,
      ingredientId: item.ingredient_id,
      ingredientName: item.ingredients?.name ?? `NL #${item.ingredient_id}`,
      entryUnitId: item.entry_unit_id,
      unitLabel: unitLabels.get(item.entry_unit_id) ?? "",
      quantity: Number(item.quantity),
      fulfillSiteKind: item.fulfill_site_kind as
        "central_supply" | "central_kitchen",
      status: item.status,
      transferId: item.transfer_id,
      notes: item.notes,
    }),
  );
  const rawTransfers = (transfersResult.data ?? []) as unknown as Array<{
    id: number;
    transfer_number: string;
    status: string;
    from_branch_id: number;
    to_branch_id: number;
  }>;
  const transferIds = rawTransfers.map((transfer) => transfer.id);
  const { data: transferLineRows, error: transferLineError } =
    transferIds.length === 0
      ? { data: [], error: null }
      : await supabase
          .from("stock_transfer_items")
          .select("transfer_id, quantity, quantity_received")
          .eq("tenant_id", tenantId)
          .in("transfer_id", transferIds);
  if (transferLineError) {
    throw new Error("inventory.stock_request_detail.load_failed");
  }

  const journey = getStockJourney({
    requestStatus: request.status,
    items,
    transfers: rawTransfers.map((transfer) => ({
      status: transfer.status,
      lines: (transferLineRows ?? [])
        .filter((line) => line.transfer_id === transfer.id)
        .map((line) => ({
          quantity: Number(line.quantity),
          quantityReceived:
            line.quantity_received == null
              ? null
              : Number(line.quantity_received),
        })),
    })),
  });

  return {
    id: request.id,
    requestNumber: request.request_number,
    status: request.status,
    branchId: request.branch_id,
    branchName:
      branchNames.get(request.branch_id) ?? `Chi nhánh #${request.branch_id}`,
    neededAt: request.needed_at,
    notes: request.notes,
    statusReason: request.status_reason,
    submittedAt: request.submitted_at,
    closedAt: request.closed_at,
    cancelledAt: request.cancelled_at,
    createdAt: request.created_at,
    items,
    transfers: rawTransfers.map((transfer) => ({
      id: transfer.id,
      transferNumber: transfer.transfer_number,
      status: transfer.status,
      fromBranchKind: branchKinds.get(transfer.from_branch_id) ?? "branch",
      fromBranchName:
        branchNames.get(transfer.from_branch_id) ??
        `Điểm #${transfer.from_branch_id}`,
      toBranchName:
        branchNames.get(transfer.to_branch_id) ??
        `Điểm #${transfer.to_branch_id}`,
    })),
    journey,
    auditLogs,
  };
}
