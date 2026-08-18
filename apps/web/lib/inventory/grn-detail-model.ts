import { formatQuantity } from "@comtammatu/shared/format";
import type { IngredientRow, IngredientUnitRow } from "@lib/inventory/types";
import { messages } from "@lib/messages";
import {
  formatGrnSupplierSummary,
  type GrnCreateSupplierOption,
} from "./grn-create-model";

export const GRN_DETAIL_COPY = messages.inventory.grn;

export type GrnPackLooseUnit = {
  unitId: number;
  label: string;
  toBaseFactor: number;
};

export type GrnDetailItem = {
  lineId: number;
  ingredientId: number;
  name: string;
  sku: string;
  supplierId: number;
  supplierName: string;
  poQuantity: number | null;
  previouslyReceived: number;
  remainingQuantity: number;
  required: number;
  actual: number;
  rejected: number;
  acceptedQuantity: number;
  poAppliedQuantity: number;
  shortageQuantity: number;
  excessQuantity: number;
  rejectionReason: string;
  rejectedPhotoUrl: string;
  unit: string;
  entryUnitId: number | null;
  poEntryUnitId: number | null;
  poUnitLabel: string;
  persistToBaseFactor: number;
  poToBaseFactor: number;
  packUnit: GrnPackLooseUnit | null;
  looseUnit: GrnPackLooseUnit | null;
  /** Ingredient unit that `monetary.unitPrice` is quoted in. */
  unitCostUnitId: number | null;
  unitCostUnitLabel: string;
  unitCostToBaseFactor: number;
  /** True when accepted qty is missing a GRN book unit price. */
  costPending: boolean;
  provisionalCostSource: string | null;
  monetary: {
    unitPrice: number | null;
    lineTotal: number;
  } | null;
};

export type GrnLinkedPo = {
  id: number;
  poNumber: string;
  status: string;
  supplierId: number | null;
  supplierName: string;
};

export type GrnDetail = {
  id: number;
  tenantId: number;
  code: string;
  poCode: string;
  poId: number | null;
  poStatus?: string | null;
  purchaseRequestId: number | null;
  purchaseRequestCode: string | null;
  expectedReceiveDate: string | null;
  linkedPos: GrnLinkedPo[];
  invoiceId: number | null;
  branchId: number;
  locationId: number | null;
  locationName: string | null;
  branchName: string;
  supplierId: number | null;
  supplier: string;
  date: string;
  status: string;
  items: GrnDetailItem[];
};

export type ReceivingLocationOption = {
  id: number;
  name: string;
  branchId: number;
  branchName: string;
  branchKind: string | null;
  kind: string | null;
  isDefaultReceive: boolean;
};

export type GrnDetailData = {
  grn: GrnDetail;
  ingredients: IngredientRow[];
  auditLogs: Array<{
    id: number;
    action: string;
    entityType: string;
    entityId: string;
    userId: string | null;
    actorName: string | null;
    createdAt: string;
  }>;
  canEditDraft: boolean;
  canConfirm: boolean;
  canManageSupplierInvoice: boolean;
  canAdjustStock: boolean;
  canAmendConfirmed: boolean;
  receivingLocationOptions: ReceivingLocationOption[];
};

export type EditableGrnLine = GrnDetailItem & { dirty: boolean };

export function acceptedGrnQuantity(
  receivedQuantity: number,
  rejectedQuantity: number,
): number {
  return Math.max(receivedQuantity - rejectedQuantity, 0);
}

export function deliveredGrnQuantity(
  acceptedQuantity: number,
  rejectedQuantity: number,
): number {
  return Math.max(acceptedQuantity, 0) + Math.max(rejectedQuantity, 0);
}

