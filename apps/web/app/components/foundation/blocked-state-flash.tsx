"use client";

import { useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  SearchParamBlockedStateFlash as ShadcnSearchParamBlockedStateFlash,
} from "@comtammatu/ui/components/blocked-state-flash";
import {
  readBlockedStateFromSearchParams,
} from "@comtammatu/shared/auth";

export function SearchParamBlockedStateFlash({
  mode = "inline",
  autoClear = false,
  className,
}: {
  mode?: "inline" | "toast" | "toast-inline";
  autoClear?: boolean;
  className?: string;
}) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const blockedState = readBlockedStateFromSearchParams(searchParams);
  const blockedStateKey = useMemo(() => {
    return searchParams.get("forbidden") === "1"
      ? `${pathname}:${searchParams.get("reason") ?? "generic"}`
      : null;
  }, [searchParams, pathname]);

  return (
    <ShadcnSearchParamBlockedStateFlash
      mode={mode}
      autoClear={autoClear}
      className={className}
      blockedState={blockedState}
      blockedStateKey={blockedStateKey}
      onAutoClear={() => {
        const params = new URLSearchParams(searchParams.toString());
        params.delete("forbidden");
        params.delete("reason");
        const queryString = params.toString();
        router.replace(pathname + (queryString ? `?${queryString}` : ""), {
          scroll: false,
        });
      }}
    />
  );
}
