"use client";

import { useRouter } from "next/navigation";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@comtammatu/ui/components/tabs";
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
    <Tabs
      value={active}
      onValueChange={(next) => {
        if (!next || next === active) return;
        router.push(next === "qr" ? qrHref : inboxHref);
      }}
      className="w-full"
    >
      <TabsList
        size="touch"
        className="grid w-full grid-cols-2"
        aria-label={feedbackCopy.pageTitle}
      >
        <TabsTrigger value="inbox">{feedbackCopy.tabInbox}</TabsTrigger>
        <TabsTrigger value="qr">{feedbackCopy.tabQr}</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
