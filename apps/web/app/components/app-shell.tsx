"use client";

import {
  Fragment,
  useMemo,
  type ComponentType,
  type CSSProperties,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft as IconArrowLeft, LogOut as IconLogout } from "lucide-react";
import type { StaffRole } from "@comtammatu/shared/auth";
import { resolveRoleHomeLink } from "@comtammatu/shared/auth";
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
  findActiveRailItem,
  formatPathSegment,
  getInitials,
  isNavItemActive,
  type ShellNavGroup,
  type ShellNavItem,
} from "@/lib/shell-primitives";
import { AppShellPaddingBoundary } from "@/components/surface";
import { BrandLogoBox, BrandMark, type BrandMarkVariant } from "@/components/brand";
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
  /** TIER-1 rail: cross-module switcher. Flat, icon-only. */
  tier1: ShellNavItem[];
  /** TIER-2 panel: the active module's deep nav (grouped). */
  tier2: ShellNavGroup[];
  defaultPageTitle: string;
  pageHeader: PageHeaderConfig;
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
    return pathTail[pathTail.length - 1] ?? active.label;
  }, [tier2, pathname, defaultPageTitle]);

  const activeRailItem = useMemo(
    () => findActiveRailItem(tier1, pathname),
    [tier1, pathname],
  );

  const BrandIcon = brand.icon;
  const logoVariant =
    brand.logoVariant === undefined ? "seal" : brand.logoVariant;
  const showBackLink = brand.showBackLink ?? true;
  const defaultBackLink = resolveRoleHomeLink(role, branchId);
  const backHref = brand.backHref ?? defaultBackLink.href;
  const backLabel = brand.backLabel ?? defaultBackLink.label;
  const breadcrumbSegments = pageHeader.breadcrumbSegments ?? [];

  return (
    <SidebarProvider>
      <Sidebar
        collapsible="none"
        // Rail is a fixed icon column: drive the primitive's own w-(--sidebar-width)
        // to the icon width via the CSS var (no arbitrary sizing, no competing width class).
        style={{ "--sidebar-width": "var(--sidebar-width-icon)" } as CSSProperties}
        className="sticky top-0 hidden h-svh self-start border-r md:flex"
      >
        <SidebarHeader className="items-center border-b p-2">
          <BrandLogoBox tone={logoVariant ? "sidebar" : "sidebar-primary"}>
            {logoVariant ? (
              <BrandMark
                variant={logoVariant}
                alt={brand.logoAlt}
                className="size-full"
              />
            ) : (
              <BrandIcon className="size-5" />
            )}
          </BrandLogoBox>
        </SidebarHeader>

        <SidebarContent className="px-1 py-2">
          <SidebarMenu className="items-center gap-1">
            {tier1.map((item) => {
              const Icon = item.icon;
              return (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={item === activeRailItem}
                    tooltip={{ children: item.label, hidden: false }}
                    className="justify-center rounded-md data-[active=true]:bg-sidebar-primary data-[active=true]:text-sidebar-primary-foreground"
                  >
                    <Link
                      href={item.href}
                      aria-label={item.label}
                      aria-current={
                        item === activeRailItem ? "page" : undefined
                      }
                    >
                      <Icon />
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarContent>

        <SidebarFooter className="border-t p-2">
          <div className="flex flex-col items-center justify-center gap-1">
            <Avatar size="sm">
              <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
            </Avatar>
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

      <Sidebar
        variant="inset"
        collapsible="offcanvas"
        className="md:data-[side=left]:left-(--sidebar-width-icon)"
      >
        <SidebarHeader className="gap-3 border-b p-3">
          <div className="flex items-center gap-3">
            <BrandLogoBox
              tone={logoVariant ? "sidebar" : "sidebar-primary"}
              className="md:hidden"
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
            </BrandLogoBox>
            <div className="min-w-0 flex flex-1 flex-col gap-1 group-data-[collapsible=icon]:hidden">
              <p className="text-xs font-semibold uppercase tracking-wide text-sidebar-foreground/60">
                {brand.subLabel}
              </p>
              <p className="truncate font-heading text-base font-semibold leading-tight">
                {brand.mainLabel}
              </p>
            </div>
          </div>
          {showBackLink ? (
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="justify-start text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <Link href={backHref}>
                <IconArrowLeft data-icon="inline-start" />
                {backLabel}
              </Link>
            </Button>
          ) : null}
        </SidebarHeader>

        <SidebarContent className="gap-2 px-2 py-3">
          {tier2.map((group) => (
            <SidebarGroup key={group.title} className="px-0 py-0">
              <SidebarGroupLabel className="h-7 px-2 text-2xs font-medium uppercase tracking-wider text-sidebar-foreground/60">
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
                          <Link
                            href={item.href}
                            aria-current={active ? "page" : undefined}
                          >
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
        <SidebarRail />
      </Sidebar>

      <SidebarInset id="main-content">
        <header className="sticky top-0 z-30 border-b bg-background px-4 py-2 print:hidden">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <SidebarTrigger className="md:hidden" />
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
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              {pageHeader.description}
            </p>
          ) : null}
          {pageHeader.mobileTopBar ? (
            <div className="sticky top-0 z-10 -mx-4 mt-3 w-[calc(100%+2rem)] border-t bg-background px-4 py-2 md:hidden">
              {pageHeader.mobileTopBar}
            </div>
          ) : null}
        </header>

        <div
          className={cn("flex-1 p-3 md:p-4", bottomNav && "pb-24 lg:pb-4")}
        >
          <AppShellPaddingBoundary>
            <div className="flex min-h-0 flex-col gap-4">{children}</div>
          </AppShellPaddingBoundary>
        </div>
      </SidebarInset>
      {bottomNav ? <WorkspaceBottomNav tier1={tier1} tier2={tier2} /> : null}
    </SidebarProvider>
  );
}
