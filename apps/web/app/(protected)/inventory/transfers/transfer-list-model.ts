import type { StaffRole } from "@comtammatu/shared/auth";

export interface TransferListRow {
  id: number;
  transfer_number: string;
  status: string;
  notes: string | null;
  vehicle_info: string | null;
  shipped_at: string | null;
  received_at: string | null;
  receive_started_at: string | null;
  from_branch_id: number;
  to_branch_id: number;
  created_at: string;
  from_branch_name: string;
  to_branch_name: string;
}

export type TransferTab = "receive" | "dispatch" | "history";

const TRANSFER_QUEUE_PRIORITY: Record<string, number> = {
  in_transit: 0,
  confirmed_ship: 1,
  confirmed_receive: 2,
  draft: 3,
  received: 20,
  completed: 21,
  cancelled: 22,
};

export function compareTransferQueue(
  a: TransferListRow,
  b: TransferListRow,
): number {
  const aCreatedAt = Date.parse(a.created_at);
  const bCreatedAt = Date.parse(b.created_at);
  return (
    (TRANSFER_QUEUE_PRIORITY[a.status] ?? 10) -
      (TRANSFER_QUEUE_PRIORITY[b.status] ?? 10) ||
    (Number.isNaN(bCreatedAt) ? 0 : bCreatedAt) -
      (Number.isNaN(aCreatedAt) ? 0 : aCreatedAt)
  );
}

export function classifyTransfer(
  status: string,
  viewerBranchId: number | null,
  fromId: number,
  toId: number,
  userRole: StaffRole,
): TransferTab {
  const receiveStates = ["in_transit", "confirmed_ship", "confirmed_receive"];
  const dispatchStates = ["draft"];
  const terminal = ["received", "cancelled", "completed"];

  if (terminal.includes(status)) return "history";
  if (receiveStates.includes(status)) {
    if (viewerBranchId != null && viewerBranchId !== toId) {
      return "history";
    }
    return "receive";
  }
  if (dispatchStates.includes(status)) {
    if (userRole === "branch_manager" && viewerBranchId === toId) {
      return "receive";
    }
    if (viewerBranchId != null && viewerBranchId !== fromId) return "history";
    if (userRole === "branch_manager" && fromId !== toId) return "history";
    return "dispatch";
  }
  return "history";
}
