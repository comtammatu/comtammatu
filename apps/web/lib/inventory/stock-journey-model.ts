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
  id?: number;
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

/** Branch-facing YCH progress — central prep is not a Branch stage. */
export type BranchStockRequestStep =
  | "submit"
  | "approved"
  | "shipping"
  | "confirm";

export type BranchStockRequestProgress = {
  steps: readonly BranchStockRequestStep[];
  currentStep: BranchStockRequestStep;
  currentIndex: number;
  /** True when every step is complete (goods confirmed). */
  allDone: boolean;
  /** Destination receive pad is available. */
  canConfirm: boolean;
  firstReceiveTransferId: number | null;
  outcome: StockJourneyOutcome;
};

export const BRANCH_STOCK_REQUEST_STEPS = [
  "submit",
  "approved",
  "shipping",
  "confirm",
] as const satisfies readonly BranchStockRequestStep[];

export const BRANCH_STOCK_REQUEST_STEP_LABELS: Record<
  BranchStockRequestStep,
  string
> = {
  submit: "Gửi yêu cầu",
  approved: "Đã duyệt",
  shipping: "Giao hàng",
  confirm: "Xác nhận",
};

const BRANCH_SHIPPED_STATUSES = new Set([
  "confirmed_ship",
  "in_transit",
  "confirmed_receive",
  "received",
]);

const BRANCH_RECEIVE_READY_STATUSES = new Set([
  "confirmed_ship",
  "in_transit",
  "confirmed_receive",
]);

function journeyOutcome({
  requestStatus,
  items,
  transfers,
}: {
  requestStatus: string;
  items: StockJourneyItem[];
  transfers: StockJourneyTransfer[];
}): StockJourneyOutcome {
  const shortReceived = transfers.some(
    (transfer) =>
      transfer.status === "received" &&
      transfer.lines?.some(
        (line) =>
          line.quantityReceived != null &&
          line.quantityReceived < line.quantity,
      ),
  );
  if (requestStatus === "cancelled") return "cancelled";
  if (items.some((item) => item.status === "rejected")) return "rejected";
  if (shortReceived) return "short_received";
  if (requestStatus === "closed") return "closed";
  return null;
}

/**
 * Branch progress only. Central allocate/ship prep is collapsed into
 * Đã duyệt → Giao hàng without exposing source/DC detail.
 */
export function getBranchStockRequestProgress({
  requestStatus,
  items,
  transfers,
}: {
  requestStatus: string;
  items: StockJourneyItem[];
  transfers: StockJourneyTransfer[];
}): BranchStockRequestProgress {
  const activeTransfers = transfers.filter(
    (transfer) => transfer.status !== "cancelled",
  );
  const submitDone = requestStatus !== "draft";
  const approvedDone =
    submitDone &&
    (requestStatus !== "submitted" ||
      items.some((item) => item.status !== "pending") ||
      activeTransfers.length > 0);
  const shippingDone = activeTransfers.some((transfer) =>
    BRANCH_SHIPPED_STATUSES.has(transfer.status),
  );
  const confirmDone =
    activeTransfers.length > 0 &&
    activeTransfers.every((transfer) => transfer.status === "received") &&
    !items.some((item) => item.status === "pending");

  const doneFlags = [submitDone, approvedDone, shippingDone, confirmDone];
  let currentIndex = doneFlags.findIndex((done) => !done);
  const allDone = currentIndex === -1;
  if (allDone) currentIndex = BRANCH_STOCK_REQUEST_STEPS.length - 1;

  const firstReceive = activeTransfers.find((transfer) =>
    BRANCH_RECEIVE_READY_STATUSES.has(transfer.status),
  );

  return {
    steps: BRANCH_STOCK_REQUEST_STEPS,
    currentStep: BRANCH_STOCK_REQUEST_STEPS[currentIndex]!,
    currentIndex,
    allDone,
    canConfirm: firstReceive != null,
    firstReceiveTransferId:
      firstReceive != null && typeof firstReceive.id === "number"
        ? firstReceive.id
        : null,
    outcome: journeyOutcome({ requestStatus, items, transfers }),
  };
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
    outcome: journeyOutcome({ requestStatus, items, transfers }),
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
