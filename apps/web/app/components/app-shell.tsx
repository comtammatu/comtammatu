"use client";

import { Fragment, useMemo, type ComponentType, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft as IconArrowLeft, LogOut as IconLogout } from "lucide-react";
import type { StaffRole } from "@comtammatu/shared/auth";
import { resolveRoleHomeLink, ROLE_LABEL_VI } from "@comtammatu/shared/auth";
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
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@comtammatu/ui/components/sidebar";
import {
  findActiveNavItem,
  formatPathSegment,
  getInitials,
  isNavItemActive,
  type ShellNavGroup,
} from "@/lib/shell-primitives";
import { AppShellPaddingBoundary } from "@/components/surface";
import { BrandMark, type BrandMarkVariant } from "@/components/brand";
import { WorkspaceBottomNav } from "@/components/workspace-bottom-nav";
import { messages } from "@lib/messages";

interface BrandConfig {
  icon: ComponentType<{ className?: string }>;
  subLabel: string;
  mainLabel: ReactNode;
  logoVariant?: BrandMarkVariant | null;
  logoAlt?: string;
  /** Show role-safe home link above brand block. Default true. */
  showBackLink?: boolean;
  backHref?: string;
  backLabel?: string;
}

interface PageHeaderConfig {
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
}

export interface AppShellProps {
  children: ReactNode;
  user: { name: string };
  role: StaffRole;
  branchId?: number | null;
  brand: BrandConfig;
  navGroups: ShellNavGroup[];
  defaultPageTitle: string;
  pageHeader: PageHeaderConfig;
  /** Sidebar collapsible mode. Default "offcanvas" (mobile drawer). */
  collapsible?: "icon" | "offcanvas";
  /**
   * Mobile-only workspace bottom navbar (same nav model as the sidebar +
   * drawer trigger). Default true for all back-office shells.
   */
  bottomNav?: boolean;
}

export function AppShell({
  children,
  user,
  role,
  branchId,
  brand,
  navGroups,
  defaultPageTitle,
  pageHeader,
  collapsible = "offcanvas",
  bottomNav = true,
}: AppShellProps) {
  const pathname = usePathname();
  const copy = messages.common;
  const pageTitle = useMemo(() => {
    const active = findActiveNavItem(navGroups, pathname);
    if (!active) return defaultPageTitle;
    const pathTail = pathname
      .slice(active.href.length)
      .split("/")
      .filter(Boolean)
      .map((segment) => formatPathSegment(segment));
    return pathTail[pathTail.length - 1] ?? active.label;
  }, [navGroups, pathname, defaultPageTitle]);

  const BrandIcon = brand.icon;
  const logoVariant =
    brand.logoVariant === undefined ? "seal" : brand.logoVariant;
  const showBackLink = brand.showBackLink ?? true;
  const defaultBackLink = resolveRoleHomeLink(role, branchId);
  const backHref = brand.backHref ?? defaultBackLink.href;
  const backLabel = brand.backLabel ?? defaultBackLink.label;
  const triggerClass = collapsible === "icon" ? undefined : "md:hidden";
  const breadcrumbSegments = pageHeader.breadcrumbSegments ?? [];

  return (
    <SidebarProvider>
      <Sidebar variant="inset" collapsible={collapsible}>
        <SidebarHeader className="gap-3 p-4">
          {showBackLink ? (
            <Link
              href={backHref}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-sidebar-foreground/65 hover:text-sidebar-foreground group-data-[collapsible=icon]:hidden"
            >
              <IconArrowLeft className="size-3.5" />
              {backLabel}
            </Link>
          ) : null}
          <div className="flex items-center gap-3">
            <div
              className={
                logoVariant
                  ? "flex size-10 shrink-0 items-center justify-center rounded-md border bg-sidebar-accent p-1"
                  : "flex size-10 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground"
              }
            >
              {logoVariant ? (
                <BrandMark
                  variant={logoVariant}
                  alt={brand.logoAlt}
                  className="size-full"
                />
              ) : (
                <BrandIcon className="size-5" />
              )}
            </div>
            <div className="min-w-0 flex-1 space-y-0.5 group-data-[collapsible=icon]:hidden">
              <p className="text-xs font-semibold uppercase tracking-wide text-sidebar-foreground/60">
                {brand.subLabel}
              </p>
              <p className="font-heading text-lg font-semibold leading-none">
                {brand.mainLabel}
              </p>
            </div>
          </div>
        </SidebarHeader>

        <SidebarContent className="px-2 pb-4">
          {navGroups.map((group) => (
            <SidebarGroup key={group.title} className="px-0 py-1">
              <SidebarGroupLabel className="px-2 pb-1 text-xs font-medium text-sidebar-foreground/70">
                {group.title}
              </SidebarGroupLabel>
              <SidebarGroupContent>
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
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </SidebarContent>

        <SidebarFooter className="p-2">
          <div className="flex items-center gap-2 px-1 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-1 group-data-[collapsible=icon]:px-0">
            <Avatar size="sm">
              <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
              <p className="truncate text-sm font-medium text-sidebar-foreground">
                {user.name}
              </p>
              <p className="truncate text-xs text-sidebar-foreground/65">
                {ROLE_LABEL_VI[role]}
              </p>
            </div>
            <form action="/api/auth/signout" method="post">
              <Button
                type="submit"
                variant="ghost"
                size="icon-sm"
                className="text-sidebar-foreground/75 hover:text-sidebar-foreground"
                aria-label={copy.signOut}
              >
                <IconLogout className="size-4" />
              </Button>
            </form>
          </div>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset>
        <header className="border-b px-4 py-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <SidebarTrigger className={triggerClass} />
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                {breadcrumbSegments.length > 0 ? (
                  <Breadcrumb>
                    <BreadcrumbList>
                      {breadcrumbSegments.map((segment, idx) => {
                        const label =
                          typeof segment === "string"
                            ? segment
                            : segment.label;
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
                <h1 className="font-heading sr-only">{pageTitle}</h1>
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
            <p className="mt-1 text-sm text-muted-foreground">
              {pageHeader.description}
            </p>
          ) : null}
          {pageHeader.mobileTopBar ? (
            <div className="sticky top-0 z-10 -mx-4 mt-3 w-[calc(100%+2rem)] border-t bg-background px-4 py-2 md:hidden">
              {pageHeader.mobileTopBar}
            </div>
          ) : null}
        </header>

        <main
          id="main-content"
          className={cn("flex-1 p-4", bottomNav && "pb-24 lg:pb-4")}
        >
          <AppShellPaddingBoundary>
            <div className="space-y-4">{children}</div>
          </AppShellPaddingBoundary>
        </main>
      </SidebarInset>
      {bottomNav ? <WorkspaceBottomNav navGroups={navGroups} /> : null}
    </SidebarProvider>
  );
}
