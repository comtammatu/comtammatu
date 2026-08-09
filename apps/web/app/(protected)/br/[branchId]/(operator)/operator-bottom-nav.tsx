"use client";

import {
  CalendarDays,
  ChefHat,
  Clock,
  Home,
  MoreHorizontal,
  Package,
  Send,
  Truck,
  User,
  Users,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { APP_COPY_VI } from "@comtammatu/shared/labels";
import type { BranchKind } from "@comtammatu/shared/auth";
import { AppBottomNav } from "@/components/app-bottom-nav";
import { isNavItemActive, type ShellNavItem } from "@/lib/shell-primitives";
import { messages } from "@lib/messages";
import type { BranchNavBadgeCounts } from "./_lib/branch-nav-badges";

const branchCopy = messages.settings.branch;
const employeeNavCopy = messages.employee.nav;

/**
 * R04 residual pad when central deep-links into `/br/{site}/stock/*`.
 * Home escapes to L0 `/inventory` — not a second daily hub on `/br`.
 */
function centralResidualNavItems(
  branchId: number,
  branchKind: BranchKind,
): ShellNavItem[] {
  const base = `/br/${branchId}`;
  const inventoryHome = {
    href: "/inventory",
    label: APP_COPY_VI.inventory,
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
      inventoryHome,
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
    inventoryHome,
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

export function OperatorBottomNav({
  branchId,
  showEmployeeLinks,
  showBranchManagement,
  branchKind = "branch",
  badges,
}: {
  branchId: number;
  showEmployeeLinks: boolean;
  showBranchManagement: boolean;
  branchKind?: BranchKind;
  badges?: BranchNavBadgeCounts;
}) {
  const pathname = usePathname();

  const items: ShellNavItem[] =
    branchKind !== "branch"
      ? centralResidualNavItems(branchId, branchKind)
      : [
          {
            href: `/br/${branchId}`,
            label: APP_COPY_VI.branchHome,
            icon: Home,
            exact: true,
            badgeCount: badges?.home,
          },
          ...(showEmployeeLinks
            ? [
                {
                  href: `/br/${branchId}/shift`,
                  label: APP_COPY_VI.operatorShift,
                  icon: Clock,
                  exact: true,
                  // Managers keep schedule under Ca; employees have a Lịch tab.
                  matchPrefixes: showBranchManagement
                    ? [
                        `/br/${branchId}/shift/clock`,
                        `/br/${branchId}/shift/schedule`,
                      ]
                    : [`/br/${branchId}/shift/clock`],
                },
                ...(!showBranchManagement
                  ? [
                      {
                        href: `/br/${branchId}/shift/schedule`,
                        label: employeeNavCopy.schedule,
                        icon: CalendarDays,
                        exact: false,
                      },
                    ]
                  : []),
              ]
            : []),
          ...(showBranchManagement
            ? [
                {
                  href: `/br/${branchId}/team`,
                  label: branchCopy.branchNavTeam,
                  icon: Users,
                  exact: false,
                  badgeCount: badges?.team,
                  matchPrefixes: [
                    `/br/${branchId}/team`,
                    `/br/${branchId}/shift/roster`,
                    `/br/${branchId}/shift/attendance`,
                    `/br/${branchId}/shift/checkout-approvals`,
                    `/br/${branchId}/shift/leave-approvals`,
                  ],
                },
                {
                  // Work-first stock landing (phiếu + tiles), not bare on-hand.
                  href: `/br/${branchId}/stock`,
                  label: branchCopy.branchNavStock,
                  icon: Package,
                  exact: true,
                  badgeCount: badges?.stock,
                  matchPrefixes: [`/br/${branchId}/stock`],
                },
              ]
            : showEmployeeLinks
              ? [
                  {
                    href: `/br/${branchId}/profile`,
                    label: employeeNavCopy.profileShort,
                    icon: User,
                    exact: false,
                  },
                ]
              : []),
        ];

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
