import type { StaffRole } from "@comtammatu/shared/auth";

export interface TransferDetail {
  id: number;
  code: string;
  status: string;
  transferScope: "inter_site" | "intra_site";
  reversesTransferId: number | null;
  /** Parent YCH when this DC fulfills a stock request. */
  stockRequestId: number | null;
  stockRequestNumber: string | null;
  fromBranchId: number;
  toBranchId: number;
  fromLocationId: number;
  toLocationId: number;
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
    entryUnitId: number | null;
    name: string;
    sku: string;
    qty: number;
    unit: string;
    /** Base/warehouse unit for per-base WAC labels. */
    baseUnit: string;
    toBaseFactor: number | null;
    monetary: { cost: number; total: number } | null;
    received: number | null;
    /** Entry-unit quantity that has not yet been reversed. */
    reversibleQty: number;
  }>;
}

export type TransferReceiveLocationKind = "warehouse" | "kitchen";

export type TransferReceiveLocationOption = {
  id: number;
  kind: TransferReceiveLocationKind;
  label: string;
};

export type TransferReceiveLocations = {
  warehouse: TransferReceiveLocationOption;
  kitchen: TransferReceiveLocationOption;
};

export type TransferActionKind =
  "confirm_ship" | "mark_in_transit" | "confirm_receive" | "receive";

export function defaultTransferReceiveLocationId(
  transfer: Pick<TransferDetail, "toLocationId">,
  locations: TransferReceiveLocations | null,
): number | null {
  if (locations == null) return transfer.toLocationId;
  if (transfer.toLocationId === locations.kitchen.id) {
    return locations.kitchen.id;
  }
  return locations.warehouse.id;
}

export function resolveTransferReceiveLocationId({
  selectedId,
  locations,
  fallbackLocationId,
}: {
  selectedId: number | null;
  locations: TransferReceiveLocations | null;
  fallbackLocationId: number;
}): number | null {
  if (locations == null) return fallbackLocationId;
  if (
    selectedId === locations.warehouse.id ||
    selectedId === locations.kitchen.id
  ) {
    return selectedId;
  }
  return null;
}

export interface TransferActionConfig {
  kind: TransferActionKind;
  enabled: boolean;
}

export function isTransferReceiveReady(status: string): boolean {
  return status === "confirmed_receive";
}

/** Destination can start the receive session (in_transit → confirmed_receive). */
export function isTransferReceiveStartable(status: string): boolean {
  return status === "in_transit";
}

/** Hub “Kiểm nhận” statuses that should open the receive workspace. */
export function isTransferReceiveWorkspaceStatus(status: string): boolean {
  return (
    status === "in_transit" ||
    status === "confirmed_ship" ||
    status === "confirmed_receive"
  );
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
  if (transfer.transferScope === "intra_site") return null;

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
