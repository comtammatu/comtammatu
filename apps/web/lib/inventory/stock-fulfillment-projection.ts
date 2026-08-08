import {
  getStockJourney,
  type StockJourneyOutcome,
  type StockJourneyStage,
} from "./stock-journey-model";

export type StockFulfillmentWorkKind = "request" | "dispatch" | "receive";
export type StockFulfillmentLifecycle = "active" | "completed" | "cancelled";
export type StockFulfillmentSiteKind =
  "branch" | "central_supply" | "central_kitchen";

type Site = {
  id: number;
  name: string;
  kind: StockFulfillmentSiteKind;
};

export type StockFulfillmentTransferProgress = {
  id: number;
  documentNumber: string;
  status: string;
};

export type StockFulfillmentSourceProgress = {
  siteKind: "central_supply" | "central_kitchen";
  itemCount: number;
  pendingItemCount: number;
  stage: StockJourneyStage;
  outcome: StockJourneyOutcome;
  receivedTransfers: number;
  activeTransfers: number;
  transfers: StockFulfillmentTransferProgress[];
};

export type StockFulfillmentJourneyRow =
  | {
      kind: "request";
      requestId: number;
      documentNumber: string;
      requesterSite: Site;
      createdAt: string;
      neededAt: string | null;
      status: string;
      lifecycle: StockFulfillmentLifecycle;
      workKinds: StockFulfillmentWorkKind[];
      sources: StockFulfillmentSourceProgress[];
      currentWork: string[];
      lineCount: number;
    }
  | {
      kind: "manual_transfer";
      transferId: number;
      documentNumber: string;
      fromSite: Site;
      toSite: Site;
      createdAt: string;
      status: string;
      lifecycle: StockFulfillmentLifecycle;
      workKinds: Array<"dispatch" | "receive">;
      currentWork: string[];
      lineCount: number;
    };

export type StockFulfillmentRequestRecord = {
  id: number;
  requestNumber: string;
  status: string;
  requesterSite: Site;
  neededAt: string | null;
  createdAt: string;
};

export type StockFulfillmentRequestItemRecord = {
  id: number;
  requestId: number;
  status: string;
  fulfillSiteKind: "central_supply" | "central_kitchen";
  transferId: number | null;
};

export type StockFulfillmentTransferRecord = {
  id: number;
  transferNumber: string;
  status: string;
  stockRequestId: number | null;
  fromSite: Site;
  toSite: Site;
  createdAt: string;
  lines: Array<{ quantity: number; quantityReceived: number | null }>;
};

type Viewer = {
  mode: "branch" | "central";
  branchId: number | null;
  fulfillSiteKind?: "central_supply" | "central_kitchen";
  scopeSiteKind?: StockFulfillmentSiteKind;
  seeAllSources?: boolean;
};

const SOURCE_ORDER = ["central_supply", "central_kitchen"] as const;
const DISPATCH_STATUSES = new Set(["draft", "confirmed_ship"]);
const RECEIVE_STATUSES = new Set([
  "confirmed_ship",
  "in_transit",
  "confirmed_receive",
]);
const TERMINAL_TRANSFER_STATUSES = new Set([
  "received",
  "cancelled",
  "completed",
]);

function canSeeAllRequestSources(
  request: StockFulfillmentRequestRecord,
  viewer: Viewer,
): boolean {
  return (
    viewer.seeAllSources === true ||
    viewer.branchId == null ||
    request.requesterSite.id === viewer.branchId
  );
}

function requestLifecycle(
  request: StockFulfillmentRequestRecord,
  items: StockFulfillmentRequestItemRecord[],
  transfers: StockFulfillmentTransferRecord[],
): StockFulfillmentLifecycle {
  if (request.status === "cancelled") return "cancelled";
  if (
    request.status === "closed" ||
    (request.status !== "draft" &&
      !items.some((item) => item.status === "pending") &&
      transfers.every((transfer) =>
        TERMINAL_TRANSFER_STATUSES.has(transfer.status),
      ))
  ) {
    return "completed";
  }
  return "active";
}

function transferWorkKinds(
  transfer: StockFulfillmentTransferRecord,
  viewer: Viewer,
): Array<"dispatch" | "receive"> {
  const seesAll = viewer.branchId == null;
  const workKinds: Array<"dispatch" | "receive"> = [];
  if (
    DISPATCH_STATUSES.has(transfer.status) &&
    (seesAll || transfer.fromSite.id === viewer.branchId)
  ) {
    workKinds.push("dispatch");
  }
  if (
    RECEIVE_STATUSES.has(transfer.status) &&
    (seesAll || transfer.toSite.id === viewer.branchId)
  ) {
    workKinds.push("receive");
  }
  return workKinds;
}

function workLabels(
  workKinds: StockFulfillmentWorkKind[],
  viewer: Viewer,
): string[] {
  return workKinds.map((kind) => {
    if (kind === "dispatch") return "Chuẩn bị và giao hàng";
    if (kind === "receive") return "Kiểm nhận hàng";
    return viewer.mode === "branch" ? "Theo dõi yêu cầu" : "Xử lý yêu cầu";
  });
}

