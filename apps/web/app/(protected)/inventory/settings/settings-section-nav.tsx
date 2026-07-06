"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CheckCircle as IconCheckCircle,
  ChartBar as IconChartBar,
  FileText as IconFileText,
  Hourglass as IconHourglass,
  Package as IconPackage,
} from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { AppToolbar } from "@/components/surface";

const SETTINGS_SECTION_ICONS = {
  categories: IconFileText,
  units: IconPackage,
  expiry: IconHourglass,
  thresholds: IconChartBar,
  qc: IconCheckCircle,
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
  const pathname = usePathname();
  if (items.length <= 1) return null;

  return (
    <AppToolbar className="flex-wrap">
      {items.map((item) => {
        const Icon = SETTINGS_SECTION_ICONS[item.icon];
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Button
            key={item.href}
            asChild
            variant={active ? "secondary" : "ghost"}
            aria-current={active ? "page" : undefined}
          >
            <Link href={item.href}>
              <Icon />
              {item.label}
            </Link>
          </Button>
        );
      })}
    </AppToolbar>
  );
}
