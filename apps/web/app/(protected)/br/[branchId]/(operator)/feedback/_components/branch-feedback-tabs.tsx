"use client";

import { useRouter } from "next/navigation";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@comtammatu/ui/components/toggle-group";
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
  const router = useRouter();

  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="touch"
      className="grid w-full grid-cols-2"
      value={active}
      onValueChange={(next) => {
        if (!next || next === active) return;
        router.push(next === "qr" ? qrHref : inboxHref);
      }}
      aria-label={feedbackCopy.pageTitle}
    >
      <ToggleGroupItem value="inbox">{feedbackCopy.tabInbox}</ToggleGroupItem>
      <ToggleGroupItem value="qr">{feedbackCopy.tabQr}</ToggleGroupItem>
    </ToggleGroup>
  );
}
