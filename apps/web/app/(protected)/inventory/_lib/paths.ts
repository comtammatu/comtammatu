export type InventoryRouteBase = "/inventory";

export type InventoryPaths = {
  home: InventoryRouteBase;
  stock: string;
  receiving: string;
  purchaseOrders: string;
  grn: string;
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
  issues: string;
  suppliers: string;
  ingredients: string;
  recipes: string;
  settings: string;
  units: string;
  expiry: string;
};

function joinInventoryPath(base: InventoryRouteBase, segment: string): string {
  return `${base}${segment.startsWith("/") ? segment : `/${segment}`}`;
}

export function getInventoryPaths(base: InventoryRouteBase): InventoryPaths {
  return {
    home: base,
    stock: joinInventoryPath(base, "/stock"),
    receiving: joinInventoryPath(base, "/receiving"),
    purchaseOrders: joinInventoryPath(base, "/purchase-orders"),
    grn: joinInventoryPath(base, "/grn"),
    supplierInvoices: joinInventoryPath(base, "/supplier-invoices"),
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
    recipes: joinInventoryPath(base, "/recipes"),
    settings: joinInventoryPath(base, "/settings"),
    units: joinInventoryPath(base, "/settings/units"),
    expiry: joinInventoryPath(base, "/expiry"),
  };
}
