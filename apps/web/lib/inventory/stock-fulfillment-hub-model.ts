import type { StockFulfillmentRow } from "./stock-fulfillment-data";
import {
  BRANCH_STOCK_REQUEST_STEP_LABELS,
  getBranchStockRequestProgress,
  STOCK_JOURNEY_STAGE_LABELS,
} from "./stock-journey-model";

export type StockFulfillmentWorkFilter =
  "all" | "request" | "dispatch" | "receive";
export type StockFulfillmentStateFilter =
  "active" | "completed" | "cancelled" | "all";

export const STOCK_FULFILLMENT_SOURCE_LABELS = {
  central_supply: "Kho Tổng",
  central_kitchen: "Bếp TT",
} as const;

export const STOCK_FULFILLMENT_LIFECYCLE_LABELS = {
  active: "Đang xử lý",
  completed: "Hoàn tất",
  cancelled: "Đã hủy",
} as const;

/** Transfer statuses where the destination site can open the receive pad. */
export const STOCK_FULFILLMENT_RECEIVE_READY_STATUSES = [
  "confirmed_ship",
  "in_transit",
  "confirmed_receive",
] as const;

const RECEIVE_READY = new Set<string>(STOCK_FULFILLMENT_RECEIVE_READY_STATUSES);

export function stockFulfillmentRowTitle(row: StockFulfillmentRow): string {
  return row.kind === "request"
    ? row.requesterSite.name
    : `${row.fromSite.name} → ${row.toSite.name}`;
}

export function stockFulfillmentLinkedTransferNumbers(
  row: StockFulfillmentRow,
): string[] {
  return row.kind === "request"
    ? row.sources.flatMap((source) =>
        source.transfers.map((transfer) => transfer.documentNumber),
      )
    : [];
}

export function stockFulfillmentProgressLines(
  row: StockFulfillmentRow,
): string[] {
  if (row.kind === "manual_transfer") {
    if (row.transferScope === "intra_site") return ["Đã hoàn tất"];
    if (row.status === "draft") return ["Chuẩn bị hàng"];
    if (
      ["confirmed_ship", "in_transit", "confirmed_receive"].includes(row.status)
    ) {
      return ["Đang giao"];
    }
    return [row.status === "cancelled" ? "Đã hủy" : "Đã nhận"];
  }
  return row.sources.map((source) => {
    const trips =
      source.activeTransfers > 0
        ? ` · ${source.receivedTransfers}/${source.activeTransfers} chuyến`
        : "";
    return `${STOCK_FULFILLMENT_SOURCE_LABELS[source.siteKind]}: ${STOCK_JOURNEY_STAGE_LABELS[source.stage]}${trips}`;
  });
}

/** Branch list copy — 4-step YCH progress, or inbound DC receive status. */
export function stockFulfillmentBranchProgressLines(
  row: StockFulfillmentRow,
): string[] {
  if (row.kind === "manual_transfer") {
    return stockFulfillmentProgressLines(row);
  }

  const transfers = row.sources.flatMap((source) =>
    source.transfers.map((transfer) => ({
      id: transfer.id,
      status: transfer.status,
    })),
  );
  const items = row.sources.flatMap((source) =>
    Array.from({ length: source.itemCount }, (_, index) => ({
      status: index < source.pendingItemCount ? "pending" : "allocated",
    })),
  );
  const progress = getBranchStockRequestProgress({
    requestStatus: row.status,
    items,
    transfers,
  });
  const label = BRANCH_STOCK_REQUEST_STEP_LABELS[progress.currentStep];
  if (progress.allDone) return [`${label} · xong`];
  return [`${progress.currentIndex + 1}/4 · ${label}`];
}

/** First receive-ready transfer id for a journey row, if any. */
export function stockFulfillmentReceiveTransferId(
  row: StockFulfillmentRow,
): number | null {
  if (row.kind === "manual_transfer") {
    return RECEIVE_READY.has(row.status) ? row.transferId : null;
  }
  for (const source of row.sources) {
    for (const transfer of source.transfers) {
      if (RECEIVE_READY.has(transfer.status)) return transfer.id;
    }
  }
  return null;
}

export function stockFulfillmentRowHref(
  row: StockFulfillmentRow,
  branchId: number,
  options?: { preferWork?: StockFulfillmentWorkFilter },
): string {
  // Only deep-link the receive pad when the caller asks (e.g. work=receive).
  // Default opens the document (YCH / DC) so Branch can track before confirming.
  if (options?.preferWork === "receive") {
    const transferId = stockFulfillmentReceiveTransferId(row);
    if (transferId != null) {
      return `/br/${branchId}/stock/receive/${transferId}`;
    }
  }

  return row.kind === "request"
    ? `/br/${branchId}/stock/requests/${row.requestId}`
    : `/br/${branchId}/stock/transfer/${row.transferId}`;
}

export type BranchStockWorkSummary = {
  receiveReadyCount: number;
  openRequestCount: number;
  activeJourneyCount: number;
  firstReceiveTransferId: number | null;
};

/** Lean counts for the Branch stock landing work panel. */
export function summarizeBranchStockWork(
  rows: StockFulfillmentRow[],
): BranchStockWorkSummary {
  let receiveReadyCount = 0;
  let openRequestCount = 0;
  let activeJourneyCount = 0;
  let firstReceiveTransferId: number | null = null;

  for (const row of rows) {
    if (row.lifecycle === "active") {
      activeJourneyCount += 1;
      if (row.kind === "request") openRequestCount += 1;
    }
    if (row.workKinds.includes("receive")) {
      receiveReadyCount += 1;
      if (firstReceiveTransferId == null) {
        firstReceiveTransferId = stockFulfillmentReceiveTransferId(row);
      }
    }
  }

  return {
    receiveReadyCount,
    openRequestCount,
    activeJourneyCount,
    firstReceiveTransferId,
  };
}

export function filterStockFulfillmentRows(
  rows: StockFulfillmentRow[],
  {
    work,
    state,
    search,
    matchesSearch,
    omitLinkedTransferSearch = false,
  }: {
    work: StockFulfillmentWorkFilter;
    state: StockFulfillmentStateFilter;
    search: string;
    matchesSearch: (values: string[], query: string) => boolean;
    /** Branch hub: search YCH code/site only — never DC document numbers. */
    omitLinkedTransferSearch?: boolean;
  },
): StockFulfillmentRow[] {
  return rows.filter((row) => {
    const matchesWork =
      work === "all" ||
      (work === "request"
        ? row.kind === "request"
        : row.workKinds.includes(work));
    const matchesState = state === "all" || row.lifecycle === state;
    const searchable =
      row.kind === "request"
        ? omitLinkedTransferSearch
          ? [row.documentNumber, row.requesterSite.name]
          : [
              row.documentNumber,
              row.requesterSite.name,
              ...row.sources.flatMap((source) => [
                STOCK_FULFILLMENT_SOURCE_LABELS[source.siteKind],
                ...source.transfers.map((transfer) => transfer.documentNumber),
              ]),
            ]
        : [row.documentNumber, row.fromSite.name, row.toSite.name];
    return matchesWork && matchesState && matchesSearch(searchable, search);
  });
}
