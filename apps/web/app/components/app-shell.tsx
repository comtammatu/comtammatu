"use client";

import { Fragment, useMemo, type CSSProperties, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import {
  ChevronsUpDown as IconChevronsUpDown,
  ChevronDown as IconChevronDown,
  LogOut as IconLogout,
  UserRound as IconUserRound,
} from "lucide-react";
import { cn } from "@comtammatu/ui";
import { APP_COPY_VI } from "@comtammatu/shared/labels";
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
import { NotificationBell } from "@/_components/notification-bell";
import { useNotificationBadges } from "@/_hooks/use-notification-badges";
import { AppShellPaddingBoundary } from "@/components/surface";
import { BrandLogoBox, BrandMark } from "@/components/brand";
import { ControlSurfaceBottomNav } from "@/components/control-surface-bottom-nav";
import { ThemeMenuItem } from "@/components/theme-toggle";
import { SectionLabel } from "@comtammatu/ui/components/section-label";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@comtammatu/ui/components/collapsible";
import { partitionControlSurfacePrimaryNav } from "@/lib/control-surface-nav";
import { m, messages } from "@lib/messages";
import { ProtectedLink } from "@/_components/protected-link";

export interface AppShellProps {
  children: ReactNode;
  user: { name: string };
  /** Primary module tabs for the single sidebar. */
  tier1: ShellNavItem[];
  /** Sub-tabs for the active primary tab. */
  tier2: ShellNavGroup[];
  sidebarHeaderAccessory?: ReactNode;
  /** Touch (&lt;lg): scope control in the mobile tools band. */
  mobileScopeAccessory?: ReactNode;
  personalHref?: string;
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
                ? "flex size-10 shrink-0 items-center justify-center rounded-full p-0 ring-1 ring-border/50 hover:ring-border"
                : "flex w-full items-center justify-start gap-2 rounded-lg bg-sidebar-accent/80 px-2.5 py-2 text-left text-sidebar-foreground ring-1 ring-sidebar-border/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
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
            <span className="min-w-0 flex-1 truncate text-xs font-medium">
              {user.name}
            </span>
            <IconChevronsUpDown className="ml-auto size-4 shrink-0 text-sidebar-foreground/60" />
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
              className={cn(
                "text-sm flex items-center gap-2",
                isTouchLayout ? "min-h-12" : "min-h-10",
              )}
              render={<ProtectedLink href={personalHref} />}
            >
              <IconUserRound className="size-4 shrink-0" />
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
                "w-full text-sm flex items-center gap-2",
                isTouchLayout ? "min-h-12" : "min-h-10",
              )}
              render={
                <Button
                  type="submit"
                  variant="ghost"
                  className="w-full justify-start"
                />
              }
            >
              <IconLogout className="size-4 shrink-0" />
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

