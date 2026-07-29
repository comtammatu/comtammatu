/**
 * Compatibility re-exports for control_surface module ids.
 * Prefer `control-surface-module` in new code.
 */
export {
  CONTROL_SURFACE_CORE_MODULE_IDS as OWNER_MODULE_IDS,
  CONTROL_SURFACE_MODULE_IDS,
  FLAT_CONTROL_SURFACE_MODULE_IDS as FLAT_OWNER_MODULE_IDS,
  type ControlSurfaceCoreModuleId as OwnerModuleId,
  type ControlSurfaceModuleId,
} from "./control-surface-module";
