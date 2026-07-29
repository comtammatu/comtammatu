export type InventoryRouteBase = "/inventory";

export type InventoryPaths = {
  home: InventoryRouteBase;
  stock: string;
  grn: string;
  stockRequests: string;
  purchaseRequests: string;
  purchaseOrders: string;
  /** Canonical Finance AP home (supplier invoices live under Finance). */
  supplierInvoices: string;
  transfers: string;
  transferDetail: (id: number) => string;
  stocktake: string;
  stocktakeDetail: (id: number) => string;
  countAssignments: string;
  countSlips: string;
  reports: string;
  production: string;
  consumption: string;
  /** Prefer `consumption`; `/inventory/issues` redirects there. */
  issues: string;
  suppliers: string;
  ingredients: string;
  menuRecipes: string;
  settings: string;
  units: string;
};

function joinInventoryPath(base: InventoryRouteBase, segment: string): string {
  return `${base}${segment.startsWith("/") ? segment : `/${segment}`}`;
}

export function getInventoryPaths(base: InventoryRouteBase): InventoryPaths {
  return {
    home: base,
    stock: joinInventoryPath(base, "/stock"),
    grn: joinInventoryPath(base, "/grn"),
    stockRequests: joinInventoryPath(base, "/stock-requests"),
    purchaseRequests: joinInventoryPath(base, "/purchase-requests"),
    purchaseOrders: joinInventoryPath(base, "/purchase-orders"),
    supplierInvoices: "/finance/supplier-invoices",
    transfers: joinInventoryPath(base, "/transfers"),
    transferDetail: (id: number) => joinInventoryPath(base, `/transfers/${id}`),
    stocktake: joinInventoryPath(base, "/stocktake"),
    stocktakeDetail: (id: number) =>
      joinInventoryPath(base, `/stocktake/${id}`),
    countAssignments: joinInventoryPath(base, "/count-assignments"),
    countSlips: joinInventoryPath(base, "/count-slips"),
    reports: joinInventoryPath(base, "/reports"),
    production: joinInventoryPath(base, "/production"),
    consumption: joinInventoryPath(base, "/consumption"),
    issues: joinInventoryPath(base, "/issues"),
    suppliers: joinInventoryPath(base, "/suppliers"),
    ingredients: joinInventoryPath(base, "/ingredients"),
    menuRecipes: joinInventoryPath(base, "/menu-recipes"),
    settings: joinInventoryPath(base, "/settings"),
    units: joinInventoryPath(base, "/settings/units"),
  };
}
