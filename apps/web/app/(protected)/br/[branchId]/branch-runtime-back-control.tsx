"use client";

import Link from "next/link";
import { LogIn as IconDoorEnter } from "lucide-react";
import { APP_COPY_VI } from "@comtammatu/shared/labels";
import { HR_VI } from "@comtammatu/shared/messages";
import { cn } from "@comtammatu/ui";
import { Button } from "@comtammatu/ui/components/button";

export function BranchRuntimeBackControl({
  branchId,
  className,
}: {
  branchId: number;
  className?: string;
}) {
  return (
    <Button
      variant="ghost"
      size="touch"
      className={cn(
        "shrink-0 text-muted-foreground",
        className,
      )}
      render={
        <Link
          href={`/br/${branchId}`}
          title={APP_COPY_VI.branchHome}
          aria-label={APP_COPY_VI.branchHome}
        />
      }
    >
      <IconDoorEnter className="size-4 shrink-0" />
      <span>{HR_VI.exit}</span>
    </Button>
  );
}
