import "server-only";

import type { TenantSupabase } from "@lib/inventory/types";
import {
  getStockJourney,
  type StockJourneyNextAction,
  type StockJourneyOutcome,
  type StockJourneyStage,
} from "./stock-journey-model";

export type StockFulfillmentRow =
  | {
      kind: "request";
      id: number;
      documentNumber: string;
      title: string;
      status: string;
      createdAt: string;
      neededAt: string | null;
      stage: StockJourneyStage;
      outcome: StockJourneyOutcome;
      nextAction: StockJourneyNextAction;
      receivedTransfers: number;
      activeTransfers: number;
      hasPendingLines: boolean;
    }
  | {
      kind: "transfer";
      id: number;
      documentNumber: string;
      title: string;
      status: string;
      createdAt: string;
      fromBranchId: number;
      toBranchId: number;
      stockRequestId: number | null;
    };

type RequestRecord = {
  id: number;
  request_number: string;
  status: string;
  branch_id: number;
  needed_at: string | null;
  created_at: string;
};

type RequestItemRecord = {
  request_id: number;
  status: string;
  fulfill_site_kind: string;
};

type TransferRecord = {
  id: number;
  transfer_number: string;
  status: string;
  stock_request_id: number | null;
  from_branch_id: number;
  to_branch_id: number;
  created_at: string;
};

export async function loadStockFulfillmentRows({
  supabase,
  tenantId,
  branchId,
  fulfillSiteKind,
}: {
  supabase: TenantSupabase;
  tenantId: number;
  branchId?: number;
  fulfillSiteKind?: "central_supply" | "central_kitchen";
}): Promise<StockFulfillmentRow[]> {
  let requestsQuery = supabase
    .from("stock_requests")
    .select("id, request_number, status, branch_id, needed_at, created_at")
    .eq("tenant_id", tenantId);
  if (branchId != null && fulfillSiteKind == null) {
    requestsQuery = requestsQuery.eq("branch_id", branchId);
  }

  let transfersQuery = supabase
    .from("stock_transfers")
    .select(
      "id, transfer_number, status, stock_request_id, from_branch_id, to_branch_id, created_at",
    )
    .eq("tenant_id", tenantId);
  if (branchId != null) {
    transfersQuery = transfersQuery.or(
      `from_branch_id.eq.${branchId},to_branch_id.eq.${branchId}`,
    );
  }

  const [requestsResult, transfersResult, branchesResult] = await Promise.all([
    requestsQuery.order("created_at", { ascending: false }).limit(100),
    transfersQuery.order("created_at", { ascending: false }).limit(200),
    supabase.from("branches").select("id, name").eq("tenant_id", tenantId),
  ]);

  if (requestsResult.error || transfersResult.error || branchesResult.error) {
    throw new Error("inventory.stock_fulfillment.load_failed");
  }

  const requests = (requestsResult.data ?? []) as unknown as RequestRecord[];
  const transfers = (transfersResult.data ?? []) as unknown as TransferRecord[];
  const requestIds = requests.map((request) => request.id);
  const transferIds = transfers.map((transfer) => transfer.id);

  const [itemsResult, transferLinesResult] = await Promise.all([
    requestIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : supabase
          .from("stock_request_items")
          .select("request_id, status, fulfill_site_kind")
          .eq("tenant_id", tenantId)
          .in("request_id", requestIds),
    transferIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : supabase
          .from("stock_transfer_items")
          .select("transfer_id, quantity, quantity_received")
          .eq("tenant_id", tenantId)
          .in("transfer_id", transferIds),
  ]);

  if (itemsResult.error || transferLinesResult.error) {
    throw new Error("inventory.stock_fulfillment.load_failed");
  }

  const items = (itemsResult.data ?? []) as RequestItemRecord[];
  const branchNames = new Map(
    (branchesResult.data ?? []).map((branch) => [branch.id, branch.name]),
  );
  const transferLines = new Map<
    number,
    Array<{ quantity: number; quantityReceived: number | null }>
  >();
  for (const line of transferLinesResult.data ?? []) {
    const lines = transferLines.get(line.transfer_id) ?? [];
    lines.push({
      quantity: Number(line.quantity),
      quantityReceived:
        line.quantity_received == null ? null : Number(line.quantity_received),
    });
    transferLines.set(line.transfer_id, lines);
  }

  const requestRows = requests.flatMap<StockFulfillmentRow>((request) => {
    const requestItems = items.filter(
      (item) =>
        item.request_id === request.id &&
        (fulfillSiteKind == null || item.fulfill_site_kind === fulfillSiteKind),
    );
    if (fulfillSiteKind != null && requestItems.length === 0) return [];

    const requestTransfers = transfers.filter(
      (transfer) => transfer.stock_request_id === request.id,
    );
    const journey = getStockJourney({
      requestStatus: request.status,
      items: requestItems,
      transfers: requestTransfers.map((transfer) => ({
        status: transfer.status,
        lines: transferLines.get(transfer.id),
      })),
    });

    return [
      {
        kind: "request",
        id: request.id,
        documentNumber: request.request_number,
        title:
          branchNames.get(request.branch_id) ??
          `Chi nhánh #${request.branch_id}`,
        status: request.status,
        createdAt: request.created_at,
        neededAt: request.needed_at,
        ...journey,
        hasPendingLines: requestItems.some((item) => item.status === "pending"),
      },
    ];
  });

  const transferRows: StockFulfillmentRow[] = transfers.map((transfer) => ({
    kind: "transfer",
    id: transfer.id,
    documentNumber: transfer.transfer_number,
    title: `${branchNames.get(transfer.from_branch_id) ?? `Điểm #${transfer.from_branch_id}`} → ${branchNames.get(transfer.to_branch_id) ?? `Điểm #${transfer.to_branch_id}`}`,
    status: transfer.status,
    createdAt: transfer.created_at,
    fromBranchId: transfer.from_branch_id,
    toBranchId: transfer.to_branch_id,
    stockRequestId: transfer.stock_request_id,
  }));

  return [...requestRows, ...transferRows];
}
