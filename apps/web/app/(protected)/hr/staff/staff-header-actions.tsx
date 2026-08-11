"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ScrollText as IconScrollText } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { messages } from "@lib/messages";
import {
  resolveHrBranchScope,
  withHrBranchScope,
} from "@/lib/hr-scope";

import {
  OWNER_SHELL_BREAKPOINT,
  useIsMobile,
} from "@comtammatu/ui/hooks/use-mobile";
export function StaffHeaderOverflow() {
  const isTouchLayout = useIsMobile(OWNER_SHELL_BREAKPOINT);

  const scope = resolveHrBranchScope(useSearchParams().get("branch"));
  return (
    <Button
      variant="outline"
      size={isTouchLayout ? "touch" : "default"}
      render={<Link href={withHrBranchScope("/hr/staff/audit", scope)} />}
    >
      <IconScrollText data-icon="inline-start" />
      {messages.controlSurface.staffAudit.linkLabel}
    </Button>
  );
}
