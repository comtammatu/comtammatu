export type InventorySemanticColor =
  | "primary"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "muted";

// Semantic tones bind to status tokens, not chart-N: the chart ramp is
// categorical and reorders its hues between light and night themes.
const INVENTORY_COLOR_VALUE: Record<InventorySemanticColor, string> = {
  primary: "var(--primary)",
  success: "var(--success)",
  warning: "var(--warning)",
  danger: "var(--destructive)",
  info: "var(--info)",
  muted: "var(--muted-foreground)",
};

export function resolveInventoryColorValue(
  color: InventorySemanticColor | string,
) {
  return color in INVENTORY_COLOR_VALUE
    ? INVENTORY_COLOR_VALUE[color as InventorySemanticColor]
    : color;
}
