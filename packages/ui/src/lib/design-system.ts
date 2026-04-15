import { cn } from "./utils";

export type UiSurface =
  | "admin"
  | "inventory"
  | "pos"
  | "kds"
  | "employee"
  | "auth";

export type UiDensity = "comfortable" | "compact" | "touch";

export type UiTone = "neutral" | "success" | "warning" | "danger" | "info";

const SURFACE_PANEL_VARIANT: Record<UiSurface, string> = {
  admin: "ui-surface-panel-admin",
  inventory: "ui-surface-panel-inventory",
  pos: "ui-surface-panel-touch",
  kds: "ui-surface-panel-dark",
  employee: "ui-surface-panel-employee",
  auth: "ui-surface-panel-strong",
};

const SHELL_VARIANT: Record<UiSurface, string> = {
  admin: "surface-admin",
  inventory: "surface-inventory",
  pos: "surface-pos",
  kds: "surface-kds",
  employee: "surface-employee",
  auth: "surface-auth",
};

const SIDEBAR_VARIANT: Record<UiSurface, string> = {
  admin: "ui-shell-sidebar-admin",
  inventory: "ui-shell-sidebar-inventory",
  pos: "ui-shell-sidebar-touch",
  kds: "ui-shell-sidebar-dark",
  employee: "",
  auth: "",
};

const HEADER_VARIANT: Record<UiSurface, string> = {
  admin: "ui-shell-header-admin",
  inventory: "ui-shell-header-inventory",
  pos: "ui-shell-header-touch",
  kds: "ui-shell-header-dark",
  employee: "ui-shell-header-compact",
  auth: "",
};

const DENSITY_STACK_CLASSNAME: Record<UiDensity, string> = {
  compact: "space-y-4 md:space-y-6",
  comfortable: "space-y-5 md:space-y-7",
  touch: "space-y-6 md:space-y-8",
};

const TONE_BADGE_CLASSNAME: Record<UiTone, string> = {
  neutral: "bg-muted text-muted-foreground border-border/70",
  success: "bg-success/15 text-success border-success/30",
  warning: "bg-warning/15 text-warning border-warning/30",
  danger: "bg-destructive/15 text-destructive border-destructive/30",
  info: "bg-info/15 text-info border-info/30",
};

export function getSurfaceShellClassName(
  surface: UiSurface,
  className?: string,
) {
  return cn("app-shell ui-shell", SHELL_VARIANT[surface], className);
}

export function getSurfaceSidebarClassName(
  surface: UiSurface,
  className?: string,
) {
  return cn("ui-shell-sidebar", SIDEBAR_VARIANT[surface], className);
}

export function getSurfaceHeaderClassName(
  surface: UiSurface,
  className?: string,
) {
  return cn("ui-shell-header", HEADER_VARIANT[surface], className);
}

export function getSurfacePanelClassName(
  surface: UiSurface,
  className?: string,
) {
  return cn("ui-surface-panel", SURFACE_PANEL_VARIANT[surface], className);
}

export function getSurfaceStackClassName(
  density: UiDensity,
  className?: string,
) {
  return cn(DENSITY_STACK_CLASSNAME[density], className);
}

export function getToneBadgeClassName(tone: UiTone, className?: string) {
  return cn("ui-status-badge", TONE_BADGE_CLASSNAME[tone], className);
}
