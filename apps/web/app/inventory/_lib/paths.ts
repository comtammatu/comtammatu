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
  expiry: string;
  reports: string;
  production: string;
  issues: string;
  suppliers: string;
  recipes: string;
  settings: string;
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
    expiry: joinInventoryPath(base, "/expiry"),
    reports: joinInventoryPath(base, "/reports"),
    production: joinInventoryPath(base, "/production"),
    issues: joinInventoryPath(base, "/issues"),
    suppliers: joinInventoryPath(base, "/suppliers"),
    recipes: joinInventoryPath(base, "/recipes"),
    settings: joinInventoryPath(base, "/settings"),
  };
}
