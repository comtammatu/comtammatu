"use client";

import { Clock, Home, Package, User, Users } from "lucide-react";
import { usePathname } from "next/navigation";
import {
  resolveOperatorTab,
  type OperatorTab,
} from "@comtammatu/shared/auth";
import { APP_COPY_VI } from "@comtammatu/shared/labels";
import { AppBottomNav } from "@/components/app-bottom-nav";
import type { ShellNavItem } from "@/lib/shell-primitives";
import { messages } from "@lib/messages";

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
  const activeTab = resolveOperatorTab(pathname);

  const items: (ShellNavItem & { tab: OperatorTab })[] = [
    {
      tab: "today",
      href: `/br/${branchId}`,
      label: APP_COPY_VI.operatorHome,
      icon: Home,
      exact: true,
    },
    ...(showEmployeeLinks
      ? [
          {
            tab: "shift" as const,
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
            tab: "team" as const,
            href: `/br/${branchId}/team`,
            label: "Đội",
            icon: Users,
            exact: false,
            matchPrefixes: [`/br/${branchId}/team`],
          },
          {
            tab: "stock" as const,
            href: `/br/${branchId}/stock`,
            label: "Tồn",
            icon: Package,
            exact: false,
            matchPrefixes: [`/br/${branchId}/stock`],
          },
        ]
      : []),
    {
      tab: "profile",
      href: `/br/${branchId}/profile`,
      label: messages.operator.nav.profileShort,
      icon: User,
      exact: false,
      matchPrefixes: [`/br/${branchId}/profile`],
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
        active: item.tab === activeTab,
      }))}
    />
  );
}
