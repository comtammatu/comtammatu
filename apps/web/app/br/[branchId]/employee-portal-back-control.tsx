"use client";

import Link from "next/link";
import { LogIn as IconDoorEnter } from "lucide-react";
import { cn } from "@comtammatu/ui";
import { Button } from "@comtammatu/ui/components/button";

/** Compact back link to the employee portal. */
export function EmployeePortalBackControl({
  className,
}: {
  className?: string;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn(
        "h-7 shrink-0 gap-1 px-1.5 text-xs text-muted-foreground sm:px-2",
        className,
      )}
      asChild
    >
      <Link
        href="/employee"
        title="Quay lại Cổng nhân viên"
        aria-label="Quay lại Cổng nhân viên"
      >
        <IconDoorEnter className="size-3 shrink-0 sm:size-3.5" />
        <span>Thóat</span>
      </Link>
    </Button>
  );
}
