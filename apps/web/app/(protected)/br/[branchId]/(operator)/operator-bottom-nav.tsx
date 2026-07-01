"use client";

import { CalendarDays, Clock, Home, Settings } from "lucide-react";
import { usePathname } from "next/navigation";
import { APP_COPY_VI } from "@comtammatu/shared/labels";
import { AppBottomNav } from "@/components/app-bottom-nav";
import { isNavItemActive } from "@/lib/shell-primitives";
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
  const items = [
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
              `/br/${branchId}/shift/tasks`,
              `/br/${branchId}/shift/profile`,
              `/br/${branchId}/shift/leave`,
              `/br/${branchId}/shift/payslip`,
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
              `/br/${branchId}/settings`,
              `/br/${branchId}/stock`,
            ],
          },
        ]
      : []),
  ];

  return (
    <AppBottomNav
      ariaLabel={APP_COPY_VI.operatorAriaLabel}
      items={items.map((item) => ({
        href: item.href,
        label: item.label,
        icon: item.icon,
        active: isNavItemActive(item, pathname),
      }))}
    />
  );
}
