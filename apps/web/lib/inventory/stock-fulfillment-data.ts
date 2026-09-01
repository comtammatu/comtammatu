import "server-only";

import type { TenantSupabase } from "@lib/inventory/types";
import {
  projectStockFulfillmentRows,
  type StockFulfillmentJourneyRow,
  type StockFulfillmentRequestItemRecord,
  type StockFulfillmentRequestRecord,
  type StockFulfillmentSiteKind,
  type StockFulfillmentTransferRecord,
} from "./stock-fulfillment-projection";

export type StockFulfillmentRow = StockFulfillmentJourneyRow;

type RequestRecord = {
  id: number;
  request_number: string;
  status: string;
  branch_id: number;
  needed_at: string | null;
  created_at: string;
};

type RequestItemRecord = {
  id: number;
  request_id: number;
  status: string;
  fulfill_site_kind: "central_supply" | "central_kitchen";
  transfer_id: number | null;
};

type TransferRecord = {
  id: number;
  transfer_number: string;
  status: string;
  transfer_scope: "inter_site" | "intra_site" | null;
  stock_request_id: number | null;
  from_branch_id: number;
  to_branch_id: number;
  created_at: string;
};

type BranchRecord = {
  id: number;
  name: string;
  branch_kind: StockFulfillmentSiteKind;
};

export async function loadStockFulfillmentRows({
  supabase,
  tenantId,
  mode,
  branchId,
  fulfillSiteKind,
  scopeSiteKind,
  seeAllSources = false,
}: {
  supabase: TenantSupabase;
  tenantId: number;
  mode: "branch" | "central";
  branchId?: number;
  fulfillSiteKind?: "central_supply" | "central_kitchen";
  scopeSiteKind?: StockFulfillmentSiteKind;
  seeAllSources?: boolean;
}): Promise<StockFulfillmentRow[]> {
  let requestsQuery = supabase
    .from("stock_requests")
    .select("id, request_number, status, branch_id, needed_at, created_at")
    .eq("tenant_id", tenantId);
  if (branchId != null && (mode === "branch" || scopeSiteKind === "branch")) {
    requestsQuery = requestsQuery.eq("branch_id", branchId);
  }

  let transfersQuery = supabase
    .from("stock_transfers")
    .select(
      "id, transfer_number, status, transfer_scope, stock_request_id, from_branch_id, to_branch_id, created_at",
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
    supabase
      .from("branches")
      .select("id, name, branch_kind")
      .eq("tenant_id", tenantId),
  ]);

  if (requestsResult.error || transfersResult.error || branchesResult.error) {
    throw new Error("inventory.stock_fulfillment.load_failed");
  }

  const initialRequests = (requestsResult.data ??
    []) as unknown as RequestRecord[];
  const initialTransfers = (transfersResult.data ??
    []) as unknown as TransferRecord[];
  const initialRequestIds = new Set(
    initialRequests.map((request) => request.id),
  );
  const missingParentIds = [
    ...new Set(
      initialTransfers.flatMap((transfer) =>
        transfer.stock_request_id != null &&
        !initialRequestIds.has(transfer.stock_request_id)
          ? [transfer.stock_request_id]
          : [],
      ),
    ),
  ];
  const missingParentsResult =
    missingParentIds.length === 0
      ? { data: [], error: null }
      : await supabase
          .from("stock_requests")
          .select(
            "id, request_number, status, branch_id, needed_at, created_at",
          )
          .eq("tenant_id", tenantId)
          .in("id", missingParentIds);
  if (missingParentsResult.error) {
    throw new Error("inventory.stock_fulfillment.load_failed");
  }

  const rawRequests = [
    ...initialRequests,
    ...((missingParentsResult.data ?? []) as unknown as RequestRecord[]),
  ];
  const requestIds = rawRequests.map((request) => request.id);
  const siblingTransfersResult =
    requestIds.length === 0
      ? { data: [], error: null }
      : await supabase
          .from("stock_transfers")
          .select(
            "id, transfer_number, status, transfer_scope, stock_request_id, from_branch_id, to_branch_id, created_at",
          )
          .eq("tenant_id", tenantId)
          .in("stock_request_id", requestIds)
          .limit(400);
  if (siblingTransfersResult.error) {
    throw new Error("inventory.stock_fulfillment.load_failed");
  }
  const transfers = [
    ...new Map(
      [
        ...initialTransfers,
        ...((siblingTransfersResult.data ?? []) as unknown as TransferRecord[]),
      ].map((transfer) => [transfer.id, transfer]),
    ).values(),
  ];
  const transferIds = transfers.map((transfer) => transfer.id);
  const [itemsResult, transferLinesResult] = await Promise.all([
    requestIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : supabase
          .from("stock_request_items")
          .select("id, request_id, status, fulfill_site_kind, transfer_id")
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

  const branches = (branchesResult.data ?? []) as unknown as BranchRecord[];
  const branchById = new Map(branches.map((branch) => [branch.id, branch]));
  const site = (id: number) => {
    const branch = branchById.get(id);
    return {
      id,
      name: branch?.name ?? `Điểm #${id}`,
      kind: branch?.branch_kind ?? ("branch" as const),
    };
  };
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

  const requests: StockFulfillmentRequestRecord[] = rawRequests.map(
    (request) => ({
      id: request.id,
      requestNumber: request.request_number,
      status: request.status,
      requesterSite: site(request.branch_id),
      neededAt: request.needed_at,
      createdAt: request.created_at,
    }),
  );
  const items = (itemsResult.data ?? []) as unknown as RequestItemRecord[];
  const requestItems: StockFulfillmentRequestItemRecord[] = items.map(
    (item) => ({
      id: item.id,
      requestId: item.request_id,
      status: item.status,
      fulfillSiteKind: item.fulfill_site_kind,
      transferId: item.transfer_id,
    }),
  );
  const transferRows: StockFulfillmentTransferRecord[] = transfers.map(
    (transfer) => ({
      id: transfer.id,
      transferNumber: transfer.transfer_number,
      status: transfer.status,
      transferScope: transfer.transfer_scope ?? "inter_site",
      stockRequestId: transfer.stock_request_id,
      fromSite: site(transfer.from_branch_id),
      toSite: site(transfer.to_branch_id),
      createdAt: transfer.created_at,
      lines: transferLines.get(transfer.id) ?? [],
    }),
  );

  return projectStockFulfillmentRows({
    requests,
    items: requestItems,
    transfers: transferRows,
    viewer: {
      mode,
      branchId: branchId ?? null,
      fulfillSiteKind,
      scopeSiteKind,
      seeAllSources,
    },
  });
}
