"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { readDevicePref, writeDevicePref } from "@lib/device-prefs";

/** Two KDS modes:
 *  - `focus` (default): cooking — a single full-screen ticket, auto-advancing when done.
 *  - `comprehensive`: overview — a multi-ticket grid, scan-by-glance.
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
  // Keyed by pathname (= branch-scoped KDS route) so each kitchen tablet
  // remembers its own mode per branch.
  const prefKey = `kds:view:${pathname}`;

  const mode = useMemo(
    () => parseViewMode(searchParams.get("view")),
    [searchParams],
  );

  // URL stays the SSOT; the device pref only seeds it once when the PWA
  // relaunches at the bare start_url (manifests carry no query, so the
  // chosen mode used to reset to focus on every standalone launch).
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    if (searchParams.get("view") !== null) return;
    if (readDevicePref(prefKey) !== "comprehensive") return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", "comprehensive");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [pathname, prefKey, router, searchParams]);

  const setMode = useCallback(
    (next: KdsViewMode) => {
      writeDevicePref(prefKey, next);
      const params = new URLSearchParams(searchParams.toString());
      if (next === "focus") params.delete("view");
      else params.set("view", next);
      const q = params.toString();
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    },
    [pathname, prefKey, router, searchParams],
  );

  return { mode, setMode };
}
