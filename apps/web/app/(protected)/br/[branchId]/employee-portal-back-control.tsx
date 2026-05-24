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
        "h-9 min-h-9 shrink-0 gap-1.5 px-2.5 text-sm text-muted-foreground",
        className,
      )}
      asChild
    >
      <Link
        href="/employee"
        title="Quay lại Cổng nhân viên"
        aria-label="Quay lại Cổng nhân viên"
      >
        <IconDoorEnter className="size-4 shrink-0" />
        <span>Thoát</span>
      </Link>
    </Button>
  );
}
