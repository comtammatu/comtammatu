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
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@comtammatu/ui/components/sidebar";
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

  return (
    <SidebarProvider>
      <Sidebar variant="inset" collapsible={collapsible}>
        <SidebarHeader className="gap-3 p-4">
          {showBackLink ? (
            <Link
              href="/admin/dashboard"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-sidebar-foreground/65 hover:text-sidebar-foreground group-data-[collapsible=icon]:hidden"
            >
              <IconArrowLeft className="size-3.5" />
              {copy.admin}
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
                <span className="truncate text-sm font-medium">
                  {pageTitle}
                </span>
                <h1 className="font-heading sr-only">{pageTitle}</h1>
              </div>
            </div>
            {pageHeader.actions ? (
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {pageHeader.actions}
              </div>
            ) : null}
          </div>
        </header>

        <main id="main-content" className="flex-1 p-4">
          <div className="space-y-4">{children}</div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
