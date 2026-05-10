"use client";

import type { ComponentProps } from "react";
import Link from "next/link";
import { LogIn as IconDoorEnter } from "lucide-react";
import { cn } from "@comtammatu/ui";
import { Button } from "@comtammatu/ui/components/button";

/** Compact back link to the work portal. */
export function EmployeePortalBackControl({
  className,
  size = "lg",
}: {
  className?: string;
  size?: ComponentProps<typeof Button>["size"];
}) {
  return (
    <Button
      variant="ghost"
      size={size}
      className={cn(
        "shrink-0 gap-1.5 text-sm text-muted-foreground",
        className,
      )}
      asChild
    >
      <Link
        href="/portal"
        title="Quay lại Điểm làm việc"
        aria-label="Quay lại Điểm làm việc"
      >
        <IconDoorEnter className="size-4 shrink-0" />
        <span>Thoát</span>
      </Link>
    </Button>
  );
}
