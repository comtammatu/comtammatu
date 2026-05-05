"use client";

import type { ReactNode } from "react";
import { cn } from "@comtammatu/ui";
import { SidebarTrigger } from "@comtammatu/ui/components/sidebar";
import { Separator } from "@comtammatu/ui/components/separator";

interface InventoryHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}

export function InventoryHeader({
  title,
  actions,
  className,
}: InventoryHeaderProps) {
  return (
    <header
      className={cn(
        "sticky top-0 z-10 flex min-h-14 items-center gap-3 overflow-hidden border-b bg-background px-4 py-2",
        className,
      )}
    >
      <SidebarTrigger />
      <Separator orientation="vertical" className="h-6 shrink-0" />

      <div className="flex min-w-0 flex-1 items-center gap-4">
        <div className="flex min-w-0 flex-col">
          <h1 className="text-sm font-semibold leading-tight">{title}</h1>
        </div>
      </div>

      {actions ? (
        <div className="flex shrink-0 items-center gap-2 overflow-x-auto">
          {actions}
        </div>
      ) : null}
    </header>
  );
}
