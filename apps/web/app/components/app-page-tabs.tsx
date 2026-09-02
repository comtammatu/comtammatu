"use client";

import type { ReactNode } from "react";
import { formatCount } from "@comtammatu/shared/format";
import { TabsList, TabsTrigger } from "@comtammatu/ui/components/tabs";
import { Badge } from "@comtammatu/ui/components/badge";
import { UrlTabs } from "@/_components/url-tabs";
import { APP_PAGE_STICKY_FILTER_CLASSNAME } from "@/components/surface";

import {
  OWNER_SHELL_BREAKPOINT,
  useIsMobile,
} from "@comtammatu/ui/hooks/use-mobile";

type AppPageTabItem = {
  value: string;
  label: ReactNode;
  count?: number;
  disabled?: boolean;
  badge?: ReactNode;
};

export type AppPageTabsProps = {
  items: AppPageTabItem[];
  defaultValue?: string;
  paramKey?: string;
  children?: ReactNode;
  className?: string;
  /** Accessible name for the tablist (WAI-ARIA tabs pattern). */
  ariaLabel?: string;
  /** Stick the tab list at the top of the Owner shell scrollport. */
  stickyList?: boolean;
  queryKeysByValue?: Readonly<Record<string, readonly string[]>>;
};

export function AppPageTabs({
  items,
  defaultValue,
  paramKey,
  children,
  className,
  ariaLabel,
  stickyList = false,
  queryKeysByValue,
}: AppPageTabsProps) {
  const isTouchLayout = useIsMobile(OWNER_SHELL_BREAKPOINT);

  const initial = items.some((item) => item.value === defaultValue)
    ? defaultValue
    : items[0]?.value;
  if (!initial) return null;
  const list = (
    <div
      data-slot="app-page-tabs-list"
      className="w-full min-w-0 max-w-full py-0.5"
    >
      <TabsList
        size={isTouchLayout ? "touch" : "default"}
        layout="scroll"
        aria-label={ariaLabel}
        className="lg:w-fit"
      >
        {items.map((item) => (
          <TabsTrigger
            key={item.value}
            value={item.value}
            disabled={item.disabled}
          >
            <span className="truncate">{item.label}</span>
            {typeof item.count === "number" ? (
              <Badge variant="outline" className="ml-1.5 shrink-0 font-mono">
                {formatCount(item.count)}
              </Badge>
            ) : null}
            {item.badge}
          </TabsTrigger>
        ))}
      </TabsList>
    </div>
  );
  return (
    <UrlTabs
      paramKey={paramKey}
      defaultValue={initial}
      validValues={items.map((item) => item.value)}
      queryKeysByValue={queryKeysByValue}
      className={className}
    >
      {stickyList ? (
        <div className={APP_PAGE_STICKY_FILTER_CLASSNAME}>{list}</div>
      ) : (
        list
      )}
      {children}
    </UrlTabs>
  );
}

export { TabsContent } from "@comtammatu/ui/components/tabs";
