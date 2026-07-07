"use client";

import { useCallback, startTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Tabs } from "@comtammatu/ui/components/tabs";

type TabsProps = React.ComponentProps<typeof Tabs>;

interface UrlTabsProps extends Omit<TabsProps, "value" | "onValueChange"> {
  paramKey?: string;
  defaultValue: string;
}

/**
 * Tabs whose active value is stored in the URL (`?tab=`).
 * Uses `router.replace` so reloads and back-navigation restore the tab
 * without accumulating history entries.
 */
export function UrlTabs({
  paramKey = "tab",
  defaultValue,
  children,
  ...props
}: UrlTabsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const value = searchParams.get(paramKey) ?? defaultValue;

  const onValueChange = useCallback(
    (next: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === defaultValue) params.delete(paramKey);
      else params.set(paramKey, next);
      const q = params.toString();
      startTransition(() => {
        router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
      });
    },
    [pathname, router, searchParams, paramKey, defaultValue],
  );

  return (
    <Tabs value={value} onValueChange={onValueChange} {...props}>
      {children}
    </Tabs>
  );
}
