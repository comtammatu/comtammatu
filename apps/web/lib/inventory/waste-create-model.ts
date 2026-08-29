export type WasteFormContext = {
  tenantId: number;
  branch: { id: number; name: string; kind: string };
  locations: Array<{ id: number; name: string; kind: string }>;
  ingredients: Array<{
    id: number;
    name: string;
    unit: string;
    issueUnits: Array<{
      unitId: number;
      code: string;
      label: string;
      isBase: boolean;
      toBaseFactor: number;
    }>;
    stockLevels: Array<{
      locationId: number;
      quantity: number;
    }>;
  }>;
  capStatus: {
    shiftKey: string;
    requiresReview: boolean;
  };
  branches?: Array<{ id: number; name: string }>;
};

export type WasteLineState = {
  uid: string;
  ingredientId: number | null;
  unit: string;
  entryUnitId: string;
  quantity: string;
  reasonCode: string;
  note: string;
  photoUrls: string[];
};

export type WasteRollingStatus = {
  rollingSum: number;
  lineCount: number;
  tierOneThreshold: number;
};

export function newWasteLine(uid: string): WasteLineState {
  return {
    uid,
    ingredientId: null,
    unit: "kg",
    entryUnitId: "",
    quantity: "",
    reasonCode: "",
    note: "",
    photoUrls: [],
  };
}

export {
  previewWasteLineTierFromReason,
  previewWasteTier,
  type WasteTierPreview,
  type WasteTierPreviewInput,
} from "./waste-tier-model";
