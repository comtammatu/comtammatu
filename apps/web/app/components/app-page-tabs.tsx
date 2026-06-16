"use client";

import type { ReactNode } from "react";
import { TabsList, TabsTrigger } from "@comtammatu/ui/components/tabs";
import { Badge } from "@comtammatu/ui/components/badge";
import { UrlTabs } from "@/_components/url-tabs";

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
};

export function AppPageTabs({
  items,
  defaultValue,
  paramKey,
  children,
  className,
}: AppPageTabsProps) {
  const initial = defaultValue ?? items[0]?.value;
  if (!initial) return null;
  return (
    <UrlTabs paramKey={paramKey} defaultValue={initial} className={className}>
      <TabsList>
        {items.map((item) => (
          <TabsTrigger
            key={item.value}
            value={item.value}
            disabled={item.disabled}
          >
            <span>{item.label}</span>
            {typeof item.count === "number" ? (
              <Badge variant="secondary" className="ml-1.5 font-mono">
                {item.count}
              </Badge>
            ) : null}
            {item.badge}
          </TabsTrigger>
        ))}
      </TabsList>
      {children}
    </UrlTabs>
  );
}

export { TabsContent } from "@comtammatu/ui/components/tabs";
