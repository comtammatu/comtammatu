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

export const LABEL_LENGTH_BY_CONTEXT: Record<LabelContext, LabelLength> = {
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
