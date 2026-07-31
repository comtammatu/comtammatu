"use client";

import {
  ChefHat,
  Clock,
  Home,
  MessageSquareHeart,
  MoreHorizontal,
  Package,
  Send,
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
    label:
      branchKind === "central_kitchen"
        ? branchCopy.centralKitchenNavHome
        : APP_COPY_VI.branchHome,
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
  const more = {
    href: `${base}/stock`,
    label: branchCopy.centralNavMore,
    icon: MoreHorizontal,
    exact: true,
    matchPrefixes: [
      `${base}/stock/on-hand`,
      `${base}/stock/stocktake`,
      `${base}/stock/waste`,
      `${base}/stock/consumption`,
      `${base}/stock/catalog`,
      `${base}/stock/purchase-requests`,
      `${base}/stock/count`,
      `${base}/stock/issues`,
    ],
  };

  if (branchKind === "central_supply") {
    return [
      home,
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
    home,
    receive,
    {
      href: `${base}/stock/production`,
      label: branchCopy.centralNavProduction,
      icon: ChefHat,
      exact: false,
    },
    fulfill,
    more,
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
            label: APP_COPY_VI.branchHome,
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
                {
                  href: `/br/${branchId}/feedback`,
                  label: "Phản hồi",
                  icon: MessageSquareHeart,
                  exact: false,
                  matchPrefixes: [`/br/${branchId}/feedback`],
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
