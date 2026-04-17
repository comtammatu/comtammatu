"use client";

import type { ReactNode } from "react";
import { SidebarTrigger } from "@comtammatu/ui/components/sidebar";
import { Separator } from "@comtammatu/ui/components/separator";

interface InventoryHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
}

export function InventoryHeader({
  title,
  description,
  actions,
}: InventoryHeaderProps) {
  return (
    <header className="sticky top-0 z-10 flex h-14 items-center gap-4 border-b bg-background px-4">
      <SidebarTrigger />
      <Separator orientation="vertical" className="h-6" />

      <div className="flex flex-1 items-center gap-4">
        <div className="flex flex-col">
          <h1 className="text-sm font-semibold leading-tight">{title}</h1>
          {description ? (
            <p className="text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
      </div>

      {actions ? (
        <div className="flex items-center gap-2">{actions}</div>
      ) : null}
    </header>
  );
}
