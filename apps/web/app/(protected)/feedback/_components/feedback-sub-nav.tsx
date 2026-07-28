"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@comtammatu/ui/lib/utils";
import { feedbackCopy } from "@lib/messages/feedback";

export function FeedbackSubNav({
  inboxHref,
  qrHref,
}: {
  inboxHref: string;
  qrHref: string;
}) {
  const pathname = usePathname();
  const items = [
    { href: inboxHref, label: feedbackCopy.tabInbox },
    { href: qrHref, label: feedbackCopy.tabQr },
  ];

  return (
    <nav className="flex gap-2 border-b border-border pb-2" aria-label="Feedback">
      {items.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
