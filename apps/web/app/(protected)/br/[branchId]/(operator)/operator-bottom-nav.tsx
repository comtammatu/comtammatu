"use client";

import {
  CalendarDays,
  ChefHat,
  Clock,
  Home,
  LayoutGrid,
  MoreHorizontal,
  Package,
  Send,
  Truck,
  User,
  Users,
  type LucideIcon,
} from "lucide-react";
import { usePathname } from "next/navigation";
import type {
  BranchKind,
  ResolvedBranchPrimaryTab,
} from "@comtammatu/shared/auth";
import { APP_COPY_VI } from "@comtammatu/shared/labels";
import { AppBottomNav } from "@/components/app-bottom-nav";
import { isNavItemActive, type ShellNavItem } from "@/lib/shell-primitives";
import { messages } from "@lib/messages";
import type { BranchNavBadgeCounts } from "./_lib/branch-nav-badges";

const branchCopy = messages.settings.branch;

const TAB_ICONS: Record<string, LucideIcon> = {
  Home,
  Clock,
  CalendarDays,
  User,
  Users,
  Package,
  LayoutGrid,
};

/**
 * R04 residual pad when central deep-links into `/br/{site}/stock/*`.
 * Home escapes to Control home `/` — not a second daily hub on `/br`.
 */
function centralResidualNavItems(
  branchId: number,
  branchKind: BranchKind,
): ShellNavItem[] {
  const base = `/br/${branchId}`;
  const controlHome = {
    href: "/",
    label: APP_COPY_VI.ownerTitle,
    icon: Home,
    exact: true,
  };
  const receive = {
    href: `${base}/stock/grn`,
    label:
      branchKind === "central_kitchen"
        ? branchCopy.centralKitchenNavReceive
        : branchCopy.centralNavReceive,
    icon: Truck,
    exact: false,
  };
  const fulfill = {
    href: `${base}/stock/transfer`,
    label: branchCopy.centralKitchenNavDispatch,
    icon: Send,
    exact: false,
    matchPrefixes: [`${base}/stock/requests`, `${base}/stock/receive`],
  };
  const morePrefixes = [
    `${base}/stock/stocktake`,
    `${base}/stock/waste`,
    `${base}/stock/consumption`,
    `${base}/stock/catalog`,
    `${base}/stock/purchase-requests`,
    `${base}/stock/count`,
    `${base}/stock/issues`,
  ];
  // Kho Tổng keeps Tồn on its own tab — do not dual-highlight Thêm on /on-hand.
  if (branchKind === "central_kitchen") {
    morePrefixes.unshift(`${base}/stock/on-hand`);
  }
  const more = {
    href: `${base}/stock`,
    label: branchCopy.centralNavMore,
    icon: MoreHorizontal,
    exact: true,
    matchPrefixes: morePrefixes,
  };

  if (branchKind === "central_supply") {
    return [
      controlHome,
      receive,
      {
        href: `${base}/stock/on-hand`,
        label: branchCopy.centralNavStock,
        icon: Package,
        exact: false,
      },
      fulfill,
      more,
    ];
  }

  return [
    controlHome,
    receive,
    {
      href: "/inventory/production",
      label: branchCopy.centralNavProduction,
      icon: ChefHat,
      exact: false,
    },
    fulfill,
    more,
  ];
}

function pendingBadgeLabel(count: number | undefined): string | undefined {
  if (count == null || count <= 0) return undefined;
  return messages.operator.nav.pendingBadge(count);
}

function projectPrimaryTabs(
  tabs: readonly ResolvedBranchPrimaryTab[],
  badges?: BranchNavBadgeCounts,
): ShellNavItem[] {
  return tabs.map((tab) => ({
    href: tab.href,
    label: tab.label,
    icon: TAB_ICONS[tab.icon] ?? LayoutGrid,
    exact: tab.exact,
    matchPrefixes: tab.matchPrefixes,
    badgeCount:
      tab.badge === "home"
        ? badges?.home
        : tab.badge === "team"
          ? badges?.team
          : tab.badge === "stock"
            ? badges?.stock
            : undefined,
  }));
}

export function OperatorBottomNav({
  branchId,
  tabs,
  branchKind = "branch",
  badges,
}: {
  branchId: number;
  tabs: readonly ResolvedBranchPrimaryTab[];
  branchKind?: BranchKind;
  badges?: BranchNavBadgeCounts;
}) {
  const pathname = usePathname();

  const items: ShellNavItem[] =
    branchKind !== "branch"
      ? centralResidualNavItems(branchId, branchKind)
      : projectPrimaryTabs(tabs, badges);

  return (
    <AppBottomNav
      ariaLabel={APP_COPY_VI.operatorAriaLabel}
      hideOnDesktop={false}
      position="static"
      items={items.map((item) => ({
        href: item.href,
        label: item.label,
        icon: item.icon,
        active: isNavItemActive(item, pathname),
        badgeCount: item.badgeCount,
        badgeLabel: pendingBadgeLabel(item.badgeCount),
      }))}
    />
  );
}
