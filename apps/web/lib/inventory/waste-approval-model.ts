export type PendingWasteItem = {
  itemId: number;
  ingredientId: number;
  ingredientName: string;
  quantity: number;
  unit: string;
  /** Base/warehouse unit label for per-base WAC display. */
  baseUnit: string;
  /** ingredient_units.to_base_factor for the entry unit (1 when entry is base). */
  toBaseFactor: number;
  monetary: {
    unitCost: number | null;
    totalCost: number;
    qtyRatio: number | null;
    rolling15MinSum: number | null;
  } | null;
  reasonCode: string;
  photoUrls: string[];
  wasteTier: number | null;
};

export type PendingWasteRow = {
  issueId: number;
  issueNumber: string;
  branchId: number;
  branchName: string;
  issuedAt: string;
  shiftKey: string;
  sourceType: string;
  createdBy: string;
  createdByName: string;
  isSelfCreated: boolean;
  monetary: { totalValue: number } | null;
  notes: string | null;
  items: PendingWasteItem[];
};
