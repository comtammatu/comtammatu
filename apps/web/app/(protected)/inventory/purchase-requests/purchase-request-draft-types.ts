export type RequestDraftLine = {
  key: string;
  ingredientId: string;
  quantity: string;
  entryUnitId: string;
  supplierId: string;
};

export type ReasonAction = {
  kind: "cancel" | "close" | "request_changes" | "reject";
  row: import("@lib/inventory/purchase-request-model").PurchaseRequestRow;
};

export function blankRequestLine(): RequestDraftLine {
  return {
    key: crypto.randomUUID(),
    ingredientId: "",
    quantity: "",
    entryUnitId: "",
    supplierId: "",
  };
}
