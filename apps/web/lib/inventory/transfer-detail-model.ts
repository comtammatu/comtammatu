import type { StaffRole } from "@comtammatu/shared/auth";

export interface TransferDetail {
  id: number;
  code: string;
  status: string;
  fromBranchId: number;
  toBranchId: number;
  fromBranch: string;
  toBranch: string;
  fromLocation: string;
  toLocation: string;
  createdBy: string;
  date: string;
  note: string | null;
  subtotal: number;
  shipping: number;
  total: number;
  items: Array<{
    ingredientId: number;
    name: string;
    sku: string;
    qty: number;
    unit: string;
    cost: number;
    total: number;
    received: number | null;
  }>;
}

export type TransferActionKind =
  | "confirm_kitchen"
  | "confirm_ship"
  | "mark_in_transit"
  | "receive";

export interface TransferActionConfig {
  kind: TransferActionKind;
  enabled: boolean;
}

export function isTransferReceiveReady(status: string): boolean {
  return status === "in_transit" || status === "confirmed_receive";
}

export function getTransferActionConfig({
  transfer,
  userRole,
  userBranchId,
}: {
  transfer: TransferDetail;
  userRole: StaffRole;
  userBranchId: number | null;
}): TransferActionConfig | null {
  const isIntraBranch = transfer.fromBranchId === transfer.toBranchId;

  if (transfer.status === "draft") {
    return {
      kind: isIntraBranch ? "confirm_kitchen" : "confirm_ship",
      enabled:
        userRole === "branch_manager"
          ? isIntraBranch && userBranchId === transfer.fromBranchId
          : true,
    };
  }

  if (transfer.status === "confirmed_ship") {
    return {
      kind: "mark_in_transit",
      enabled: userRole === "branch_manager" ? false : true,
    };
  }

  if (isTransferReceiveReady(transfer.status)) {
    return {
      kind: "receive",
      enabled:
        userRole === "branch_manager"
          ? userBranchId === transfer.toBranchId
          : true,
    };
  }

  return null;
}