export function calculateGrnQuantities(
  receivedQuantity: number,
  rejectedQuantity: number,
  poRemainingQuantity: number,
  conversion?: { persistToBase: number; poToBase: number },
) {
  const persistToBase = conversion?.persistToBase ?? 1;
  const poToBase = conversion?.poToBase ?? 1;
  const acceptedQuantity = acceptedGrnQuantity(
    receivedQuantity,
    rejectedQuantity,
  );
  const remainingQuantity = Math.max(poRemainingQuantity, 0);
  const acceptedBase = acceptedQuantity * persistToBase;
  const remainingBase = remainingQuantity * poToBase;
  const appliedBase = Math.min(acceptedBase, remainingBase);
  const poAppliedQuantity =
    poToBase > 0 ? roundGrnQuantity(appliedBase / poToBase) : 0;
  const excessQuantity =
    persistToBase > 0
      ? roundGrnQuantity((acceptedBase - appliedBase) / persistToBase)
      : 0;
  const shortageQuantity =
    poToBase > 0
      ? roundGrnQuantity((remainingBase - appliedBase) / poToBase)
      : 0;
  return {
    acceptedQuantity,
    poAppliedQuantity,
    shortageQuantity,
    excessQuantity,
  };
}

export type GrnQuantityConversion = {
  persistToBase: number;
  poToBase: number;
};

export function grnLineQuantityConversion(
  line: Pick<GrnDetailItem, "persistToBaseFactor" | "poToBaseFactor">,
): GrnQuantityConversion {
  return {
    persistToBase: line.persistToBaseFactor,
    poToBase: line.poToBaseFactor,
  };
}

export function applyGrnLineQuantities<T extends GrnDetailItem>(line: T): T {
  const calculated = calculateGrnQuantities(
    line.actual,
    line.rejected,
    line.remainingQuantity,
    grnLineQuantityConversion(line),
  );
  const unitPrice = line.monetary?.unitPrice ?? null;
  const priceToBase =
    line.unitCostToBaseFactor > 0 ? line.unitCostToBaseFactor : 1;
  const persistToBase =
    line.persistToBaseFactor > 0 ? line.persistToBaseFactor : 1;
  const monetary =
    line.monetary == null
      ? line.monetary
      : {
          unitPrice,
          lineTotal:
            unitPrice == null
              ? line.monetary.lineTotal
              : grnLineBookTotal(
                  calculated.acceptedQuantity,
                  persistToBase,
                  unitPrice,
                  priceToBase,
                ),
        };
  return { ...line, ...calculated, monetary };
}

export function grnLineBookTotal(
  acceptedQty: number,
  persistToBase: number,
  unitPrice: number,
  priceToBase: number,
): number {
  if (
    !(acceptedQty > 0) ||
    !(unitPrice > 0) ||
    !(persistToBase > 0) ||
    !(priceToBase > 0)
  ) {
    return 0;
  }
  return Math.round(((acceptedQty * persistToBase * unitPrice) / priceToBase) * 100) / 100;
}

export function resolveDefaultGrnPriceUnit(
  line: Pick<
    GrnDetailItem,
    | "packUnit"
    | "looseUnit"
    | "entryUnitId"
    | "persistToBaseFactor"
    | "unit"
  >,
): { unitId: number | null; label: string; toBaseFactor: number } {
  if (
    line.packUnit &&
    line.looseUnit &&
    line.entryUnitId === line.looseUnit.unitId
  ) {
    return {
      unitId: line.packUnit.unitId,
      label: line.packUnit.label,
      toBaseFactor: line.packUnit.toBaseFactor,
    };
  }
  return {
    unitId: line.entryUnitId,
    label: line.unit,
    toBaseFactor: line.persistToBaseFactor > 0 ? line.persistToBaseFactor : 1,
  };
}

export function patchGrnLineUnitPrice(
  line: Pick<GrnDetailItem, "actual" | "rejected"> &
    Partial<Pick<GrnDetailItem, "persistToBaseFactor" | "unitCostToBaseFactor">>,
  unitPrice: number,
): Pick<GrnDetailItem, "monetary" | "costPending" | "provisionalCostSource"> {
  const accepted = acceptedGrnQuantity(line.actual, line.rejected);
  const nextPrice = Number.isFinite(unitPrice) ? Math.max(0, unitPrice) : 0;
  const persistToBase =
    line.persistToBaseFactor && line.persistToBaseFactor > 0
      ? line.persistToBaseFactor
      : 1;
  const priceToBase =
    line.unitCostToBaseFactor && line.unitCostToBaseFactor > 0
      ? line.unitCostToBaseFactor
      : persistToBase;
  return {
    monetary: {
      unitPrice: nextPrice,
      lineTotal: grnLineBookTotal(
        accepted,
        persistToBase,
        nextPrice,
        priceToBase,
      ),
    },
    costPending: !(nextPrice > 0),
    provisionalCostSource: nextPrice > 0 ? "grn_receipt" : "pending",
  };
}

