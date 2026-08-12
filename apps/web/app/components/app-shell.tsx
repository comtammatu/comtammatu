"use client";

import { Fragment, useMemo, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell as IconBell,
  ChevronsUpDown as IconChevronsUpDown,
  LogOut as IconLogout,
  UserRound as IconUserRound,
} from "lucide-react";
import { cn } from "@comtammatu/ui";
import { Avatar, AvatarFallback } from "@comtammatu/ui/components/avatar";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@comtammatu/ui/components/dropdown-menu";
import {
  OWNER_SHELL_BREAKPOINT,
  useIsMobile,
} from "@comtammatu/ui/hooks/use-mobile";
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
} from "@/components/sidebar";
import {
  findActivePrimaryNavItem,
  getNavNotificationCount,
  getInitials,
  isNavItemActive,
  type ShellNavGroup,
  type ShellNavItem,
} from "@/lib/shell-primitives";
import { useNotificationBadges } from "@/_hooks/use-notification-badges";
import { AppPageHeader, AppShellPaddingBoundary } from "@/components/surface";
import { BrandLogoBox, BrandMark } from "@/components/brand";
import { ControlSurfaceBottomNav } from "@/components/control-surface-bottom-nav";
import { ThemeMenuItem } from "@/components/theme-toggle";
import { SectionLabel } from "@comtammatu/ui/components/section-label";
import { m, messages } from "@lib/messages";

export interface AppShellProps {
  children: ReactNode;
  user: { name: string };
  /** Primary module tabs for the single sidebar. */
  tier1: ShellNavItem[];
  /** Sub-tabs for the active primary tab. */
  tier2: ShellNavGroup[];
  sidebarHeaderAccessory?: ReactNode;
  /** Touch (&lt;lg): sticky Phạm vi above the scroll content. */
  mobileScopeAccessory?: ReactNode;
  personalHref?: string;
  mobileHeaderTitle?: string;
  /**
   * Mobile-only control_surface bottom navbar (same nav model as the sidebar +
   * drawer trigger). Default true for control_surface shells.
   */
  bottomNav?: boolean;
}

