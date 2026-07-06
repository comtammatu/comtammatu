"use client";

import { Fragment, useMemo, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut as IconLogout } from "lucide-react";
import { ROLE_LABEL_VI } from "@comtammatu/shared/auth";
import { cn } from "@comtammatu/ui";
import { Avatar, AvatarFallback } from "@comtammatu/ui/components/avatar";
import { Badge } from "@comtammatu/ui/components/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@comtammatu/ui/components/breadcrumb";
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
  findActiveNavItem,
  findActivePrimaryNavItem,
  formatPathSegment,
  getInitials,
  isNavItemActive,
  type ShellNavGroup,
  type ShellNavItem,
} from "@/lib/shell-primitives";
import { AppShellPaddingBoundary } from "@/components/surface";
import { BrandLogoBox, BrandMark } from "@/components/brand";
import { WorkspaceBottomNav } from "@/components/workspace-bottom-nav";
import { messages } from "@lib/messages";

export interface PageHeaderConfig {
  /** Either a single Badge label or breadcrumb chain segments. */
  crumbLabel?: ReactNode;
  /** Segments with an href render as links; plain strings stay static. */
  breadcrumbSegments?: Array<string | { label: string; href?: string }>;
  description?: ReactNode;
  actions?: ReactNode;
  /** Renders LEFT of actions in the desktop header row, after page title. */
  headerExtras?: ReactNode;
  /** Renders BELOW the existing header on screens < md, full-width sticky band. */
  mobileTopBar?: ReactNode;
  suppressTitleHeading?: boolean;
}

export interface AppShellProps {
  children: ReactNode;
  user: { name: string };
  /** Primary module tabs for the single sidebar. */
  tier1: ShellNavItem[];
  /** Sub-tabs for the active primary tab. */
  tier2: ShellNavGroup[];
  defaultPageTitle: string;
  pageHeader: PageHeaderConfig;
  /**
   * Mobile-only workspace bottom navbar (same nav model as the sidebar +
   * drawer trigger). Default true for all back-office shells.
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
  tier1,
  tier2,
  defaultPageTitle,
  pageHeader,
  bottomNav = true,
}: AppShellProps) {
  const pathname = usePathname();
  const copy = messages.common;
  const pageTitle = useMemo(() => {
    const active = findActiveNavItem(tier2, pathname);
    if (!active) return defaultPageTitle;
    const pathTail = pathname
      .slice(active.href.length)
      .split("/")
      .filter(Boolean)
      .map((segment) => formatPathSegment(segment));
    const lastSegment = pathTail[pathTail.length - 1];
    return lastSegment && !/^\d+$/.test(lastSegment) ? lastSegment : active.label;
  }, [tier2, pathname, defaultPageTitle]);

  const activePrimaryItem = useMemo(
    () => findActivePrimaryNavItem(tier1, pathname),
    [tier1, pathname],
  );

  const breadcrumbSegments = pageHeader.breadcrumbSegments ?? [];

  return (
    <SidebarProvider open={true}>
      <Sidebar variant="inset" collapsible="offcanvas">
        <SidebarHeader className="gap-3 border-b p-3">
          <div className="flex items-center gap-3">
            <BrandLogoBox tone="sidebar">
              <BrandMark
                variant="seal"
                alt={copy.brandName}
                className="size-full"
              />
            </BrandLogoBox>
            <div className="min-w-0 flex flex-1 flex-col gap-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-sidebar-foreground/60">
                {ROLE_LABEL_VI.office}
              </p>
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
                        className="rounded-md"
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
                                    >
                                      <Link
                                        href={subItem.href}
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

        <SidebarFooter className="border-t p-2">
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
        <header className="sticky top-0 z-30 border-b bg-background px-4 py-2 print:hidden">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <SidebarTrigger className="lg:hidden" />
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                {breadcrumbSegments.length > 0 ? (
                  <Breadcrumb>
                    <BreadcrumbList>
                      {breadcrumbSegments.map((segment, idx) => {
                        const label =
                          typeof segment === "string" ? segment : segment.label;
                        const href =
                          typeof segment === "string"
                            ? undefined
                            : segment.href;
                        return (
                          <Fragment key={`${label}-${String(idx)}`}>
                            <BreadcrumbItem>
                              {href ? (
                                <BreadcrumbLink
                                  asChild
                                  className="font-normal text-muted-foreground"
                                >
                                  <Link href={href}>{label}</Link>
                                </BreadcrumbLink>
                              ) : (
                                <BreadcrumbPage className="font-normal text-muted-foreground">
                                  {label}
                                </BreadcrumbPage>
                              )}
                            </BreadcrumbItem>
                            {idx < breadcrumbSegments.length - 1 && (
                              <BreadcrumbSeparator />
                            )}
                          </Fragment>
                        );
                      })}
                    </BreadcrumbList>
                  </Breadcrumb>
                ) : pageHeader.crumbLabel ? (
                  <Badge variant="outline">{pageHeader.crumbLabel}</Badge>
                ) : null}
                <span className="truncate text-sm font-medium">
                  {pageTitle}
                </span>
                {pageHeader.suppressTitleHeading ? null : (
                  <h1 className="font-heading sr-only">{pageTitle}</h1>
                )}
              </div>
              {pageHeader.headerExtras ? (
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {pageHeader.headerExtras}
                </div>
              ) : null}
            </div>
            {pageHeader.actions ? (
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {pageHeader.actions}
              </div>
            ) : null}
          </div>
          {pageHeader.description ? (
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              {pageHeader.description}
            </p>
          ) : null}
          {pageHeader.mobileTopBar ? (
            <div className="sticky top-0 z-10 -mx-4 mt-3 w-[calc(100%+2rem)] border-t bg-background px-4 py-2 lg:hidden">
              {pageHeader.mobileTopBar}
            </div>
          ) : null}
        </header>

        <div className={cn("flex-1 p-3 md:p-4", bottomNav && "pb-24 lg:pb-4")}>
          <AppShellPaddingBoundary>
            <div className="flex min-h-0 flex-col gap-4">{children}</div>
          </AppShellPaddingBoundary>
        </div>
      </SidebarInset>
      {bottomNav ? <WorkspaceBottomNav tier1={tier1} tier2={tier2} /> : null}
    </SidebarProvider>
  );
}
