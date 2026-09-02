import "server-only";

import { UNKNOWN_LABEL_VI } from "@comtammatu/shared/labels";
import type { TenantSupabase } from "@lib/inventory/types";
import {
  projectStockFulfillmentRows,
  type StockFulfillmentJourneyRow,
  type StockFulfillmentSiteKind,
  type StockFulfillmentTransferRecord,
} from "./stock-fulfillment-projection";

export type StockFulfillmentRow = StockFulfillmentJourneyRow;

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

  const [transfersResult, branchesResult] = await Promise.all([
    transfersQuery.order("created_at", { ascending: false }).limit(200),
    supabase
      .from("branches")
      .select("id, name, branch_kind")
      .eq("tenant_id", tenantId),
  ]);

  if (transfersResult.error || branchesResult.error) {
    throw new Error("inventory.stock_fulfillment.load_failed");
  }

  const transfers = (transfersResult.data ??
    []) as unknown as TransferRecord[];
  const transferIds = transfers.map((transfer) => transfer.id);
  const transferLinesResult =
    transferIds.length === 0
      ? { data: [], error: null }
      : await supabase
          .from("stock_transfer_items")
          .select("transfer_id, quantity, quantity_received")
          .eq("tenant_id", tenantId)
          .in("transfer_id", transferIds);
  if (transferLinesResult.error) {
    throw new Error("inventory.stock_fulfillment.load_failed");
  }

  const branches = (branchesResult.data ?? []) as unknown as BranchRecord[];
  const branchById = new Map(branches.map((branch) => [branch.id, branch]));
  const site = (id: number) => {
    const branch = branchById.get(id);
    return {
      id,
      name: branch?.name ?? UNKNOWN_LABEL_VI,
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
    requests: [],
    items: [],
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
