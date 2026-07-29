export type StockJourneyStage =
  "request" | "preparation" | "in_transit" | "received";

export type StockJourneyOutcome =
  "cancelled" | "closed" | "rejected" | "short_received" | null;

export type StockJourneyNextAction =
  "edit" | "prepare" | "ship" | "receive" | "none";

export interface StockJourneyItem {
  status: string;
}

export interface StockJourneyTransfer {
  status: string;
  lines?: Array<{
    quantity: number;
    quantityReceived: number | null;
  }>;
}

export interface StockJourney {
  stage: StockJourneyStage;
  outcome: StockJourneyOutcome;
  nextAction: StockJourneyNextAction;
  receivedTransfers: number;
  activeTransfers: number;
}

export function getStockJourney({
  requestStatus,
  items,
  transfers,
}: {
  requestStatus: string;
  items: StockJourneyItem[];
  transfers: StockJourneyTransfer[];
}): StockJourney {
  const activeTransfers = transfers.filter(
    (transfer) => transfer.status !== "cancelled",
  );
  const receivedTransfers = activeTransfers.filter(
    (transfer) => transfer.status === "received",
  ).length;
  const hasPendingLines = items.some((item) => item.status === "pending");
  const hasDraftTransfer = activeTransfers.some(
    (transfer) => transfer.status === "draft",
  );
  const allReceived =
    activeTransfers.length > 0 &&
    receivedTransfers === activeTransfers.length &&
    !hasPendingLines;

  const stage: StockJourneyStage =
    requestStatus === "draft"
      ? "request"
      : hasPendingLines || activeTransfers.length === 0 || hasDraftTransfer
        ? "preparation"
        : allReceived
          ? "received"
          : "in_transit";

  const shortReceived = transfers.some(
    (transfer) =>
      transfer.status === "received" &&
      transfer.lines?.some(
        (line) =>
          line.quantityReceived != null &&
          line.quantityReceived < line.quantity,
      ),
  );

  const outcome: StockJourneyOutcome =
    requestStatus === "cancelled"
      ? "cancelled"
      : items.some((item) => item.status === "rejected")
        ? "rejected"
        : shortReceived
          ? "short_received"
          : requestStatus === "closed"
            ? "closed"
            : null;

  const nextAction: StockJourneyNextAction =
    requestStatus === "draft"
      ? "edit"
      : hasPendingLines && requestStatus === "submitted"
        ? "prepare"
        : hasDraftTransfer
          ? "ship"
          : stage === "in_transit"
            ? "receive"
            : "none";

  return {
    stage,
    outcome,
    nextAction,
    receivedTransfers,
    activeTransfers: activeTransfers.length,
  };
}

export const STOCK_JOURNEY_STAGE_LABELS: Record<StockJourneyStage, string> = {
  request: "Yêu cầu",
  preparation: "Chuẩn bị hàng",
  in_transit: "Đang giao",
  received: "Đã nhận",
};

export const STOCK_JOURNEY_OUTCOME_LABELS: Record<
  Exclude<StockJourneyOutcome, null>,
  string
> = {
  cancelled: "Đã hủy",
  closed: "Đã đóng phần còn lại",
  rejected: "Có dòng bị từ chối",
  short_received: "Có dòng nhận thiếu",
};
