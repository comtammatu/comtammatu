import type { ReactNode } from "react";

export type SurfaceWidth = "narrow" | "default" | "wide" | "xwide" | "full";
export type SurfaceTone =
  | "primary"
  | "success"
  | "warning"
  | "info"
  | "secondary";

export type SurfacePlane =
  | "app"
  | "branch_operator"
  | "employee"
  | "station"
  | "public";

export type SheetSide = "top" | "right" | "bottom" | "left";

export interface SectionHeaderAction {
  label: string;
  href?: string;
  onClick?: () => void;
  icon?: ReactNode;
  variant?: "outline" | "ghost" | "secondary" | "default";
}