const GRN_QTY_SCALE = 1000;

export function roundGrnQuantity(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * GRN_QTY_SCALE) / GRN_QTY_SCALE;
}

export function convertQuantityBetweenFactors(
  quantity: number,
  fromToBase: number,
  toToBase: number,
): number {
  if (!(toToBase > 0)) return 0;
  return roundGrnQuantity(quantity * (fromToBase / toToBase));
}

export function convertUnitPriceBetweenFactors(
  unitPrice: number,
  fromToBase: number,
  toToBase: number,
): number {
  if (!(fromToBase > 0) || !(toToBase > 0) || !Number.isFinite(unitPrice)) {
    return 0;
  }
  return Math.round(((unitPrice * toToBase) / fromToBase) * 100) / 100;
}

function unitLabel(unit: IngredientUnitRow): string {
  return unit.unit_name?.trim() || unit.unit_code;
}

export function resolveGrnPackLooseUnits(
  units: IngredientUnitRow[] | undefined,
  packUnitId: number | null | undefined,
): { pack: GrnPackLooseUnit; loose: GrnPackLooseUnit } | null {
  if (packUnitId == null) return null;
  const active = (units ?? []).filter((unit) => unit.is_active);
  const packRow = active.find((unit) => unit.unit_id === packUnitId);
  if (
    packRow == null ||
    packRow.is_base ||
    packRow.anchor_unit_id == null ||
    !(packRow.to_base_factor > 0)
  ) {
    return null;
  }
  const looseRow = active.find(
    (unit) => unit.unit_id === packRow.anchor_unit_id,
  );
  if (
    looseRow == null ||
    !(looseRow.to_base_factor > 0) ||
    looseRow.unit_id === packRow.unit_id
  ) {
    return null;
  }
  return {
    pack: {
      unitId: packRow.unit_id,
      label: unitLabel(packRow),
      toBaseFactor: packRow.to_base_factor,
    },
    loose: {
      unitId: looseRow.unit_id,
      label: unitLabel(looseRow),
      toBaseFactor: looseRow.to_base_factor,
    },
  };
}

export function resolveGrnPackLooseForPersist(
  units: IngredientUnitRow[] | undefined,
  persistUnitId: number | null | undefined,
): { pack: GrnPackLooseUnit; loose: GrnPackLooseUnit } | null {
  const asPack = resolveGrnPackLooseUnits(units, persistUnitId);
  if (asPack) return asPack;
  if (persistUnitId == null) return null;
  const packRow = (units ?? []).find(
    (unit) =>
      unit.is_active &&
      !unit.is_base &&
      unit.anchor_unit_id === persistUnitId,
  );
  return packRow
    ? resolveGrnPackLooseUnits(units, packRow.unit_id)
    : null;
}

export function combinePackLooseQuantity(
  packQty: number,
  looseQty: number,
  packToBase: number,
  persistToBase: number,
): number {
  if (!(persistToBase > 0)) return 0;
  return roundGrnQuantity(
    (Math.max(packQty, 0) * packToBase +
      Math.max(looseQty, 0) * persistToBase) /
      persistToBase,
  );
}

export function splitPersistToPackLoose(
  persistQty: number,
  packToBase: number,
  persistToBase: number,
): { packQty: number; looseQty: number } {
  if (!(persistToBase > 0) || !(packToBase > 0)) {
    return { packQty: 0, looseQty: roundGrnQuantity(Math.max(persistQty, 0)) };
  }
  const packInPersist = packToBase / persistToBase;
  const safe = Math.max(persistQty, 0);
  const packQty = Math.floor((safe + 1e-9) / packInPersist);
  const looseQty = roundGrnQuantity(safe - packQty * packInPersist);
  return { packQty, looseQty };
}

