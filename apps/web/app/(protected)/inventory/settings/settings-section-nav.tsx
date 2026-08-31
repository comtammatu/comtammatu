"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AlertTriangle as IconAlertTriangle,
  ChartBar as IconChartBar,
  FileText as IconFileText,
  Package as IconPackage,
} from "lucide-react";
import {
  OWNER_SHELL_BREAKPOINT,
  useIsMobile,
} from "@comtammatu/ui/hooks/use-mobile";
import { Tabs, TabsList, TabsTrigger } from "@comtammatu/ui/components/tabs";

const SETTINGS_SECTION_ICONS = {
  categories: IconFileText,
  units: IconPackage,
  thresholds: IconChartBar,
  waste: IconAlertTriangle,
} as const;

export type SettingsSectionNavIcon = keyof typeof SETTINGS_SECTION_ICONS;

export type SettingsSectionNavItem = {
  href: string;
  label: string;
  icon: SettingsSectionNavIcon;
};

export function SettingsSectionNav({
  items,
}: {
  items: readonly SettingsSectionNavItem[];
}) {
  const isTouchLayout = useIsMobile(OWNER_SHELL_BREAKPOINT);
  const pathname = usePathname();
  if (items.length <= 1) return null;

  const activeItem = items.find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
  const activeValue = activeItem?.href ?? items[0]?.href ?? "";

  return (
    <div className="w-full min-w-0 max-w-full overflow-x-auto no-scrollbar py-0.5 scroll-smooth">
      <Tabs value={activeValue} className="w-full">
        <TabsList
          size={isTouchLayout ? "touch" : "default"}
          className="flex w-max min-w-full sm:w-fit items-center justify-start flex-nowrap shrink-0"
        >
          {items.map((item) => {
            const Icon = SETTINGS_SECTION_ICONS[item.icon];
            return (
              <TabsTrigger
                key={item.href}
                value={item.href}
                render={<Link href={item.href} />}
                className="flex-none px-2.5"
              >
                <Icon className="size-4" />
                <span>{item.label}</span>
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>
    </div>
  );
}
