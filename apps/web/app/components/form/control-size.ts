"use client";

import {
  OWNER_SHELL_BREAKPOINT,
  useIsMobile,
} from "@comtammatu/ui/hooks/use-mobile";

export type FormControlSize = "responsive" | "field" | "touch";

export function useFormControlSize(
  controlSize: FormControlSize = "responsive",
): Exclude<FormControlSize, "responsive"> {
  const isTouchLayout = useIsMobile(OWNER_SHELL_BREAKPOINT);

  return controlSize === "responsive"
    ? isTouchLayout
      ? "touch"
      : "field"
    : controlSize;
}
