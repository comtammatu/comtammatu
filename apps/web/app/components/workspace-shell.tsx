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
      <div className="flex min-h-dvh w-full">
        <Sidebar variant="inset">
          <SidebarHeader className="gap-4 p-4">{sidebarHeader}</SidebarHeader>

          <SidebarContent className="px-2 pb-4">
            {navGroups.map((group) => (
              <SidebarGroup key={group.title} className="px-0 py-1">
                <SidebarGroupLabel className="px-2 pb-1 text-xs font-medium text-sidebar-foreground/70">
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
                          className="rounded-md"
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
            <SidebarFooter className="p-4">{sidebarFooter}</SidebarFooter>
          ) : null}
        </Sidebar>

        <SidebarInset className="min-h-dvh bg-background">
          <div className="flex min-h-full flex-1 flex-col gap-4 p-4">
            <header className="rounded-lg border bg-card p-4 sm:p-6">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <SidebarTrigger className="md:hidden" />
                    {eyebrow ? (
                      <span className="inline-flex items-center rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                        {eyebrow}
                      </span>
                    ) : null}
                    {badge ? badge : null}
                  </div>

                  <div className="space-y-2">
                    <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
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
                <div className="mt-4 rounded-lg border bg-muted/30 p-4">
                  {headerMeta}
                </div>
              ) : null}
            </header>

            <main
              id="main-content"
              className={cn("flex-1", contentClassName)}
            >
              <div className="space-y-4">{children}</div>
            </main>
          </div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
