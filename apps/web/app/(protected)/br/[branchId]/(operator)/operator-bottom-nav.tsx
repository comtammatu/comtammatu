"use client";

import {
  ChefHat,
  ClipboardCheck,
  Clock,
  Home,
  Package,
  Truck,
  Users,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { APP_COPY_VI } from "@comtammatu/shared/labels";
import type { BranchKind } from "@comtammatu/shared/auth";
import { AppBottomNav } from "@/components/app-bottom-nav";
import { isNavItemActive, type ShellNavItem } from "@/lib/shell-primitives";
import { messages } from "@lib/messages";

const branchCopy = messages.settings.branch;

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
                  exact: false,
                  matchPrefixes: [
                    `/br/${branchId}/shift/clock`,
                    `/br/${branchId}/shift/checkout-approvals`,
                  ],
                },
              ]
            : []),
          ...(showBranchManagement
            ? [
                {
                  href: `/br/${branchId}/team`,
                  label: "Đội",
                  icon: Users,
                  exact: false,
                  matchPrefixes: [`/br/${branchId}/team`],
                },
                {
                  href: `/br/${branchId}/stock`,
                  label: branchCopy.centralNavStock,
                  icon: Package,
                  exact: false,
                  matchPrefixes: [`/br/${branchId}/stock`],
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
      }))}
    />
  );
}
