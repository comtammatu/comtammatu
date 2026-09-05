"use client";

import type { ReactNode } from "react";
import { cn } from "../lib/utils";
import { Card, CardContent } from "../components/card";
import { Separator } from "../components/separator";
import { Toolbar as BaseToolbar, ToolbarGroup } from "../components/toolbar";
import { StickyFilterChrome } from "./sticky-filter-chrome";

export type AppToolbarProps = {
  children?: ReactNode;
  className?: string;
  variant?: "card" | "inline";
  sticky?: boolean;
  search?: ReactNode;
  filters?: ReactNode;
  bulk?: ReactNode;
  actions?: ReactNode;
  reset?: ReactNode;
};

export type ToolbarProps = AppToolbarProps;

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
  const Toolbar = BaseToolbar;
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
      <StickyFilterChrome>{inlineToolbar}</StickyFilterChrome>
    ) : (
      inlineToolbar
    );
  }

  const cardToolbar = (
    <Card
      size="sm"
      className={cn("overflow-visible bg-card", className)}
    >
      <CardContent className="overflow-visible p-3">
        <Toolbar className="gap-2 overflow-visible">{content}</Toolbar>
      </CardContent>
    </Card>
  );

  return sticky ? (
    <StickyFilterChrome>{cardToolbar}</StickyFilterChrome>
  ) : (
    cardToolbar
  );
}

export const ToolbarSurface = AppToolbar;
export { AppToolbar as Toolbar };
