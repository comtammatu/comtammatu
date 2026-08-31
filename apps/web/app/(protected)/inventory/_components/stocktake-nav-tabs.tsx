"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ClipboardCheck as IconClipboardCheck,
  ClipboardList as IconClipboardList,
  Users as IconUsers,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@comtammatu/ui/components/tabs";
import { withControlSurfaceBranchScope } from "@/lib/control-surface-scope";
import { INVENTORY_VI } from "@comtammatu/shared/messages";

interface StocktakeNavTabsProps {
  currentTab: "sessions" | "slips" | "assignments";
  branchId?: number | null;
}

export function StocktakeNavTabs({ currentTab, branchId }: StocktakeNavTabsProps) {
  const searchParams = useSearchParams();
  const branchParam = branchId != null ? String(branchId) : searchParams.get("branch");

  const buildHref = (basePath: string) => {
    if (branchParam) {
      return withControlSurfaceBranchScope(
        basePath,
        branchParam === "all" ? "all" : (Number(branchParam) as unknown as `${number}`),
        { prefixes: ["/inventory"] },
      );
    }
    return basePath;
  };

  return (
    <div className="border-b border-border pb-1">
      <Tabs value={currentTab} className="w-full">
        <TabsList variant="line" className="h-9 gap-4">
          <TabsTrigger
            value="sessions"
            render={<Link href={buildHref("/inventory/stocktake")} />}
            className="flex items-center gap-1.5 px-2 text-sm font-medium"
          >
            <IconClipboardList className="size-4" />
            <span>{INVENTORY_VI.stocktakeSessionTitle}</span>
          </TabsTrigger>
          <TabsTrigger
            value="slips"
            render={<Link href={buildHref("/inventory/count-slips")} />}
            className="flex items-center gap-1.5 px-2 text-sm font-medium"
          >
            <IconClipboardCheck className="size-4" />
            <span>{INVENTORY_VI.countSlipTitle}</span>
          </TabsTrigger>
          <TabsTrigger
            value="assignments"
            render={<Link href={buildHref("/inventory/count-assignments")} />}
            className="flex items-center gap-1.5 px-2 text-sm font-medium"
          >
            <IconUsers className="size-4" />
            <span>{INVENTORY_VI.countAssignTitle}</span>
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  );
}
