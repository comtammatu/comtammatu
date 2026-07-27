"use client";

import {
  AppListFrame,
  type AppListFrameProps,
} from "@/components/surface";

/** Desktop LIST filter Select: fixed width, aligns with InputGroup size=field. */
export const inventoryListFilterSelectClassName = "w-44 shrink-0";

/** Wider LIST filter when option labels include counts. */
export const inventoryListFilterSelectWideClassName = "w-56 shrink-0";

export type InventoryListFrameProps = AppListFrameProps;

/** Inventory domain alias for the shared Owner LIST frame. */
export function InventoryListFrame({
  children,
  ...props
}: InventoryListFrameProps) {
  return <AppListFrame {...props}>{children}</AppListFrame>;
}
