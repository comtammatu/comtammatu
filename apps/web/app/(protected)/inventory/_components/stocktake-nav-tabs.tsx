"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ClipboardCheck as IconClipboardCheck,
  ClipboardList as IconClipboardList,
  Users as IconUsers,
} from "lucide-react";
import {
  OWNER_SHELL_BREAKPOINT,
  useIsMobile,
} from "@comtammatu/ui/hooks/use-mobile";
import { Tabs, TabsList, TabsTrigger } from "@comtammatu/ui/components/tabs";
import { withControlSurfaceBranchScope } from "@/lib/control-surface-scope";
import { INVENTORY_VI } from "@comtammatu/shared/messages";

interface StocktakeNavTabsProps {
  currentTab: "sessions" | "slips" | "assignments";
  branchId?: number | null;
}

export function StocktakeNavTabs({
  currentTab,
  branchId,
}: StocktakeNavTabsProps) {
  const isTouchLayout = useIsMobile(OWNER_SHELL_BREAKPOINT);
  const searchParams = useSearchParams();
  const requestedBranchId = Number(searchParams.get("branch"));
  const scopedBranchId =
    branchId ??
    (Number.isSafeInteger(requestedBranchId) && requestedBranchId > 0
      ? requestedBranchId
      : null);

  const buildHref = (basePath: string) => {
    if (scopedBranchId !== null) {
      return withControlSurfaceBranchScope(
        basePath,
        String(scopedBranchId) as `${number}`,
        { prefixes: ["/inventory"] },
      );
    }
    return basePath;
  };

  return (
    <div className="w-full min-w-0 max-w-full overflow-x-auto no-scrollbar py-0.5 scroll-smooth">
      <Tabs value={currentTab} className="w-full">
        <TabsList
          size={isTouchLayout ? "touch" : "default"}
          aria-label={INVENTORY_VI.stocktakeSessionTitle}
          className="flex w-max min-w-full sm:w-fit items-center justify-start flex-nowrap shrink-0"
        >
          <TabsTrigger
            value="sessions"
            render={<Link href={buildHref("/inventory/stocktake")} />}
            className="flex-none px-2.5"
          >
            <IconClipboardList className="size-4" />
            <span>{INVENTORY_VI.stocktakeSessionTitle}</span>
          </TabsTrigger>
          <TabsTrigger
            value="slips"
            render={<Link href={buildHref("/inventory/count-slips")} />}
            className="flex-none px-2.5"
          >
            <IconClipboardCheck className="size-4" />
            <span>{INVENTORY_VI.countSlipTitle}</span>
          </TabsTrigger>
          <TabsTrigger
            value="assignments"
            render={<Link href={buildHref("/inventory/count-assignments")} />}
            className="flex-none px-2.5"
          >
            <IconUsers className="size-4" />
            <span>{INVENTORY_VI.countAssignTitle}</span>
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  );
}