export function formatPackLooseQuantity(
  packQty: number,
  packLabel: string,
  looseQty: number,
  looseLabel: string,
): string {
  const packText = `${formatQuantity(packQty)} ${packLabel}`;
  const looseText = `${formatQuantity(looseQty)} ${looseLabel}`;
  if (packQty > 0 && looseQty > 0) return `${packText} + ${looseText}`;
  if (packQty > 0) return packText;
  if (looseQty > 0) return looseText;
  return `${formatQuantity(0)} ${packLabel}`;
}

export function grnLineHasPackLoose(
  line: Pick<GrnDetailItem, "packUnit" | "looseUnit" | "entryUnitId">,
): boolean {
  if (line.packUnit == null || line.looseUnit == null) return false;
  if (line.entryUnitId == null) return true;
  return line.entryUnitId === line.looseUnit.unitId;
}

export function applyGrnLineEntryUnit(
  line: GrnDetailItem,
  units: IngredientUnitRow[] | undefined,
  nextUnitId: number,
): Partial<GrnDetailItem> | null {
  const nextRow = (units ?? []).find(
    (unit) => unit.unit_id === nextUnitId && unit.is_active,
  );
  const toFactor = Number(nextRow?.to_base_factor);
  if (!nextRow || !Number.isFinite(toFactor) || !(toFactor > 0)) {
    return null;
  }
  if (!Number.isInteger(nextUnitId) || nextUnitId <= 0) {
    return null;
  }
  const fromFactor = line.persistToBaseFactor > 0 ? line.persistToBaseFactor : 1;
  const nextActual = convertQuantityBetweenFactors(
    line.actual,
    fromFactor,
    toFactor,
  );
  const nextRejected = convertQuantityBetweenFactors(
    line.rejected,
    fromFactor,
    toFactor,
  );
  return {
    actual: nextActual,
    rejected: nextRejected,
    entryUnitId: nextUnitId,
    unit: unitLabel(nextRow),
    persistToBaseFactor: toFactor,
    ...patchGrnLineUnitPrice(
      {
        actual: nextActual,
        rejected: nextRejected,
        persistToBaseFactor: toFactor,
        unitCostToBaseFactor: line.unitCostToBaseFactor,
      },
      line.monetary?.unitPrice ?? 0,
    ),
  };
}

export function applyGrnLinePriceUnit(
  line: GrnDetailItem,
  units: IngredientUnitRow[] | undefined,
  nextUnitId: number,
): Partial<GrnDetailItem> | null {
  if (!Number.isInteger(nextUnitId) || nextUnitId <= 0) {
    return null;
  }
  const nextRow = (units ?? []).find(
    (unit) => unit.unit_id === nextUnitId && unit.is_active,
  );
  const toFactor = Number(nextRow?.to_base_factor);
  if (!nextRow || !Number.isFinite(toFactor) || !(toFactor > 0)) {
    return null;
  }
  const fromFactor =
    line.unitCostToBaseFactor > 0 ? line.unitCostToBaseFactor : 1;
  const currentPrice = line.monetary?.unitPrice ?? 0;
  const nextPrice =
    currentPrice > 0
      ? convertUnitPriceBetweenFactors(currentPrice, fromFactor, toFactor)
      : currentPrice;
  return {
    unitCostUnitId: nextUnitId,
    unitCostUnitLabel: unitLabel(nextRow),
    unitCostToBaseFactor: toFactor,
    ...patchGrnLineUnitPrice(
      {
        actual: line.actual,
        rejected: line.rejected,
        persistToBaseFactor: line.persistToBaseFactor,
        unitCostToBaseFactor: toFactor,
      },
      nextPrice,
    ),
  };
}

