"use client";

import Link from "next/link";
import { ScrollText as IconScrollText } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { messages } from "@lib/messages";

export function StaffHeaderOverflow() {
  return (
    <Button
      variant="outline"
      size="touch"
      render={<Link href="/hr/staff/audit" />}
    >
      <IconScrollText data-icon="inline-start" />
      {messages.owner.staffAudit.linkLabel}
    </Button>
  );
}
