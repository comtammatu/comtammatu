"use client";

import { useCallback, startTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Tabs } from "@comtammatu/ui/components/tabs";

type TabsProps = React.ComponentProps<typeof Tabs>;

interface UrlTabsProps extends Omit<TabsProps, "value" | "onValueChange"> {
  paramKey?: string;
  defaultValue: string;
  validValues: readonly string[];
  queryKeysByValue?: Readonly<Record<string, readonly string[]>>;
}

/**
 * Tabs whose active value is stored in the URL (`?tab=`).
 * Uses `router.replace` so reloads and back-navigation restore the tab
 * without accumulating history entries.
 */
export function UrlTabs({
  paramKey = "tab",
  defaultValue,
  validValues,
  queryKeysByValue,
  children,
  ...props
}: UrlTabsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const requestedValue = searchParams.get(paramKey);
  const value =
    requestedValue && validValues.includes(requestedValue)
      ? requestedValue
      : defaultValue;

  const onValueChange = useCallback(
    (next: string) => {
      // Prefer the live browser URL so History-API overlay keys (dialog ids,
      // client filters) are not clobbered by a stale useSearchParams snapshot.
      const params = new URLSearchParams(
        typeof window !== "undefined"
          ? window.location.search
          : searchParams.toString(),
      );
      if (next === defaultValue) params.delete(paramKey);
      else params.set(paramKey, next);
      const ownedKeys = queryKeysByValue?.[next];
      if (ownedKeys) {
        const allowed = new Set([paramKey, ...ownedKeys]);
        for (const key of [...params.keys()]) {
          if (!allowed.has(key)) params.delete(key);
        }
      }
      const q = params.toString();
      startTransition(() => {
        router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
      });
    },
    [
      pathname,
      router,
      searchParams,
      paramKey,
      defaultValue,
      queryKeysByValue,
    ],
  );

  return (
    <Tabs value={value} onValueChange={onValueChange} {...props}>
      {children}
    </Tabs>
  );
}
