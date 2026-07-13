export type AdminDashboardModuleId = "admin" | "hr" | "menu" | "orders" | "branches";

export const ADMIN_DASHBOARD_MODULE_IDS = [
  "admin",
  "hr",
  "menu",
  "orders",
  "branches",
] as const satisfies readonly AdminDashboardModuleId[];

export const FLAT_ADMIN_DASHBOARD_MODULE_IDS = [
  "menu",
  "orders",
  "branches",
] as const satisfies readonly AdminDashboardModuleId[];
