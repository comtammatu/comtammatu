export type PendingWasteItem = {
  itemId: number;
  ingredientId: number;
  ingredientName: string;
  quantity: number;
  unit: string;
  unitCost: number | null;
  totalCost: number;
  reasonCode: string;
  photoUrls: string[];
  wasteTier: number | null;
  qtyRatio: number | null;
  rolling15MinSum: number | null;
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
  totalValue: number;
  notes: string | null;
  items: PendingWasteItem[];
};
