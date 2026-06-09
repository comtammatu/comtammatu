"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@comtammatu/ui";

const FEEDBACK_NAV_ITEMS = [
  { href: "/admin/feedback", label: "Inbox", exact: true },
  { href: "/admin/feedback/qr", label: "Mã QR" },
  { href: "/admin/feedback/reports", label: "Báo cáo" },
] as const;

const FEEDBACK_NAV_ARIA_LABEL = "Điều hướng phản ánh";

export function FeedbackNav({ isOwner }: { isOwner: boolean }) {
  const pathname = usePathname();
  const items = isOwner
    ? [
        ...FEEDBACK_NAV_ITEMS,
        { href: "/admin/feedback/settings", label: "Cài đặt" },
      ]
    : FEEDBACK_NAV_ITEMS;

  return (
    <nav
      className="flex gap-1 overflow-x-auto border-b pb-0"
      aria-label={FEEDBACK_NAV_ARIA_LABEL}
    >
      {items.map((item) => {
        const isActive =
          "exact" in item
            ? pathname === item.href
            : pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "inline-flex h-9 shrink-0 items-center whitespace-nowrap border-b-2 border-transparent px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
              isActive && "border-primary text-primary",
            )}
            aria-current={isActive ? "page" : undefined}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
