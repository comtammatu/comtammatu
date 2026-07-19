"use client";

import { Clock, Home, Package, Users } from "lucide-react";
import { usePathname } from "next/navigation";
import { APP_COPY_VI } from "@comtammatu/shared/labels";
import { AppBottomNav } from "@/components/app-bottom-nav";
import { isNavItemActive, type ShellNavItem } from "@/lib/shell-primitives";
import { messages } from "@lib/messages";

const branchCopy = messages.settings.branch;

export function OperatorBottomNav({
  branchId,
  showEmployeeLinks,
  showBranchManagement,
}: {
  branchId: number;
  showEmployeeLinks: boolean;
  showBranchManagement: boolean;
}) {
  const pathname = usePathname();

  const items: ShellNavItem[] = [
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
