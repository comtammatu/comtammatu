/**
 * Inventory routes that require a concrete site in `?branch=` — aggregate
 * `all` is ignored (redirect) or yields empty/notFound data.
 */
const SITE_SCOPED_INVENTORY_PREFIXES = [
  "/inventory/stock",
  "/inventory/count-assignments",
  "/inventory/count-slips",
  "/inventory/menu-recipes",
  "/inventory/stock-requests/new",
] as const;

export function inventoryPathRequiresSiteScope(pathname: string): boolean {
  return SITE_SCOPED_INVENTORY_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function inventoryPathSupportsAggregateScope(pathname: string): boolean {
  return !inventoryPathRequiresSiteScope(pathname);
}
