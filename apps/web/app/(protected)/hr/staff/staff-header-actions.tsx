"use client";

import Link from "next/link";
import {
  Briefcase as IconBriefcase,
  Ellipsis as IconDots,
  ScrollText as IconScrollText,
} from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@comtammatu/ui/components/dropdown-menu";
import { messages } from "@lib/messages";

export function StaffHeaderOverflow() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="icon">
            <IconDots className="size-4" />
            <span className="sr-only">
              {messages.admin.staffPage.moreActions}
            </span>
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          render={
            <Link href="/hr">
              <IconBriefcase className="mr-2 size-4" />
              {messages.admin.staffPage.hrLink}
            </Link>
          }
        />
        <DropdownMenuItem
          render={
            <Link href="/hr/staff/audit">
              <IconScrollText className="mr-2 size-4" />
              {messages.admin.staffAudit.linkLabel}
            </Link>
          }
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
