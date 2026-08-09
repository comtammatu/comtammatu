"use client";

import type { ReactNode } from "react";
import { cn } from "@comtammatu/ui";
import { Card, CardContent } from "@comtammatu/ui/components/card";
import { Separator } from "@comtammatu/ui/components/separator";
import { Toolbar, ToolbarGroup } from "@comtammatu/ui/components/toolbar";
import { AppStickyFilterChrome } from "./app-sticky-filter-chrome";

export type AppToolbarProps = {
  children?: ReactNode;
  className?: string;
  variant?: "card" | "inline";
  /**
   * Stick at the top of the Owner shell scrollport. Use for page-level LIST
   * filters rendered as a sibling of the table (not via AppListFrame toolbar).
   * Prefer AppListFrame's toolbar slot when possible. Do not sticky above
   * KPI/dashboard cards.
   */
  sticky?: boolean;
  search?: ReactNode;
  filters?: ReactNode;
  bulk?: ReactNode;
  actions?: ReactNode;
  reset?: ReactNode;
};

export function AppToolbar({
  children,
  className,
  variant = "card",
  sticky = false,
  search,
  filters,
  bulk,
  actions,
  reset,
}: AppToolbarProps) {
  const hasSlots =
    search != null ||
    filters != null ||
    bulk != null ||
    actions != null ||
    reset != null;

  const content = hasSlots ? (
    <>
      {search ? (
        <ToolbarGroup className="relative z-0 min-w-0 flex-1 gap-2">
          {search}
        </ToolbarGroup>
      ) : null}
      {filters ? (
        <ToolbarGroup className="relative z-10 shrink-0 gap-2">
          {filters}
        </ToolbarGroup>
      ) : null}
      {bulk ? (
        <>
          {/* Vertical Separator defaults to self-stretch; do not set h-* or it
              pins to cross-start and floats above the bottom border. */}
          <Separator orientation="vertical" />
          <ToolbarGroup className="relative z-10 gap-2">{bulk}</ToolbarGroup>
        </>
      ) : null}
      {actions ? (
        <>
          {search || filters || bulk ? (
            <Separator orientation="vertical" />
          ) : null}
          <ToolbarGroup className="relative z-10 gap-2">{actions}</ToolbarGroup>
        </>
      ) : null}
      {reset ? (
        <ToolbarGroup className="relative z-10 gap-2">{reset}</ToolbarGroup>
      ) : null}
    </>
  ) : (
    children
  );

  if (variant === "inline") {
    const inlineToolbar = (
      <Toolbar
        className={cn(
          "gap-2 overflow-visible border-b border-border px-3 py-2",
          className,
        )}
      >
        {content}
      </Toolbar>
    );
    return sticky ? (
      <AppStickyFilterChrome>{inlineToolbar}</AppStickyFilterChrome>
    ) : (
      inlineToolbar
    );
  }

  const cardToolbar = (
    <Card size="sm">
      <CardContent>
        <Toolbar className={cn("gap-3", className)}>{content}</Toolbar>
      </CardContent>
    </Card>
  );

  return sticky ? (
    <AppStickyFilterChrome>{cardToolbar}</AppStickyFilterChrome>
  ) : (
    cardToolbar
  );
}
