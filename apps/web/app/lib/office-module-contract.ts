export type OfficeModuleId = "admin" | "hr" | "menu" | "orders" | "branches";

export const OFFICE_MODULE_IDS = [
  "admin",
  "hr",
  "menu",
  "orders",
  "branches",
] as const satisfies readonly OfficeModuleId[];

export const FLAT_OFFICE_MODULE_IDS = [
  "menu",
  "orders",
  "branches",
] as const satisfies readonly OfficeModuleId[];
