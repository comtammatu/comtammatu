import type { IngredientUnitRow } from "@lib/inventory/types";
import { messages } from "@lib/messages";
import type {
  StockActionPermissions,
  StockStatus,
} from "./stock-on-hand-model";

const stockCopy = messages.inventory.stock;

export type StockIngredientDetailIngredient = {
  id: number;
  name: string;
  sku: string;
  category: string;
  unit: string;
  issue_unit_id?: number | null;
  units: IngredientUnitRow[];
  min: number;
  max: number;
  reorder: number;
  storageType: string | null;
};

export type StockIngredientDetailLocation = {
  locationId: number;
  name: string;
  code: string;
  locationKind: string;
  qty: number;
  monetary: { avgUnitCost: number | null } | null;
  lastCountedAt: string | null;
};

export type StockIngredientDetailMovement = {
  id: number;
  type: string;
  movementSubtype: string | null;
  quantityChange: number;
  monetary: { unitCost: number | null } | null;
  reason: string | null;
  createdAt: string;
  grnId: number | null;
  transferId: number | null;
  issueId: number | null;
  orderId: number | null;
  productionRunId: number | null;
  locationName: string | null;
  locationCode: string | null;
};

export type StockIngredientDetailPermissions = Pick<
  StockActionPermissions,
  | "canCreateStockRequest"
  | "canReceiveGrn"
  | "canManagePurchaseRequest"
  | "canCreateTransfer"
  | "canCreateStocktake"
  | "canCreateIssue"
  | "canWriteoff"
>;

export type StockIngredientDetailValuation = {
  totalValue: number;
  wac: number;
};

export type StockIngredientDetailData = {
  branchId: number;
  coreDataLoadFailed: boolean;
  ingredient: StockIngredientDetailIngredient;
  locations: StockIngredientDetailLocation[];
  movements: StockIngredientDetailMovement[];
  totalQty: number;
  latestCountedAt: string | null;
  status: StockStatus;
  storageTemperature: string | null;
  valuation: StockIngredientDetailValuation | null;
  permissions: StockIngredientDetailPermissions;
};

export type StockMovementBadgeVariant = "success" | "destructive" | "secondary";

export function computeStockIngredientDetailStatus(
  qty: number,
  min: number,
): StockStatus {
  if (qty <= 0) return "out";
  if (min > 0 && qty <= min) return "low";
  return "normal";
}

export function stockStorageTemperature(type: string | null): string | null {
  if (type === "refrigerated") return "0-4°C";
  if (type === "frozen") return "-18°C";
  return null;
}

export function stockMovementLabel(
  movement: StockIngredientDetailMovement,
): string {
  if (movement.type === "grn_receipt") return stockCopy.movement.grnReceipt;
  if (movement.type === "transfer_in") return stockCopy.movement.transferIn;
  if (movement.type === "transfer_out") return stockCopy.movement.transferOut;
  if (movement.type === "production_consumption") {
    return stockCopy.movement.productionConsumption;
  }
  if (movement.type === "production_output") {
    return stockCopy.movement.productionOutput;
  }
  if (movement.type === "count_adjustment") {
    return stockCopy.movement.countAdjustment;
  }
  if (movement.type === "adjustment") return stockCopy.movement.adjustment;
  if (movement.type === "consumption") {
    if (movement.movementSubtype === "storage_loss") {
      return stockCopy.movement.storageLoss;
    }
    if (movement.movementSubtype === "sale_consumption") {
      return stockCopy.movement.saleConsumption;
    }
    if (movement.movementSubtype === "writeoff") {
      return stockCopy.movement.writeoff;
    }
    if (movement.movementSubtype === "other") {
      return stockCopy.movement.other;
    }
    return stockCopy.movement.issueStock;
  }
  if (movement.type === "writeoff") return stockCopy.movement.writeoff;
  return movement.type.replaceAll("_", " ");
}

export function stockMovementBadgeVariant(
  quantityChange: number,
): StockMovementBadgeVariant {
  if (quantityChange > 0) return "success";
  if (quantityChange < 0) return "destructive";
  return "secondary";
}

export function stockMovementReferenceLabel(
  movement: StockIngredientDetailMovement,
): string | null {
  if (movement.grnId != null) return `Phiếu nhập #${movement.grnId}`;
  if (movement.transferId != null) {
    return stockCopy.movement.transferRef(movement.transferId);
  }
  if (movement.issueId != null) {
    return stockCopy.movement.issueRef(movement.issueId);
  }
  if (movement.productionRunId != null) {
    return stockCopy.movement.productionRef(movement.productionRunId);
  }
  if (movement.orderId != null) {
    return stockCopy.movement.orderRef(movement.orderId);
  }
  return null;
}

export function stockMovementReferenceHref({
  movement,
  branchId,
  branchStockBasePath,
}: {
  movement: StockIngredientDetailMovement;
  branchId: number;
  branchStockBasePath?: string;
}): string | null {
  if (branchStockBasePath) {
    if (movement.grnId != null) {
      return `${branchStockBasePath}/grn/${movement.grnId}`;
    }
    if (movement.transferId != null) {
      return `${branchStockBasePath}/transfer/${movement.transferId}`;
    }
    if (movement.issueId != null) {
      return `${branchStockBasePath}/issues/${movement.issueId}`;
    }
    return null;
  }

  if (movement.grnId != null)
    return `/inventory/grn?grnId=${movement.grnId}&mode=view`;
  if (movement.transferId != null) {
    return `/inventory/transfers?transferId=${movement.transferId}&mode=view`;
  }
  if (movement.issueId != null) return `/inventory/consumption/${movement.issueId}`;
  return `/inventory/reports?branchId=${branchId}`;
}
