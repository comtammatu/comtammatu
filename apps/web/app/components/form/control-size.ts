"use client";

import { useIsMobile } from "@comtammatu/ui/hooks/use-mobile";

export type FormControlSize = "responsive" | "field" | "touch";

export function useFormControlSize(
  controlSize: FormControlSize = "responsive",
): Exclude<FormControlSize, "responsive"> {
  const isTouchLayout = useIsMobile(1024);

  return controlSize === "responsive"
    ? isTouchLayout
      ? "touch"
      : "field"
    : controlSize;
}
