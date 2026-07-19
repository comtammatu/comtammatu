export type OwnerModuleId =
  | "owner"
  | "settings"
  | "hr"
  | "menu"
  | "orders"
  | "branches";

export const OWNER_MODULE_IDS = [
  "owner",
  "settings",
  "hr",
  "menu",
  "orders",
  "branches",
] as const satisfies readonly OwnerModuleId[];

export const FLAT_OWNER_MODULE_IDS = [
  "menu",
  "orders",
  "branches",
] as const satisfies readonly OwnerModuleId[];