export function projectStockFulfillmentRows({
  requests,
  items,
  transfers,
  viewer,
}: {
  requests: StockFulfillmentRequestRecord[];
  items: StockFulfillmentRequestItemRecord[];
  transfers: StockFulfillmentTransferRecord[];
  viewer: Viewer;
}): StockFulfillmentJourneyRow[] {
  const requestRows = requests.flatMap<StockFulfillmentJourneyRow>(
    (request) => {
      const allRequestItems = items.filter(
        (item) => item.requestId === request.id,
      );
      if (
        viewer.branchId != null &&
        viewer.scopeSiteKind === "branch" &&
        request.requesterSite.id !== viewer.branchId
      ) {
        return [];
      }
      if (
        viewer.branchId != null &&
        (viewer.scopeSiteKind === "central_supply" ||
          viewer.scopeSiteKind === "central_kitchen") &&
        request.requesterSite.id !== viewer.branchId &&
        !allRequestItems.some(
          (item) => item.fulfillSiteKind === viewer.scopeSiteKind,
        )
      ) {
        return [];
      }
      const requestItems = canSeeAllRequestSources(request, viewer)
        ? allRequestItems
        : allRequestItems.filter(
            (item) => item.fulfillSiteKind === viewer.fulfillSiteKind,
          );
      if (requestItems.length === 0) return [];

      const requestTransfers = transfers.filter(
        (transfer) =>
          transfer.stockRequestId === request.id ||
          requestItems.some((item) => item.transferId === transfer.id),
      );
      const sources = SOURCE_ORDER.flatMap<StockFulfillmentSourceProgress>(
        (siteKind) => {
          const sourceItems = requestItems.filter(
            (item) => item.fulfillSiteKind === siteKind,
          );
          if (sourceItems.length === 0) return [];
          const linkedIds = new Set(
            sourceItems.flatMap((item) =>
              item.transferId == null ? [] : [item.transferId],
            ),
          );
          const sourceTransfers = requestTransfers.filter(
            (transfer) =>
              linkedIds.has(transfer.id) ||
              (!requestItems.some((item) => item.transferId === transfer.id) &&
                transfer.fromSite.kind === siteKind),
          );
          const journey = getStockJourney({
            requestStatus: request.status,
            items: sourceItems,
            transfers: sourceTransfers.map((transfer) => ({
              status: transfer.status,
              lines: transfer.lines,
            })),
          });
          return [
            {
              siteKind,
              itemCount: sourceItems.length,
              pendingItemCount: sourceItems.filter(
                (item) => item.status === "pending",
              ).length,
              stage: journey.stage,
              outcome: journey.outcome,
              receivedTransfers: journey.receivedTransfers,
              activeTransfers: journey.activeTransfers,
              transfers: sourceTransfers.map((transfer) => ({
                id: transfer.id,
                documentNumber: transfer.transferNumber,
                status: transfer.status,
              })),
            },
          ];
        },
      );
      const workKinds = new Set<StockFulfillmentWorkKind>();
      if (
        request.status === "draft" ||
        requestItems.some((item) => item.status === "pending")
      ) {
        workKinds.add("request");
      }
      for (const transfer of requestTransfers) {
        for (const kind of transferWorkKinds(transfer, viewer))
          workKinds.add(kind);
      }
      const orderedWorkKinds = (
        ["request", "dispatch", "receive"] as const
      ).filter((kind) => workKinds.has(kind));

      return [
        {
          kind: "request",
          requestId: request.id,
          documentNumber: request.requestNumber,
          requesterSite: request.requesterSite,
          createdAt: request.createdAt,
          neededAt: request.neededAt,
          status: request.status,
          lifecycle: requestLifecycle(request, requestItems, requestTransfers),
          workKinds: orderedWorkKinds,
          sources,
          currentWork: workLabels(orderedWorkKinds, viewer),
          lineCount: requestItems.length,
        },
      ];
    },
  );

  // Central: all orphan DCs. Branch: only inbound receive-ready DCs (push /
  // FG handoff) — not draft/dispatch chrome or outbound from the store.
  const manualTransferRows = transfers.flatMap<StockFulfillmentJourneyRow>(
    (transfer) => {
      if (transfer.stockRequestId != null) return [];
      const workKinds = transferWorkKinds(transfer, viewer);
      if (viewer.mode === "branch") {
        if (viewer.branchId == null) return [];
        if (transfer.toSite.id !== viewer.branchId) return [];
        if (!workKinds.includes("receive")) return [];
      }
      return [
        {
          kind: "manual_transfer",
          transferId: transfer.id,
          documentNumber: transfer.transferNumber,
          fromSite: transfer.fromSite,
          toSite: transfer.toSite,
          createdAt: transfer.createdAt,
          status: transfer.status,
          lifecycle:
            transfer.status === "cancelled"
              ? "cancelled"
              : TERMINAL_TRANSFER_STATUSES.has(transfer.status)
                ? "completed"
                : "active",
          workKinds,
          currentWork: workLabels(workKinds, viewer),
          lineCount: transfer.lines.length,
        },
      ];
    },
  );

  return [...requestRows, ...manualTransferRows].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
}
