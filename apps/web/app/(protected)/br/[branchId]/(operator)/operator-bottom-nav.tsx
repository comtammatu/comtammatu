"use client";

import {
  CalendarDays,
  ChefHat,
  ClipboardCheck,
  Clock,
  Ellipsis,
  Home,
  Package,
  Settings,
  Truck,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { APP_COPY_VI } from "@comtammatu/shared/labels";
import type { BranchKind } from "@comtammatu/shared/auth";
import { AppBottomNav } from "@/components/app-bottom-nav";
import { isNavItemActive, type ShellNavItem } from "@/lib/shell-primitives";
import { messages } from "@lib/messages";

const branchCopy = messages.settings.branch;

// Curated central-site tabs (design contract screens 1+4): the site's core
// jobs get first-class tabs; everything else lives on /more.
function centralNavItems(
  branchId: number,
  branchKind: BranchKind,
): ShellNavItem[] {
  const base = `/br/${branchId}`;
  const home = {
    href: base,
    label: APP_COPY_VI.operatorHome,
    icon: Home,
    exact: true,
  };
  const stock = {
    href: `${base}/stock`,
    label: branchCopy.centralNavStock,
    icon: Package,
    exact: true,
    matchPrefixes: [`${base}/stock/on-hand`],
  };
  const stocktake = {
    href: `${base}/stock/stocktake`,
    label: branchCopy.centralNavStocktake,
    icon: ClipboardCheck,
    exact: false,
    matchPrefixes: [`${base}/stock/count-slips`, `${base}/stock/count`],
  };
  // Overflow routes reachable only via /more light the More tab so the
  // bottom nav never loses its active indicator (review PR #249).
  const moreOverflow = [
    `${base}/stock/waste`,
    `${base}/stock/supplier-returns`,
    `${base}/stock/transfer`,
    `${base}/shift`,
    `${base}/team`,
    `${base}/pos-sessions`,
    `${base}/settings`,
    `${base}/profile`,
  ];
  if (branchKind === "central_supply") {
    return [
      home,
      {
        href: `${base}/stock/grn`,
        label: branchCopy.centralNavReceive,
        icon: Truck,
        exact: false,
        matchPrefixes: [`${base}/stock/purchase-orders`],
      },
      stock,
      stocktake,
      {
        href: `${base}/more`,
        label: branchCopy.centralNavMore,
        icon: Ellipsis,
        exact: false,
        matchPrefixes: moreOverflow,
      },
    ];
  }
  return [
    home,
    {
      href: `${base}/stock/production`,
      label: branchCopy.centralNavProduction,
      icon: ChefHat,
      exact: false,
    },
    stock,
    {
      href: `${base}/stock/receive`,
      label: branchCopy.centralNavReceive,
      icon: Truck,
      exact: false,
      matchPrefixes: [`${base}/stock/grn`],
    },
    {
      href: `${base}/more`,
      label: branchCopy.centralNavMore,
      icon: Ellipsis,
      exact: false,
      matchPrefixes: [
        ...moreOverflow,
        `${base}/stock/purchase-orders`,
        `${base}/stock/stocktake`,
        `${base}/stock/count-slips`,
      ],
    },
  ];
}

export function OperatorBottomNav({
  branchId,
  showEmployeeLinks,
  showBranchManagement,
  branchKind = "branch",
}: {
  branchId: number;
  showEmployeeLinks: boolean;
  showBranchManagement: boolean;
  branchKind?: BranchKind;
}) {
  const pathname = usePathname();
  const branchOverflowPrefixes = [
    `/br/${branchId}/more`,
    `/br/${branchId}/stock`,
    `/br/${branchId}/orders`,
  ];
  const items: ShellNavItem[] =
    branchKind !== "branch"
      ? centralNavItems(branchId, branchKind)
      : [
          {
            href: `/br/${branchId}`,
            label: APP_COPY_VI.operatorHome,
            icon: Home,
            exact: true,
          },
          ...(showEmployeeLinks
            ? [
                {
                  href: `/br/${branchId}/shift`,
                  label: APP_COPY_VI.operatorShift,
                  icon: Clock,
                  exact: true,
                  matchPrefixes: [
                    `/br/${branchId}/shift/clock`,
                    `/br/${branchId}/shift/checkout-approvals`,
                  ],
                },
                {
                  href: `/br/${branchId}/shift/schedule`,
                  label: messages.employee.nav.schedule,
                  icon: CalendarDays,
                  exact: false,
                },
              ]
            : []),
          ...(showBranchManagement
            ? [
                {
                  href: `/br/${branchId}/dashboard`,
                  label: APP_COPY_VI.operatorManagement,
                  icon: Settings,
                  exact: true,
                  matchPrefixes: [
                    `/br/${branchId}/dashboard`,
                    `/br/${branchId}/pos-sessions`,
                    `/br/${branchId}/settings`,
                    `/br/${branchId}/team`,
                  ],
                },
              ]
            : []),
          {
            href: `/br/${branchId}/more`,
            label: branchCopy.centralNavMore,
            icon: Ellipsis,
            exact: true,
            matchPrefixes: branchOverflowPrefixes,
          },
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
      }))}
    />
  );
}
