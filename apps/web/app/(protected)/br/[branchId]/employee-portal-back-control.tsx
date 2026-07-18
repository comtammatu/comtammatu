"use client";

import Link from "next/link";
import { LogIn as IconDoorEnter } from "lucide-react";
import { APP_COPY_VI } from "@comtammatu/shared/labels";
import { HR_VI } from "@comtammatu/shared/messages";
import { cn } from "@comtammatu/ui";
import { Button } from "@comtammatu/ui/components/button";

export function EmployeePortalBackControl({
  branchId,
  className,
}: {
  branchId: number;
  className?: string;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn(
        "h-9 min-h-9 shrink-0 gap-1.5 px-2 text-sm text-muted-foreground",
        className,
      )}
      render={
        <Link
          href={`/br/${branchId}`}
          title={APP_COPY_VI.operatorHome}
          aria-label={APP_COPY_VI.operatorHome}
        />
      }
    >
      <IconDoorEnter className="size-4 shrink-0" />
      <span>{HR_VI.exit}</span>
    </Button>
  );
}