export function formatGrnQuantity(
  quantity: number,
  unitToBase: number,
  line: Pick<GrnDetailItem, "packUnit" | "looseUnit">,
  fallbackLabel: string,
): string {
  if (line.packUnit && line.looseUnit && unitToBase > 0) {
    const persistQty = convertQuantityBetweenFactors(
      quantity,
      unitToBase,
      line.looseUnit.toBaseFactor,
    );
    const split = splitPersistToPackLoose(
      persistQty,
      line.packUnit.toBaseFactor,
      line.looseUnit.toBaseFactor,
    );
    return formatPackLooseQuantity(
      split.packQty,
      line.packUnit.label,
      split.looseQty,
      line.looseUnit.label,
    );
  }
  return `${formatQuantity(quantity)} ${fallbackLabel}`;
}

export function formatGrnPoQty(
  quantity: number,
  line: Pick<
    GrnDetailItem,
    "packUnit" | "looseUnit" | "poToBaseFactor" | "poUnitLabel"
  >,
): string {
  return formatGrnQuantity(
    quantity,
    line.poToBaseFactor,
    line,
    line.poUnitLabel,
  );
}

export function formatGrnPersistQty(
  quantity: number,
  line: Pick<
    GrnDetailItem,
    "packUnit" | "looseUnit" | "persistToBaseFactor" | "unit"
  >,
): string {
  return formatGrnQuantity(
    quantity,
    line.persistToBaseFactor,
    line,
    line.unit,
  );
}

export function splitGrnAcceptedPackLoose(
  line: Pick<GrnDetailItem, "actual" | "rejected" | "packUnit" | "looseUnit">,
): { packQty: number; looseQty: number } | null {
  if (!line.packUnit || !line.looseUnit) return null;
  return splitPersistToPackLoose(
    acceptedGrnQuantity(line.actual, line.rejected),
    line.packUnit.toBaseFactor,
    line.looseUnit.toBaseFactor,
  );
}

export function grnLineOrderedDeliveredSummary(
  line: Pick<
    GrnDetailItem,
    | "required"
    | "actual"
    | "rejected"
    | "packUnit"
    | "looseUnit"
    | "persistToBaseFactor"
    | "poToBaseFactor"
    | "poUnitLabel"
    | "unit"
  >,
): string {
  const accepted = acceptedGrnQuantity(line.actual, line.rejected);
  const delivered = deliveredGrnQuantity(accepted, line.rejected);
  return GRN_DETAIL_COPY.line.orderedDeliveredAcceptedText(
    formatGrnPoQty(line.required, line),
    formatGrnPersistQty(delivered, line),
    formatGrnPersistQty(accepted, line),
    formatGrnPersistQty(line.rejected, line),
    delivered,
    line.rejected,
  );
}

export function grnLineReceiptSummary(
  line: Pick<
    GrnDetailItem,
    | "remainingQuantity"
    | "actual"
    | "rejected"
    | "packUnit"
    | "looseUnit"
    | "persistToBaseFactor"
    | "poToBaseFactor"
    | "poUnitLabel"
    | "unit"
  >,
): string {
  const accepted = acceptedGrnQuantity(line.actual, line.rejected);
  return GRN_DETAIL_COPY.line.receiptSummaryText(
    formatGrnPoQty(line.remainingQuantity, line),
    formatGrnPersistQty(accepted, line),
    accepted > 0,
  );
}

export function hasAcceptedGrnQuantity(
  lines: readonly Pick<GrnDetailItem, "actual" | "rejected">[],
): boolean {
  return lines.some(
    (line) => acceptedGrnQuantity(line.actual, line.rejected) > 0,
  );
}

export function isGrnLookupParam(value: string): boolean {
  if (/^\d+$/.test(value)) {
    const numericId = Number(value);
    return Number.isSafeInteger(numericId) && numericId > 0;
  }
  return /^GRN-[A-Za-z0-9_-]{1,60}$/.test(value);
}

