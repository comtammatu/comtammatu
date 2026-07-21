"use client";

import { Fragment, useMemo, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronsUpDown as IconChevronsUpDown,
  LogOut as IconLogout,
} from "lucide-react";
import { cn } from "@comtammatu/ui";
import { Avatar, AvatarFallback } from "@comtammatu/ui/components/avatar";
import { Button } from "@comtammatu/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@comtammatu/ui/components/dropdown-menu";
import { useIsMobile } from "@comtammatu/ui/hooks/use-mobile";
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
import { OwnerBottomNav } from "@/components/owner-bottom-nav";
import { ThemeMenuItem } from "@/components/theme-toggle";
import { SectionLabel } from "@comtammatu/ui/components/section-label";
import { messages } from "@lib/messages";

export interface AppShellProps {
  children: ReactNode;
  user: { name: string };
  /** Primary module tabs for the single sidebar. */
  tier1: ShellNavItem[];
  /** Sub-tabs for the active primary tab. */
  tier2: ShellNavGroup[];
  sidebarHeaderAccessory?: ReactNode;
  /**
   * Mobile-only Owner bottom navbar (same nav model as the sidebar + drawer
   * trigger). Default true for all Owner shells.
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
  sidebarHeaderAccessory,
  bottomNav = true,
}: AppShellProps) {
  const pathname = usePathname();
  const isTouchLayout = useIsMobile(1024);
  const copy = messages.common;
  const activePrimaryItem = useMemo(
    () => findActivePrimaryNavItem(tier1, pathname),
    [tier1, pathname],
  );
  const showBottomNav = bottomNav;

  return (
    <SidebarProvider
      open={true}
      style={
        showBottomNav
          ? ({
              "--app-bottom-nav-offset":
                "calc(3.5rem + max(0.5rem, env(safe-area-inset-bottom)))",
            } as CSSProperties)
          : undefined
      }
    >
      <Sidebar variant="inset" collapsible="offcanvas">
        <SidebarHeader className="relative overflow-hidden border-b bg-gradient-to-br from-sidebar via-sidebar/50 to-sidebar/10 px-4 py-2">
          <div className="relative z-10 flex items-center gap-2">
            <BrandLogoBox tone="sidebar" className="size-8 p-0.5">
              <BrandMark
                variant="seal"
                alt={copy.brandName}
                className="size-full"
              />
            </BrandLogoBox>
            <p className="min-w-0 flex-1 font-heading text-sm font-semibold leading-tight">
              {copy.brandShortName}
            </p>
          </div>
          {sidebarHeaderAccessory ? (
            <div className="relative z-10 mt-1">{sidebarHeaderAccessory}</div>
          ) : null}
        </SidebarHeader>

        <SidebarContent className="px-2 py-2">
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
                        isActive={active}
                        size={isTouchLayout ? "lg" : "default"}
                        tooltip={item.label}
                        className="relative rounded-md data-active:bg-primary/10 data-active:text-primary font-medium dark:data-active:bg-primary/15 before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-r-sm before:bg-primary before:opacity-0 data-active:before:opacity-100 before:transition-opacity"
                        render={
                          <Link
                            href={item.href}
                            aria-current={active ? "page" : undefined}
                          >
                            <Icon />
                            <span>{item.label}</span>
                          </Link>
                        }
                      />
                      {subNavGroups.length > 0 ? (
                        <SidebarMenuSub>
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
                                      className="relative data-active:bg-transparent data-active:text-primary data-active:font-semibold dark:data-active:text-primary-foreground before:absolute before:-left-2.5 before:top-3 before:size-1.5 before:rounded-full before:bg-primary before:opacity-0 data-active:before:opacity-100 before:transition-opacity"
                                      render={
                                        <Link
                                          href={subItem.linkHref ?? subItem.href}
                                          aria-current={
                                            subActive ? "page" : undefined
                                          }
                                        >
                                          <SubIcon />
                                          <span>{subItem.label}</span>
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
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="border-t px-2 py-1">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size={isTouchLayout ? "touch" : "default"}
                  className="w-full justify-start gap-2 px-2 text-left text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                />
              }
            >
              <Avatar size="sm">
                <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
              </Avatar>
              <span className="min-w-0 flex-1 truncate text-xs font-medium">
                {user.name}
              </span>
              <IconChevronsUpDown className="ml-auto text-sidebar-foreground/60" />
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start">
              <DropdownMenuGroup>
                <ThemeMenuItem className="min-h-12 text-sm" />
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <form action="/api/auth/signout" method="post">
                  <DropdownMenuItem
                    nativeButton
                    variant="destructive"
                    className="min-h-12 w-full text-sm"
                    render={<Button type="submit" variant="ghost" />}
                  >
                    <IconLogout />
                    {copy.signOut}
                  </DropdownMenuItem>
                </form>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset id="main-content" className="chrome-safe-pt">
        <div
          className={cn("flex-1 p-3 md:p-4", showBottomNav && "pb-24 lg:pb-4")}
        >
          <AppShellPaddingBoundary>
            <div className="flex min-h-0 flex-col gap-4">{children}</div>
          </AppShellPaddingBoundary>
        </div>
      </SidebarInset>
      {showBottomNav ? <OwnerBottomNav tier1={tier1} tier2={tier2} /> : null}
    </SidebarProvider>
  );
}
