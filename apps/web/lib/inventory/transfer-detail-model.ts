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
  monetary: {
    subtotal: number;
    shipping: number;
    total: number;
  } | null;
  items: Array<{
    ingredientId: number;
    name: string;
    sku: string;
    qty: number;
    unit: string;
    monetary: { cost: number; total: number } | null;
    received: number | null;
  }>;
}

export type TransferActionKind =
  "confirm_ship" | "mark_in_transit" | "confirm_receive" | "receive";

export interface TransferActionConfig {
  kind: TransferActionKind;
  enabled: boolean;
}

export function isTransferReceiveReady(status: string): boolean {
  return status === "confirmed_receive";
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
    if (isIntraBranch) return null;
    return {
      kind: "confirm_ship",
      enabled: userRole === "branch_manager" ? false : true,
    };
  }

  // Rare recovery for pre-unify / failed auto-transit rows. Happy-path ship
  // already lands on in_transit via stock_transfer_confirm_ship wrapper.
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

  if (transfer.status === "in_transit") {
    return {
      kind: "confirm_receive",
      enabled:
        userRole === "branch_manager"
          ? userBranchId === transfer.toBranchId
          : true,
    };
  }

  return null;
}