function AccountMenu({
  user,
  isTouchLayout,
  personalHref,
  variant,
}: {
  user: { name: string };
  isTouchLayout: boolean;
  personalHref?: string;
  variant: "sidebar" | "mobile";
}) {
  const copy = messages.common;
  const isMobile = variant === "mobile";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant={isMobile ? "outline" : "ghost"}
            size={isMobile ? "icon-touch" : "touch"}
            aria-label={isMobile ? copy.personalPage : undefined}
            className={
              isMobile
                ? "shrink-0 rounded-full p-0"
                : "w-full justify-start gap-2 rounded-md bg-sidebar-accent px-2.5 text-left text-sidebar-foreground ring-1 ring-sidebar-border/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            }
          />
        }
      >
        <Avatar>
          <AvatarFallback className="bg-primary font-semibold text-primary-foreground">
            {getInitials(user.name)}
          </AvatarFallback>
        </Avatar>
        {isMobile ? null : (
          <>
            <span className="min-w-0 flex-1 truncate text-sm font-medium">
              {user.name}
            </span>
            <IconChevronsUpDown className="ml-auto text-sidebar-foreground/60" />
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side={isMobile ? "bottom" : "top"}
        align={isMobile ? "end" : "start"}
        sideOffset={8}
        className="rounded-lg p-1.5"
      >
        <DropdownMenuGroup>
          {personalHref ? (
            <DropdownMenuItem
              className={cn("text-sm", isTouchLayout ? "min-h-12" : "min-h-10")}
              render={<Link href={personalHref} />}
            >
              <IconUserRound />
              {copy.personalPage}
            </DropdownMenuItem>
          ) : null}
          <ThemeMenuItem
            className={isTouchLayout ? "min-h-12 text-sm" : "min-h-10 text-sm"}
          />
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <form action="/api/auth/signout" method="post">
            <DropdownMenuItem
              nativeButton
              variant="destructive"
              className={cn(
                "w-full text-sm",
                isTouchLayout ? "min-h-12" : "min-h-10",
              )}
              render={<Button type="submit" variant="ghost" />}
            >
              <IconLogout />
              {copy.signOut}
            </DropdownMenuItem>
          </form>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
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

function UnreadBadge({ count = 0 }: { count?: number }) {
  if (count <= 0) return null;
  return (
    <>
      <Badge
        aria-hidden
        variant="secondary"
        className="ml-auto min-w-5 justify-center rounded-full px-1.5 tabular-nums"
      >
        {count > 99 ? "99+" : count}
      </Badge>
      <span className="sr-only">
        {m(messages.notifications.unreadBadge, { count })}
      </span>
    </>
  );
}

export function AppShell({
  children,
  user,
  tier1,
  tier2,
  sidebarHeaderAccessory,
  mobileScopeAccessory,
  personalHref,
  mobileHeaderTitle,
  bottomNav = true,
}: AppShellProps) {
  const pathname = usePathname();
  const isTouchLayout = useIsMobile(OWNER_SHELL_BREAKPOINT);
  const copy = messages.common;
  const controlSurfaceCopy = messages.controlSurface;
  const notificationSummary = useNotificationBadges();
  const tier1WithBadges = useMemo(
    () =>
      tier1.map((item) => ({
        ...item,
        badgeCount: getNavNotificationCount(item, notificationSummary.targets),
      })),
    [notificationSummary.targets, tier1],
  );
  const tier2WithBadges = useMemo(
    () =>
      tier2.map((group) => ({
        ...group,
        items: group.items.map((item) => ({
          ...item,
          badgeCount: getNavNotificationCount(
            item,
            notificationSummary.targets,
          ),
        })),
      })),
    [notificationSummary.targets, tier2],
  );
  const activePrimaryItem = useMemo(
    () => findActivePrimaryNavItem(tier1WithBadges, pathname),
    [pathname, tier1WithBadges],
  );
  const showBottomNav = bottomNav && tier1WithBadges.length > 0;
  const notificationsHref = `/notifications?returnTo=${encodeURIComponent(pathname)}`;

  return (
    <SidebarProvider
      open={true}
      className="h-svh overflow-hidden"
      style={
        {
          // Sticky detail footers read this offset; without a bottom nav the
          // footer still has to clear the home indicator.
          "--app-bottom-nav-offset": showBottomNav
            ? "calc(3.5rem + max(0.5rem, env(safe-area-inset-bottom)))"
            : "env(safe-area-inset-bottom)",
        } as CSSProperties
      }
    >
      <Sidebar variant="inset" collapsible="offcanvas">
        <SidebarHeader className="border-b border-sidebar-border px-3 py-3">
          <div className="flex items-center gap-3 rounded-md bg-sidebar-accent p-2 ring-1 ring-sidebar-border/70">
            <BrandLogoBox tone="sidebar" className="bg-sidebar">
              <BrandMark variant="seal" decorative className="size-full" />
            </BrandLogoBox>
            <div className="min-w-0 flex-1">
              <p className="truncate font-heading text-sm font-semibold leading-tight">
                {copy.brandShortName}
              </p>
              <p className="mt-0.5 truncate text-xs text-sidebar-foreground/70">
                {controlSurfaceCopy.dashboard.title}
              </p>
            </div>
          </div>
          {sidebarHeaderAccessory ? (
            <div className="mt-2">{sidebarHeaderAccessory}</div>
          ) : null}
        </SidebarHeader>

        <SidebarContent className="px-2 py-3">
          <SidebarGroup className="px-0 py-0">
            <SidebarGroupContent>
              <nav aria-label={controlSurfaceCopy.nav.ariaLabel}>
                <SidebarMenu className="gap-1">
                  {tier1WithBadges.map((item) => {
                    const Icon = item.icon;
                    const active = item === activePrimaryItem;
                    const subNavGroups = active
                      ? getSidebarSubNavGroups(tier2WithBadges, item.href)
                      : [];

                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton
                          isActive={active}
                          size={isTouchLayout ? "lg" : "default"}
                          tooltip={item.label}
                          className="rounded-lg font-medium transition-colors data-active:bg-primary data-active:text-primary-foreground data-active:shadow-sm hover:bg-sidebar-accent"
                          render={
                            <Link
                              href={item.href}
                              aria-current={active ? "page" : undefined}
                            >
                              <Icon />
                              <span className="min-w-0 flex-1 truncate">
                                {item.label}
                              </span>
                              <UnreadBadge count={item.badgeCount} />
                            </Link>
                          }
                        />
                        {subNavGroups.length > 0 ? (
                          <SidebarMenuSub className="mx-4 my-1 gap-1 border-l-2 border-primary/20 px-2 py-1">
                            {subNavGroups.map((group) => (
                              <Fragment key={group.title}>
                                {subNavGroups.length > 1 ? (
                                  <SidebarMenuSubItem>
                                    <SectionLabel
                                      density="dense"
                                      className="px-2 py-1 text-sidebar-foreground/70"
                                    >
                                      {group.title}
                                    </SectionLabel>
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
                                        isActive={subActive}
                                        size={isTouchLayout ? "touch" : "md"}
                                        className="data-active:bg-primary/10 data-active:font-semibold data-active:text-primary dark:data-active:bg-primary/15 dark:data-active:text-sidebar-foreground"
                                        render={
                                          <Link
                                            href={
                                              subItem.linkHref ?? subItem.href
                                            }
                                            aria-current={
                                              subActive ? "page" : undefined
                                            }
                                          >
                                            <SubIcon />
                                            <span className="min-w-0 flex-1 truncate">
                                              {subItem.label}
                                            </span>
                                            <UnreadBadge
                                              count={subItem.badgeCount}
                                            />
                                          </Link>
                                        }
                                      />
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
              </nav>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="border-t border-sidebar-border px-2 py-2">
          <Button
            variant="ghost"
            size={isTouchLayout ? "touch" : "default"}
            className="w-full justify-start gap-2 rounded-lg px-2.5 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            render={<Link href={notificationsHref} />}
          >
            <IconBell />
            <span className="min-w-0 flex-1 truncate">
              {messages.notifications.pageTitle}
            </span>
            <UnreadBadge count={notificationSummary.unreadCount} />
          </Button>
          <AccountMenu
            user={user}
            isTouchLayout={isTouchLayout}
            personalHref={personalHref}
            variant="sidebar"
          />
        </SidebarFooter>
      </Sidebar>

      <SidebarInset
        id="main-content"
        tabIndex={-1}
        data-control-surface=""
        className="chrome-safe-pt min-h-0 overflow-hidden lg:max-h-[calc(100svh-1rem)] lg:ring-1 lg:ring-sidebar-border/50"
      >
        {mobileHeaderTitle ? (
          <div className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-b border-border/70 bg-background px-3 lg:hidden">
            <AppPageHeader
              title={mobileHeaderTitle}
              compactOnMobile
              className="min-w-0 flex-1"
              titleClassName="truncate text-lg"
            />
            <AccountMenu
              user={user}
              isTouchLayout={isTouchLayout}
              personalHref={personalHref}
              variant="mobile"
            />
          </div>
        ) : null}
        {mobileScopeAccessory ? (
          <div className="sticky top-0 z-20 shrink-0 border-b border-border/70 bg-background px-3 py-2 lg:hidden">
            {mobileScopeAccessory}
          </div>
        ) : null}
        <div
          data-control-surface-scroll=""
          className={cn(
            // flex-col + child flex-1: short DETAIL pages fill the scrollport
            // so AppPage footer (mt-auto) docks to the panel bottom. Desktop
            // pb-0 so sticky CTA can sit flush; mobile keeps bottom-nav clearance.
            "no-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-3 pt-3 md:px-4 md:pt-4",
            showBottomNav ? "pb-24 lg:pb-0" : "pb-3 md:pb-4",
          )}
        >
          <AppShellPaddingBoundary>
            <div className="flex min-h-0 flex-1 flex-col gap-4">{children}</div>
          </AppShellPaddingBoundary>
        </div>
      </SidebarInset>
      {showBottomNav ? (
        <ControlSurfaceBottomNav
          tier1={tier1WithBadges}
          tier2={tier2WithBadges}
        />
      ) : null}
    </SidebarProvider>
  );
}
