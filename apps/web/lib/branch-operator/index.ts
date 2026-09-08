export * from "./components/branch-operator-page";

// SSoT Formatters & Helpers
export {
  formatVND,
  formatAccountingVND,
  formatCompactVND,
  parseVietnameseNumericInput,
  parseVietnameseNumericImport,
  formatNumericInputDraft,
  formatCount,
  formatPortionQuantity,
  formatSidePortionLabel,
} from "@comtammatu/shared/format";

export {
  formatVNBusinessDate,
  formatVNDateTime,
  formatVNDate,
  formatVNWeekdayShort,
  formatVNDayMonth,
  formatVNLongDate,
  formatVNTime,
  formatVNTimeSeconds,
  getVNBusinessDateString,
  VN_TIME_ZONE,
  VN_LOCALE,
  VN_BUSINESS_DAY_CUTOFF_HOUR,
} from "@comtammatu/shared/time";

// SSoT Labels & Dictionaries
export {
  getInventoryLocationKindLabelVi,
  formatInventoryLocationLabelVi,
  APP_COPY_VI,
  MODULE_LABELS_VI,
  ORDER_STATUS_LABELS_VI,
  TABLE_STATUS_LABELS_VI,
  COUNT_SLIP_STATUS_LABELS_VI,
  STOCKTAKE_SESSION_STATUS_LABELS_VI,
  WASTE_REASON_LABELS_VI,
} from "@comtammatu/shared/labels";

export {
  ORDER_VI,
  BRANCH_VI,
  STAFF_VI,
  TABLE_VI,
  PRODUCT_VI,
  ACTIONS_VI,
  STATES_VI,
} from "@comtammatu/shared/messages";

// Short Ladder Contract resolver
export type LabelContext =
  | "button"
  | "tab"
  | "badge"
  | "navigation"
  | "heading"
  | "table";
export type LabelLength = "short" | "long";

export interface LabelVariants {
  short?: string;
  long: string;
}

const LABEL_LENGTH_BY_CONTEXT: Record<LabelContext, LabelLength> = {
  button: "short",
  tab: "short",
  badge: "short",
  navigation: "short",
  heading: "long",
  table: "long",
};

export function resolveLabelByContext(
  variants: LabelVariants,
  context: LabelContext,
  fallbackLength: LabelLength = "long",
): string {
  const preferredLength = LABEL_LENGTH_BY_CONTEXT[context] ?? fallbackLength;
  if (preferredLength === "short") {
    return variants.short ?? variants.long;
  }
  return variants.long;
}
