"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@comtammatu/ui/components/button";
import { AppToolbar } from "@/components/surface";
import { feedbackCopy } from "@lib/messages/feedback";

import {
  OWNER_SHELL_BREAKPOINT,
  useIsMobile,
} from "@comtammatu/ui/hooks/use-mobile";
export function FeedbackSubNav({
  inboxHref,
  qrHref,
}: {
  inboxHref: string;
  qrHref: string;
}) {
  const isTouchLayout = useIsMobile(OWNER_SHELL_BREAKPOINT);

  const pathname = usePathname();
  const items = [
    { href: inboxHref, label: feedbackCopy.tabInbox },
    { href: qrHref, label: feedbackCopy.tabQr },
  ];

  return (
    <AppToolbar className="flex-wrap">
      {items.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Button
            key={item.href}
            variant={active ? "secondary" : "ghost"}
            size={isTouchLayout ? "touch" : "default"}
            aria-current={active ? "page" : undefined}
            render={<Link href={item.href} />}
          >
            {item.label}
          </Button>
        );
      })}
    </AppToolbar>
  );
}
