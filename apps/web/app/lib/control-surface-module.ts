/**
 * control_surface module keys for L0 Quản trị chrome (nav-as-data).
 */
export type ControlSurfaceCoreModuleId =
  | "owner"
  | "settings"
  | "hr"
  | "menu"
  | "orders"
  | "feedback"
  | "work"
  | "branches";

export type ControlSurfaceModuleId =
  | ControlSurfaceCoreModuleId
  | "inventory"
  | "finance";

export const CONTROL_SURFACE_CORE_MODULE_IDS = [
  "owner",
  "settings",
  "hr",
  "menu",
  "orders",
  "feedback",
  "work",
  "branches",
] as const satisfies readonly ControlSurfaceCoreModuleId[];

export const CONTROL_SURFACE_MODULE_IDS = [
  ...CONTROL_SURFACE_CORE_MODULE_IDS,
  "inventory",
  "finance",
] as const satisfies readonly ControlSurfaceModuleId[];

export const FLAT_CONTROL_SURFACE_MODULE_IDS = [
  "menu",
  "orders",
  "feedback",
  "branches",
] as const satisfies readonly ControlSurfaceCoreModuleId[];
