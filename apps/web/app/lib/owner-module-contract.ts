export type OwnerModuleId =
  | "owner"
  | "settings"
  | "hr"
  | "menu"
  | "orders"
  | "feedback"
  | "branches";

export const OWNER_MODULE_IDS = [
  "owner",
  "settings",
  "hr",
  "menu",
  "orders",
  "feedback",
  "branches",
] as const satisfies readonly OwnerModuleId[];

export const FLAT_OWNER_MODULE_IDS = [
  "menu",
  "orders",
  "feedback",
  "branches",
] as const satisfies readonly OwnerModuleId[];
