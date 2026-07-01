export type InventorySemanticColor =
  | "primary"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "muted";

const INVENTORY_COLOR_VALUE: Record<InventorySemanticColor, string> = {
  primary: "var(--chart-1)",
  success: "var(--chart-2)",
  warning: "var(--chart-3)",
  danger: "var(--chart-4)",
  info: "var(--chart-5)",
  muted: "var(--muted-foreground)",
};

export function resolveInventoryColorValue(
  color: InventorySemanticColor | string,
) {
  return color in INVENTORY_COLOR_VALUE
    ? INVENTORY_COLOR_VALUE[color as InventorySemanticColor]
    : color;
}
