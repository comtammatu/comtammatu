"use client";

import { useCallback } from "react";
import { usePathname, useSearchParams } from "next/navigation";

type UrlStateChanges = Record<string, string | null | undefined>;

export function useOperatorUrlState() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const replaceParams = useCallback(
    (changes: UrlStateChanges) => {
      const params = new URLSearchParams(window.location.search);
      for (const [key, value] of Object.entries(changes)) {
        if (!value) params.delete(key);
        else params.set(key, value);
      }

      const query = params.toString();
      window.history.replaceState(
        window.history.state,
        "",
        query ? `${pathname}?${query}` : pathname,
      );
    },
    [pathname],
  );

  return { replaceParams, searchParams };
}
