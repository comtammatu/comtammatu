"use client";

import { Fragment, useMemo, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut as IconLogout } from "lucide-react";
import { ROLE_LABEL_VI, type StaffRole } from "@comtammatu/shared/auth";
import { cn } from "@comtammatu/ui";
import { Avatar, AvatarFallback } from "@comtammatu/ui/components/avatar";
import { Button } from "@comtammatu/ui/components/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarTrigger,
} from "@comtammatu/ui/components/sidebar";
import {
  findActivePrimaryNavItem,
  getInitials,
  isNavItemActive,
  type ShellNavGroup,
  type ShellNavItem,
} from "@/lib/shell-primitives";
import { AppShellPaddingBoundary } from "@/components/surface";
import { BrandLogoBox, BrandMark } from "@/components/brand";
import { AdminDashboardBottomNav } from "@/components/admin-dashboard-bottom-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { SectionLabel } from "@comtammatu/ui/components/section-label";
import { messages } from "@lib/messages";

export interface AppShellHeaderConfig {
  actions?: ReactNode;
  /** Renders in the shell utility bar, left of actions. */
  headerExtras?: ReactNode;
  /** Renders below the utility bar on screens < md, full-width sticky band. */
  mobileTopBar?: ReactNode;
}

export interface AppShellProps {
  children: ReactNode;
  user: { name: string };
  /** Current user's role — drives the sidebar eyebrow label. */
  role: StaffRole;
  /** Primary module tabs for the single sidebar. */
  tier1: ShellNavItem[];
  /** Sub-tabs for the active primary tab. */
  tier2: ShellNavGroup[];
  shellHeader?: AppShellHeaderConfig;
  /**
   * Mobile-only Admin Dashboard bottom navbar (same nav model as the sidebar +
   * drawer trigger). Default true for all Admin Dashboard shells.
   */
  bottomNav?: boolean;
}

function getSidebarSubNavGroups(
  groups: ShellNavGroup[],
  parentHref: string,
): ShellNavGroup[] {
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => item.href !== parentHref),
    }))
    .filter((group) => group.items.length > 0);
}

export function AppShell({
  children,
  user,
  role,
  tier1,
  tier2,
  shellHeader = {},
  bottomNav = true,
}: AppShellProps) {
  const pathname = usePathname();
  const copy = messages.common;
  const activePrimaryItem = useMemo(
    () => findActivePrimaryNavItem(tier1, pathname),
    [tier1, pathname],
  );
  const showBottomNav = bottomNav && pathname !== "/admin";

  return (
    <SidebarProvider open={true}>
      <Sidebar variant="inset" collapsible="offcanvas">
        <SidebarHeader className="relative gap-3 border-b p-3 overflow-hidden bg-gradient-to-br from-sidebar via-sidebar/50 to-sidebar/10">
          <div className="brand-pattern-caro absolute inset-0 opacity-10 pointer-events-none" />
          <div className="relative z-10 flex items-center gap-3">
            <BrandLogoBox tone="sidebar">
              <BrandMark
                variant="seal"
                alt={copy.brandName}
                className="size-full"
              />
            </BrandLogoBox>
            <div className="min-w-0 flex flex-1 flex-col gap-1">
              <SectionLabel className="text-sidebar-foreground/60">
                {ROLE_LABEL_VI[role]}
              </SectionLabel>
              <p className="truncate font-heading text-base font-semibold leading-tight">
                {copy.brandName}
              </p>
            </div>
          </div>
        </SidebarHeader>

        <SidebarContent className="gap-3 px-2 py-3">
          <SidebarGroup className="px-0 py-0">
            <SidebarGroupContent>
              <SidebarMenu>
                {tier1.map((item) => {
                  const Icon = item.icon;
                  const active = item === activePrimaryItem;
                  const subNavGroups = active
                    ? getSidebarSubNavGroups(tier2, item.href)
                    : [];

                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        tooltip={item.label}
                        className="relative rounded-md data-active:bg-primary/10 data-active:text-primary font-medium dark:data-active:bg-primary/15 before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-r-sm before:bg-primary before:opacity-0 data-active:before:opacity-100 before:transition-opacity"
                      >
                        <Link
                          href={item.href}
                          aria-current={active ? "page" : undefined}
                        >
                          <Icon />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                      {subNavGroups.length > 0 ? (
                        <SidebarMenuSub>
                          {subNavGroups.map((group) => (
                            <Fragment key={group.title}>
                              {subNavGroups.length > 1 ? (
                                <SidebarMenuSubItem>
                                  <span className="block px-2 py-1 text-2xs font-medium uppercase tracking-wider text-sidebar-foreground/70">
                                    {group.title}
                                  </span>
                                </SidebarMenuSubItem>
                              ) : null}
                              {group.items.map((subItem) => {
                                const SubIcon = subItem.icon;
                                const subActive = isNavItemActive(
                                  subItem,
                                  pathname,
                                );
                                return (
                                  <SidebarMenuSubItem key={subItem.href}>
                                    <SidebarMenuSubButton
                                      asChild
                                      isActive={subActive}
                                      className="relative data-active:text-primary data-active:font-semibold dark:data-active:text-primary-foreground before:absolute before:-left-2.5 before:top-3 before:size-1.5 before:rounded-full before:bg-primary before:opacity-0 data-active:before:opacity-100 before:transition-opacity"
                                    >
                                      <Link
                                        href={subItem.linkHref ?? subItem.href}
                                        aria-current={
                                          subActive ? "page" : undefined
                                        }
                                      >
                                        <SubIcon />
                                        <span>{subItem.label}</span>
                                      </Link>
                                    </SidebarMenuSubButton>
                                  </SidebarMenuSubItem>
                                );
                              })}
                            </Fragment>
                          ))}
                        </SidebarMenuSub>
                      ) : null}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="border-t p-2 bg-muted/30">
          <div className="flex items-center gap-2">
            <Avatar size="sm">
              <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
            </Avatar>
            <span className="min-w-0 flex-1 truncate text-xs font-medium">
              {user.name}
            </span>
            <form action="/api/auth/signout" method="post">
              <Button
                type="submit"
                variant="ghost"
                size="icon-sm"
                className="text-sidebar-foreground/75 hover:text-sidebar-foreground"
                aria-label={copy.signOut}
              >
                <IconLogout />
              </Button>
            </form>
          </div>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset id="main-content">
        <header className="sticky top-0 z-30 border-b border-border/20 bg-background/80 px-4 py-2.5 backdrop-blur-md shadow-xs print:hidden">
          <div className="flex items-center gap-3">
            <SidebarTrigger className="lg:hidden" />
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              {shellHeader.headerExtras}
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <ThemeToggle />
              {shellHeader.actions}
            </div>
          </div>
          {shellHeader.mobileTopBar ? (
            <div className="sticky top-0 z-10 -mx-4 mt-3 w-[calc(100%+2rem)] border-t bg-background px-4 py-2 lg:hidden">
              {shellHeader.mobileTopBar}
            </div>
          ) : null}
        </header>

        <div
          className={cn("flex-1 p-3 md:p-4", showBottomNav && "pb-24 lg:pb-4")}
        >
          <AppShellPaddingBoundary>
            <div className="flex min-h-0 flex-col gap-4">{children}</div>
          </AppShellPaddingBoundary>
        </div>
      </SidebarInset>
      {showBottomNav ? (
        <AdminDashboardBottomNav tier1={tier1} tier2={tier2} />
      ) : null}
    </SidebarProvider>
  );
}
