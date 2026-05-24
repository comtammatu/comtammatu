"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** Two KDS modes:
 *  - `focus` (mặc định): đang làm — 1 đơn duy nhất full màn hình, auto-advance khi xong.
 *  - `comprehensive`: tổng quan — grid nhiều đơn, scan-by-glance.
 */
export type KdsViewMode = "comprehensive" | "focus";

function parseViewMode(v: string | null): KdsViewMode {
  return v === "comprehensive" ? "comprehensive" : "focus";
}

export interface KdsViewModeState {
  mode: KdsViewMode;
  setMode: (next: KdsViewMode) => void;
}

export function useKdsViewMode(): KdsViewModeState {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const mode = useMemo(
    () => parseViewMode(searchParams.get("view")),
    [searchParams],
  );

  const setMode = useCallback(
    (next: KdsViewMode) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === "focus") params.delete("view");
      else params.set("view", next);
      const q = params.toString();
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  return { mode, setMode };
}
