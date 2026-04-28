"use client";

import { useMemo, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft as IconArrowLeft, ChartBar as IconChartBar, Book as IconBook, CalendarDays as IconCalendarEvent, FileText as IconFileText, LogOut as IconLogout, Receipt as IconReceipt, ScrollText as IconScrollText, SlidersHorizontal as IconSettings2, Wallet as IconWallet } from "lucide-react";
import type { StaffRole } from "@comtammatu/shared/auth";
import { ROLE_LABEL_VI } from "@comtammatu/shared/auth";
import { Avatar, AvatarFallback } from "@comtammatu/ui/components/avatar";
import { Badge } from "@comtammatu/ui/components/badge";
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

const NAV_GROUPS: ShellNavGroup[] = [
  {
    title: "Tổng quan",
    items: [{ href: "/finance", label: "Tài chính", icon: IconWallet }],
  },
  {
    title: "Kế toán",
    items: [
      {
        href: "/finance/chart-of-accounts",
        label: "Hệ thống tài khoản",
        icon: IconBook,
      },
      { href: "/finance/journal", label: "Sổ nhật ký", icon: IconFileText },
      {
        href: "/finance/posting-rules",
        label: "Quy tắc hạch toán",
        icon: IconSettings2,
      },
    ],
  },
  {
    title: "Báo cáo",
    items: [
      {
        href: "/finance/statements",
        label: "Báo cáo tài chính",
        icon: IconChartBar,
      },
      { href: "/finance/food-cost", label: "Giá vốn món", icon: IconReceipt },
    ],
  },
  {
    title: "Chu kỳ",
    items: [
      { href: "/finance/periods", label: "Kỳ kế toán", icon: IconCalendarEvent },
    ],
  },
  {
    title: "Kiểm toán",
    items: [
      {
        href: "/finance/audit-trail",
        label: "Nhật ký kiểm toán",
        icon: IconScrollText,
      },
    ],
  },
];

function resolveTitle(pathname: string) {
  const active = findActiveNavItem(NAV_GROUPS, pathname);
  if (!active) return "Tài chính";

  const pathTail = pathname
    .slice(active.href.length)
    .split("/")
    .filter(Boolean)
    .map((segment) => formatPathSegment(segment));

  return pathTail[pathTail.length - 1] ?? active.label;
}

export interface FinanceShellProps {
  children: ReactNode;
  user: { name: string };
  role: StaffRole;
}

export function FinanceShell({ children, user, role }: FinanceShellProps) {
  const pathname = usePathname();
  const pageTitle = useMemo(() => resolveTitle(pathname), [pathname]);

  return (
    <SidebarProvider>
      <Sidebar variant="inset">
        <SidebarHeader className="gap-3 p-4">
          <Link
            href="/admin/dashboard"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-sidebar-foreground/65 hover:text-sidebar-foreground group-data-[collapsible=icon]:hidden"
          >
            <IconArrowLeft className="size-3.5" />
            Quản trị
          </Link>
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
              <IconWallet className="size-5" />
            </div>
            <div className="min-w-0 space-y-0.5 group-data-[collapsible=icon]:hidden">
              <p className="text-xs font-semibold uppercase tracking-wide text-sidebar-foreground/60">
                Chuyên trách
              </p>
              <p className="text-lg font-semibold leading-none">Tài chính</p>
            </div>
          </div>
        </SidebarHeader>

        <SidebarContent className="px-2 pb-4">
          {NAV_GROUPS.map((group) => (
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
                aria-label="Đăng xuất"
              >
                <IconLogout className="size-4" />
              </Button>
            </form>
          </div>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <header className="flex flex-col gap-4 border-b p-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex-1 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <SidebarTrigger className="md:hidden" />
              <Badge variant="outline">Kế toán · Tài chính</Badge>
              <Badge variant="secondary">{ROLE_LABEL_VI[role]}</Badge>
            </div>
            <div className="space-y-1.5">
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                {pageTitle}
              </h1>
              <p className="max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
                Tập trung sổ sách, báo cáo và HĐĐT trong cùng cấu trúc điều
                hướng.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/dashboard">Quản trị</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/finance/statements">Báo cáo tài chính</Link>
            </Button>
          </div>
        </header>

        <main id="main-content" className="flex-1 p-4">
          <div className="space-y-4">{children}</div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
