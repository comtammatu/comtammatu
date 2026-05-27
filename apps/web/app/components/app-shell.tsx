"use client";

import { Fragment, useMemo, type ComponentType, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft as IconArrowLeft, LogOut as IconLogout } from "lucide-react";
import type { StaffRole } from "@comtammatu/shared/auth";
import { ROLE_LABEL_VI } from "@comtammatu/shared/auth";
import { Avatar, AvatarFallback } from "@comtammatu/ui/components/avatar";
import { Badge } from "@comtammatu/ui/components/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
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
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@comtammatu/ui/components/sidebar";
import { Separator } from "@comtammatu/ui/components/separator";
import {
  findActiveNavItem,
  formatPathSegment,
  getInitials,
  isNavItemActive,
  type ShellNavGroup,
} from "@/lib/shell-primitives";
import { BrandMark, type BrandMarkVariant } from "@/components/brand";
import { messages } from "@lib/messages";

interface BrandConfig {
  icon: ComponentType<{ className?: string }>;
  subLabel: string;
  mainLabel: ReactNode;
  logoVariant?: BrandMarkVariant | null;
  logoAlt?: string;
  /** Show "back to admin" link above brand block. Default true. */
  showBackLink?: boolean;
}

interface PageHeaderConfig {
  /** Either a single Badge label or breadcrumb chain segments. */
  crumbLabel?: ReactNode;
  breadcrumbSegments?: string[];
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
  brand: BrandConfig;
  navGroups: ShellNavGroup[];
  defaultPageTitle: string;
  pageHeader: PageHeaderConfig;
  /** Sidebar collapsible mode. Default "offcanvas" (mobile drawer). */
  collapsible?: "icon" | "offcanvas";
}

export function AppShell({
  children,
  user,
  role,
  brand,
  navGroups,
  defaultPageTitle,
  pageHeader,
  collapsible = "offcanvas",
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
  const triggerClass = collapsible === "icon" ? undefined : "md:hidden";
  const breadcrumbSegments = pageHeader.breadcrumbSegments ?? [];
  const mobileHeaderExtras = pageHeader.mobileTopBar
    ? null
    : pageHeader.headerExtras;
  const brandHref = navGroups[0]?.items[0]?.href ?? "/admin/dashboard";

  return (
    <SidebarProvider>
      <Sidebar variant="inset" collapsible={collapsible}>
        <SidebarHeader className="border-b border-sidebar-border p-2">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild size="lg">
                <Link href={brandHref}>
                  <span
                    aria-hidden="true"
                    className={
                      logoVariant
                        ? "flex size-8 shrink-0 items-center justify-center rounded-md border bg-sidebar-accent p-1"
                        : "flex size-8 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground"
                    }
                  >
                    {logoVariant ? (
                      <BrandMark
                        variant={logoVariant}
                        alt={brand.logoAlt}
                        className="size-full"
                      />
                    ) : (
                      <BrandIcon />
                    )}
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5 group-data-[collapsible=icon]:hidden">
                    <span className="truncate text-xs font-medium text-sidebar-foreground/65">
                      {brand.subLabel}
                    </span>
                    <span className="truncate font-heading text-sm font-semibold">
                      {brand.mainLabel}
                    </span>
                  </span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          {showBackLink ? (
            <Button
              asChild
              variant="ghost"
              size="xs"
              className="justify-start text-sidebar-foreground/70 group-data-[collapsible=icon]:hidden"
            >
              <Link href="/admin/dashboard">
                <IconArrowLeft data-icon="inline-start" />
                {copy.admin}
              </Link>
            </Button>
          ) : null}
        </SidebarHeader>

        <SidebarContent className="px-2 py-2">
          {navGroups.map((group) => (
            <SidebarGroup key={group.title} className="px-0">
              <SidebarGroupLabel>{group.title}</SidebarGroupLabel>
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
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                size="lg"
                className="pointer-events-none"
              >
                <div>
                  <Avatar size="sm">
                    <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
                  </Avatar>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-sm font-medium">
                      {user.name}
                    </span>
                    <span className="truncate text-xs text-sidebar-foreground/65">
                      {ROLE_LABEL_VI[role]}
                    </span>
                  </span>
                </div>
              </SidebarMenuButton>
              <form action="/api/auth/signout" method="post">
                <SidebarMenuAction asChild>
                  <Button
                    type="submit"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={copy.signOut}
                  >
                    <IconLogout data-icon="inline-start" />
                  </Button>
                </SidebarMenuAction>
              </form>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset className="min-w-0 overflow-hidden">
        <header className="sticky top-0 z-20 flex shrink-0 flex-col border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="flex items-center gap-3 px-4 py-2 lg:px-6">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <SidebarTrigger className={triggerClass} />
              <Separator
                orientation="vertical"
                className="hidden h-4 md:block"
              />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  {breadcrumbSegments.length > 0 ? (
                    <Breadcrumb>
                      <BreadcrumbList>
                        {breadcrumbSegments.map((segment, idx) => (
                          <Fragment key={`${segment}-${String(idx)}`}>
                            <BreadcrumbItem>
                              <BreadcrumbPage className="font-normal text-muted-foreground">
                                {segment}
                              </BreadcrumbPage>
                            </BreadcrumbItem>
                            {idx < breadcrumbSegments.length - 1 && (
                              <BreadcrumbSeparator />
                            )}
                          </Fragment>
                        ))}
                      </BreadcrumbList>
                    </Breadcrumb>
                  ) : pageHeader.crumbLabel ? (
                    <Badge variant="outline">{pageHeader.crumbLabel}</Badge>
                  ) : null}
                </div>
                <span className="truncate font-heading text-base font-semibold">
                  {pageTitle}
                </span>
              </div>
              {pageHeader.headerExtras ? (
                <div className="hidden shrink-0 flex-wrap items-center gap-2 md:flex">
                  {pageHeader.headerExtras}
                </div>
              ) : null}
            </div>
            {pageHeader.actions ? (
              <div className="hidden shrink-0 flex-wrap items-center gap-2 md:flex">
                {pageHeader.actions}
              </div>
            ) : null}
          </div>
          {pageHeader.description ? (
            <p className="px-4 pb-3 text-sm text-muted-foreground lg:px-6">
              {pageHeader.description}
            </p>
          ) : null}
          {mobileHeaderExtras || pageHeader.actions ? (
            <>
              <Separator className="md:hidden" />
              <div className="flex flex-wrap items-center gap-2 px-4 py-2 md:hidden">
                {mobileHeaderExtras}
                {pageHeader.actions}
              </div>
            </>
          ) : null}
          {pageHeader.mobileTopBar ? (
            <>
              <Separator className="md:hidden" />
              <div className="px-4 py-2 md:hidden">{pageHeader.mobileTopBar}</div>
            </>
          ) : null}
        </header>

        <main
          id="main-content"
          className="flex-1 bg-muted/20 p-3 md:p-4 lg:p-6"
        >
          <div className="flex w-full flex-col gap-4">{children}</div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