export function createEditableGrnLine({
  lineId,
  ingredient,
  quantity,
  entryUnitId,
  unit,
  supplierId,
  supplierName,
  unitCost = 0,
  unitCostUnitId,
}: {
  lineId: number;
  ingredient: IngredientRow;
  quantity: number;
  entryUnitId: number | null;
  unit: string;
  supplierId: number;
  supplierName: string;
  unitCost?: number;
  unitCostUnitId?: number | null;
}): EditableGrnLine {
  const persistRow = (ingredient.units ?? []).find(
    (item) => item.unit_id === entryUnitId && item.is_active,
  );
  const persistFactor = Number(persistRow?.to_base_factor);
  const safePersistFactor =
    Number.isFinite(persistFactor) && persistFactor > 0 ? persistFactor : 1;
  const packLoose = resolveGrnPackLooseForPersist(
    ingredient.units,
    entryUnitId,
  );
  const defaultPrice = resolveDefaultGrnPriceUnit({
    packUnit: packLoose?.pack ?? null,
    looseUnit: packLoose?.loose ?? null,
    entryUnitId,
    persistToBaseFactor: safePersistFactor,
    unit,
  });
  const priceUnitId = unitCostUnitId ?? defaultPrice.unitId;
  const priceRow = (ingredient.units ?? []).find(
    (item) => item.unit_id === priceUnitId && item.is_active,
  );
  const priceFactor = Number(priceRow?.to_base_factor);
  const unitCostToBaseFactor =
    Number.isFinite(priceFactor) && priceFactor > 0
      ? priceFactor
      : defaultPrice.toBaseFactor;
  const unitCostUnitLabel = priceRow
    ? unitLabel(priceRow)
    : defaultPrice.label;
  return {
    lineId,
    ingredientId: ingredient.id,
    name: ingredient.name,
    sku: ingredient.sku ?? "",
    supplierId,
    supplierName,
    poQuantity: null,
    previouslyReceived: 0,
    remainingQuantity: quantity,
    required: quantity,
    actual: quantity,
    rejected: 0,
    acceptedQuantity: quantity,
    poAppliedQuantity: quantity,
    shortageQuantity: 0,
    excessQuantity: 0,
    rejectionReason: "",
    rejectedPhotoUrl: "",
    unit,
    entryUnitId,
    poEntryUnitId: entryUnitId,
    poUnitLabel: unit,
    persistToBaseFactor: safePersistFactor,
    poToBaseFactor: safePersistFactor,
    packUnit: packLoose?.pack ?? null,
    looseUnit: packLoose?.loose ?? null,
    unitCostUnitId: priceUnitId,
    unitCostUnitLabel,
    unitCostToBaseFactor,
    ...patchGrnLineUnitPrice(
      {
        actual: quantity,
        rejected: 0,
        persistToBaseFactor: safePersistFactor,
        unitCostToBaseFactor,
      },
      unitCost,
    ),
    dirty: false,
  };
}

export function grnSupplierSummaryFromItems(
  items: readonly Pick<GrnDetailItem, "supplierId" | "supplierName">[],
  fallback?: string | null,
): string {
  const summary = formatGrnSupplierSummary(items);
  if (summary !== "Theo dòng") return summary;
  return fallback?.trim() || "Theo dòng";
}

export function uniqueGrnSuppliers(
  items: readonly Pick<GrnDetailItem, "supplierId" | "supplierName">[],
): GrnCreateSupplierOption[] {
  const seen = new Map<number, string>();
  for (const item of items) {
    if (!seen.has(item.supplierId)) {
      seen.set(item.supplierId, item.supplierName);
    }
  }
  return [...seen.entries()].map(([id, name]) => ({ id, name }));
}

export function isLinkedPoApproved(status: string | null | undefined): boolean {
  return (
    status === "approved" ||
    status === "sent" ||
    status === "partially_received"
  );
}

export function allLinkedPosApproved(
  linkedPos: readonly Pick<GrnLinkedPo, "status">[],
  legacyPoStatus?: string | null,
): boolean {
  if (linkedPos.length > 0) {
    return linkedPos.every((po) => isLinkedPoApproved(po.status));
  }
  return isLinkedPoApproved(legacyPoStatus);
}

export function hasLinkedPurchaseOrders(
  linkedPos: readonly unknown[],
  poId: number | null,
): boolean {
  return linkedPos.length > 0 || poId != null;
}
