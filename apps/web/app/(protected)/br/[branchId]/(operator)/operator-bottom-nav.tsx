"use client";

import { Bell, Clock, Home, UserCircle } from "lucide-react";
import { usePathname } from "next/navigation";
import { APP_COPY_VI, MODULE_LABELS_VI } from "@comtammatu/shared/labels";
import { AppBottomNav } from "@/components/app-bottom-nav";
import { isNavItemActive } from "@/lib/shell-primitives";
import { messages } from "@lib/messages";

export function OperatorBottomNav({
  branchId,
  showEmployeeLinks,
}: {
  branchId: number;
  showEmployeeLinks: boolean;
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
            exact: false,
          },
        ]
      : []),
    {
      href: "/notifications",
      label: MODULE_LABELS_VI.notifications,
      icon: Bell,
      exact: false,
    },
    ...(showEmployeeLinks
      ? [
          {
            href: `/br/${branchId}/shift/profile`,
            label: messages.employee.nav.profileShort,
            icon: UserCircle,
            exact: false,
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