function PrimaryNavItem({
  item,
  active,
  pathname,
  isTouchLayout,
  subNavGroups,
}: {
  item: ShellNavItem;
  active: boolean;
  pathname: string;
  isTouchLayout: boolean;
  subNavGroups: ShellNavGroup[];
}) {
  const Icon = item.icon;
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={active}
        size={isTouchLayout ? "lg" : "default"}
        tooltip={item.label}
        className="rounded-lg font-medium transition-colors data-active:bg-primary data-active:text-primary-foreground data-active:shadow-sm hover:bg-sidebar-accent"
        render={
          <ProtectedLink
            href={item.href}
            aria-current={active ? "page" : undefined}
            className="flex items-center gap-2 w-full min-w-0"
          >
            <Icon />
            <span className="min-w-0 flex-1 truncate text-xs font-medium">
              {item.label}
            </span>
            <UnreadBadge count={item.badgeCount} />
          </ProtectedLink>
        }
      />
      {subNavGroups.length > 0 ? (
        <SidebarMenuSub className="mx-3 my-1 flex flex-col gap-1 border-l-2 border-primary/20 pl-2 pr-0 py-1">
          {subNavGroups.map((group) => (
            <Fragment key={group.title}>
              {subNavGroups.length > 1 ? (
                <SidebarMenuSubItem>
                  <SectionLabel
                    density="dense"
                    className="px-2 py-1 text-sidebar-foreground/60 font-semibold"
                  >
                    {group.title}
                  </SectionLabel>
                </SidebarMenuSubItem>
              ) : null}
              {group.items.map((subItem) => {
                const SubIcon = subItem.icon;
                const subActive = isNavItemActive(subItem, pathname);
                return (
                  <SidebarMenuSubItem key={subItem.href}>
                    <SidebarMenuSubButton
                      isActive={subActive}
                      size={isTouchLayout ? "touch" : "md"}
                      className="rounded-md data-active:bg-primary/10 data-active:font-semibold data-active:text-primary dark:data-active:bg-primary/15 dark:data-active:text-sidebar-foreground"
                      render={
                        <ProtectedLink
                          href={subItem.linkHref ?? subItem.href}
                          aria-current={subActive ? "page" : undefined}
                          className="flex items-center gap-2 w-full min-w-0"
                        >
                          <SubIcon />
                          <span className="min-w-0 flex-1 truncate text-xs">
                            {subItem.label}
                          </span>
                          <UnreadBadge count={subItem.badgeCount} />
                        </ProtectedLink>
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
}

function UnreadBadge({ count = 0 }: { count?: number }) {
  if (count <= 0) return null;
  return (
    <>
      <Badge
        aria-hidden
        variant="secondary"
        className="ml-auto min-w-5 h-5 flex items-center justify-center rounded-full px-1.5 text-3xs font-semibold tabular-nums"
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
  const { primary: primaryItems, catalog: catalogItems } = useMemo(
    () => partitionControlSurfacePrimaryNav(tier1WithBadges),
    [tier1WithBadges],
  );
  const catalogActive = catalogItems.some((item) => item === activePrimaryItem);
  const showBottomNav = bottomNav && tier1WithBadges.length > 0;

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
          <div className="flex min-w-0 items-center gap-2 px-1 py-1">
            <BrandLogoBox tone="sidebar" className="bg-sidebar">
              <BrandMark variant="seal" decorative className="size-full" />
            </BrandLogoBox>
            <div className="min-w-0 flex-1">
              <p className="truncate font-heading text-xs font-semibold leading-tight text-sidebar-foreground">
                {copy.brandShortName}
              </p>
              <p className="mt-0.5 truncate text-sidebar-foreground/70 text-xs">
                {APP_COPY_VI.ownerSurface}
              </p>
            </div>
          </div>
          {sidebarHeaderAccessory && !isTouchLayout ? (
            <div className="mt-2 w-full">{sidebarHeaderAccessory}</div>
          ) : null}
        </SidebarHeader>

        <SidebarContent className="px-2 py-3">
          <SidebarGroup className="px-0 py-0">
            <SidebarGroupContent>
              <nav aria-label={controlSurfaceCopy.nav.ariaLabel}>
                <SidebarMenu className="gap-1">
                  {primaryItems.map((item) => (
                    <PrimaryNavItem
                      key={item.href}
                      item={item}
                      active={item === activePrimaryItem}
                      pathname={pathname}
                      isTouchLayout={isTouchLayout}
                      subNavGroups={
                        item === activePrimaryItem
                          ? getSidebarSubNavGroups(tier2WithBadges, item.href)
                          : []
                      }
                    />
                  ))}
                  {catalogItems.length > 0 ? (
                    <Collapsible defaultOpen={catalogActive}>
                      <SidebarMenuItem>
                        <CollapsibleTrigger
                          render={
                            <SidebarMenuButton
                              size={isTouchLayout ? "lg" : "default"}
                              className="rounded-lg font-medium hover:bg-sidebar-accent"
                            />
                          }
                        >
                          <span className="min-w-0 flex-1 truncate text-xs">
                            {controlSurfaceCopy.nav.catalog}
                          </span>
                          <IconChevronDown className="ml-auto size-4 shrink-0 text-sidebar-foreground/60" />
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <SidebarMenu className="mt-1 gap-1">
                            {catalogItems.map((item) => (
                              <PrimaryNavItem
                                key={item.href}
                                item={item}
                                active={item === activePrimaryItem}
                                pathname={pathname}
                                isTouchLayout={isTouchLayout}
                                subNavGroups={
                                  item === activePrimaryItem
                                    ? getSidebarSubNavGroups(
                                        tier2WithBadges,
                                        item.href,
                                      )
                                    : []
                                }
                              />
                            ))}
                          </SidebarMenu>
                        </CollapsibleContent>
                      </SidebarMenuItem>
                    </Collapsible>
                  ) : null}
                </SidebarMenu>
              </nav>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="border-t border-sidebar-border px-2 py-2 flex flex-col gap-2">
          <NotificationBell
            variant="sidebar"
            unreadCount={notificationSummary.unreadCount}
          />
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
        <div
          data-control-surface-mobile-tools=""
          className="flex shrink-0 items-center gap-2 border-b border-border/70 bg-card/95 px-3 py-2 backdrop-blur lg:hidden"
        >
          <div className="min-w-0 flex-1">
            {isTouchLayout ? mobileScopeAccessory : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <NotificationBell
              variant="header"
              unreadCount={notificationSummary.unreadCount}
            />
            <AccountMenu
              user={user}
              isTouchLayout={isTouchLayout}
              personalHref={personalHref}
              variant="mobile"
            />
          </div>
        </div>
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
