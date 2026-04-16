"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@comtammatu/ui/components/sidebar";
import { cn } from "@comtammatu/ui";
import { isNavItemActive, type ShellNavGroup } from "@/lib/shell-primitives";

interface WorkspaceShellProps {
  children: ReactNode;
  pathname: string;
  navGroups: ShellNavGroup[];
  sidebarHeader: ReactNode;
  sidebarFooter?: ReactNode;
  eyebrow?: string;
  title: string;
  description?: string;
  badge?: ReactNode;
  actions?: ReactNode;
  headerMeta?: ReactNode;
  contentClassName?: string;
}

export function WorkspaceShell({
  children,
  pathname,
  navGroups,
  sidebarHeader,
  sidebarFooter,
  eyebrow,
  title,
  description,
  badge,
  actions,
  headerMeta,
  contentClassName,
}: WorkspaceShellProps) {
  return (
    <SidebarProvider>
      <div className="app-canvas flex min-h-dvh w-full safe-top">
        <Sidebar variant="floating" className="border-none">
          <SidebarHeader className="gap-4 p-3">{sidebarHeader}</SidebarHeader>

          <SidebarContent className="px-2 pb-3">
            {navGroups.map((group) => (
              <SidebarGroup
                key={group.title}
                className="mb-3 rounded-3xl border border-sidebar-border/70 bg-sidebar-accent/55 p-2 shadow-sm"
              >
                <SidebarGroupLabel className="px-3 pt-2 text-xs font-semibold uppercase tracking-widest text-sidebar-foreground/60">
                  {group.title}
                </SidebarGroupLabel>
                <SidebarMenu>
                  {group.items.map((item) => {
                    const active = isNavItemActive(item, pathname);
                    const Icon = item.icon;
                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton
                          asChild
                          isActive={active}
                          size="lg"
                          tooltip={item.label}
                          className="rounded-2xl px-3"
                        >
                          <Link href={item.href}>
                            <Icon />
                            <span>{item.label}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroup>
            ))}
          </SidebarContent>

          {sidebarFooter ? (
            <SidebarFooter className="p-3">{sidebarFooter}</SidebarFooter>
          ) : null}
        </Sidebar>

        <SidebarInset className="min-h-dvh bg-transparent">
          <div className="flex min-h-full flex-1 flex-col p-3 md:p-4">
            <div className="app-shell flex min-h-full flex-1 flex-col">
              <header className="border-b border-border/60 p-4 sm:p-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <SidebarTrigger className="md:hidden" />
                      {eyebrow ? (
                        <span className="app-kicker">{eyebrow}</span>
                      ) : null}
                      {badge ? badge : null}
                    </div>

                    <div className="space-y-2">
                      <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                        {title}
                      </h1>
                      {description ? (
                        <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
                          {description}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  {actions ? (
                    <div className="flex flex-wrap items-center gap-2">
                      {actions}
                    </div>
                  ) : null}
                </div>

                {headerMeta ? (
                  <div className="mt-4 rounded-3xl border border-border/60 bg-background/75 p-3 shadow-sm backdrop-blur">
                    {headerMeta}
                  </div>
                ) : null}
              </header>

              <main
                id="main-content"
                className={cn("flex-1 p-4 sm:p-5", contentClassName)}
              >
                <div className="space-y-5">{children}</div>
              </main>
            </div>
          </div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
