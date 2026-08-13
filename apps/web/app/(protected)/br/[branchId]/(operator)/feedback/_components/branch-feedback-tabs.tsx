import Link from "next/link";
import { Button } from "@comtammatu/ui/components/button";
import { feedbackCopy } from "@lib/messages/feedback";

export function BranchFeedbackTabs({
  inboxHref,
  qrHref,
  active,
}: {
  inboxHref: string;
  qrHref: string;
  active: "inbox" | "qr";
}) {
  const items = [
    { key: "inbox" as const, href: inboxHref, label: feedbackCopy.tabInbox },
    { key: "qr" as const, href: qrHref, label: feedbackCopy.tabQr },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => {
        const isActive = item.key === active;
        return (
          <Button
            key={item.key}
            variant={isActive ? "secondary" : "ghost"}
            size="touch"
            aria-current={isActive ? "page" : undefined}
            render={<Link href={item.href} />}
          >
            {item.label}
          </Button>
        );
      })}
    </div>
  );
}
