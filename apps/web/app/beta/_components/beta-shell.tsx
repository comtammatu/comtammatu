"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpRight,
  BadgeDollarSign,
  BarChart3,
  BookCopy,
  BookOpenText,
  Boxes,
  BriefcaseBusiness,
  Building2,
  CalendarRange,
  Carrot,
  ChefHat,
  ClipboardList,
  CookingPot,
  ExternalLink,
  Factory,
  FileSpreadsheet,
  FileText,
  HeartHandshake,
  Hourglass,
  LayoutDashboard,
  LayoutGrid,
  Map,
  Menu,
  Monitor,
  NotebookText,
  PackageMinus,
  PackageSearch,
  Receipt,
  Settings,
  ShoppingCart,
  SlidersHorizontal,
  Sparkles,
  SquarePen,
  TrendingUp,
  Truck,
  Users,
  UtensilsCrossed,
  Wallet,
  Waypoints,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toLegacyFromBetaPath, type BetaNavGroup } from "../_lib/routes";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const ICON_MAP: Record<string, LucideIcon> = {
  ArrowDownToLine,
  ArrowLeftRight,
  BadgeDollarSign,
  BarChart3,
  BookCopy,
  BookOpenText,
  Boxes,
  BriefcaseBusiness,
  Building2,
  CalendarRange,
  Carrot,
  ChefHat,
  ClipboardList,
  CookingPot,
  Factory,
  FileSpreadsheet,
  FileText,
  HeartHandshake,
  Hourglass,
  LayoutDashboard,
  LayoutGrid,
  Map,
  Monitor,
  NotebookText,
  PackageMinus,
  PackageSearch,
  Receipt,
  Settings,
  ShoppingCart,
  SlidersHorizontal,
  SquarePen,
  TrendingUp,
  Truck,
  Users,
  UtensilsCrossed,
  Wallet,
  Waypoints,
};

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0] ?? "")
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function isItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function SurfaceNav({
  pathname,
  groups,
  onNavigate,
}: {
  pathname: string;
  groups: BetaNavGroup[];
  onNavigate?: () => void;
}) {
  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <section key={group.title} className="space-y-2">
          <p className="px-1 text-xs font-semibold uppercase tracking-widest text-sidebar-foreground/45">
            {group.title}
          </p>
          <div className="space-y-1.5">
            {group.items.map((item) => {
              const Icon = ICON_MAP[item.icon] ?? LayoutDashboard;
              const active = isItemActive(pathname, item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  className={cn(
                    "group flex items-center gap-3 rounded-3xl border px-3 py-3 transition-all duration-200",
                    active
                      ? "border-sidebar-primary/45 bg-sidebar-primary text-sidebar-primary-foreground shadow-lg"
                      : "border-transparent bg-sidebar-accent/35 text-sidebar-foreground/74 hover:border-sidebar-border hover:bg-sidebar-accent hover:text-sidebar-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-10 shrink-0 items-center justify-center rounded-2xl border",
                      active
                        ? "border-white/10 bg-white/10"
                        : "border-sidebar-border/60 bg-black/10",
                    )}
                  >
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {item.label}
                  </span>
                  <ArrowUpRight className="size-4 opacity-40 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

export function BetaShell({
  workspaceTitle,
  workspaceDescription,
  navGroups,
  userName,
  roleLabel,
  children,
}: {
  workspaceTitle: string;
  workspaceDescription: string;
  navGroups: BetaNavGroup[];
  userName: string;
  roleLabel: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const legacyHref = useMemo(() => toLegacyFromBetaPath(pathname), [pathname]);

  return (
    <div data-beta-ui className="beta-grain min-h-screen p-3 sm:p-4 lg:p-5">
      <div className="mx-auto flex min-h-[calc(100vh-1.5rem)] w-full max-w-screen-2xl gap-4 lg:min-h-[calc(100vh-2.5rem)]">
        <aside className="beta-shell hidden w-80 shrink-0 lg:flex lg:flex-col">
          <div className="p-5">
            <div className="rounded-4xl border border-white/8 bg-white/5 p-5">
              <div className="flex items-center justify-between gap-3">
                <Badge
                  variant="secondary"
                  className="rounded-full border border-white/10 bg-white/8 px-3 py-1 text-xs uppercase tracking-widest text-sidebar-foreground"
                >
                  Beta Ops
                </Badge>
                <Sparkles className="size-4 text-sidebar-primary" />
              </div>
              <h1 className="mt-5 font-heading text-3xl leading-none tracking-tight text-sidebar-foreground">
                {workspaceTitle}
              </h1>
              <p className="mt-3 text-sm leading-6 text-sidebar-foreground/68">
                {workspaceDescription}
              </p>
            </div>
          </div>

          <Separator className="bg-sidebar-border/70" />

          <ScrollArea className="min-h-0 flex-1 px-4 pb-4">
            <div className="pt-4">
              <SurfaceNav pathname={pathname} groups={navGroups} />
            </div>
          </ScrollArea>

          <div className="p-4 pt-0">
            <div className="rounded-4xl border border-sidebar-border/70 bg-black/10 p-4">
              <p className="text-xs uppercase tracking-widest text-sidebar-foreground/42">
                Legacy bridge
              </p>
              <p className="mt-2 text-sm leading-6 text-sidebar-foreground/70">
                Beta đang đồng bộ dần từng workflow. Bạn luôn có thể quay lại bề mặt hiện tại khi cần thao tác sâu.
              </p>
              <Button
                asChild
                variant="secondary"
                className="mt-4 h-10 w-full rounded-2xl border border-white/10 bg-white/10 text-sidebar-foreground hover:bg-white/16"
              >
                <Link href={legacyHref}>
                  Mở route hiện tại
                  <ExternalLink className="size-4" />
                </Link>
              </Button>
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <div className="beta-paper flex min-h-full flex-col">
            <header className="border-b border-border/55 px-4 py-4 sm:px-6 lg:px-7">
              <div className="flex flex-wrap items-center gap-3">
                <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                  <SheetTrigger asChild>
                    <Button
                      variant="outline"
                      className="h-11 rounded-2xl border-border/70 bg-background/80 px-3 lg:hidden"
                    >
                      <Menu className="size-4" />
                      Menu
                    </Button>
                  </SheetTrigger>
                  <SheetContent
                    side="left"
                    className="beta-shell w-80 border-none p-0 text-sidebar-foreground"
                    showCloseButton={false}
                  >
                    <div className="flex items-center justify-between px-5 py-4">
                      <div>
                        <SheetTitle className="font-heading text-2xl text-sidebar-foreground">
                          {workspaceTitle}
                        </SheetTitle>
                        <SheetDescription className="mt-1 text-sidebar-foreground/65">
                          {workspaceDescription}
                        </SheetDescription>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="rounded-2xl text-sidebar-foreground hover:bg-white/10"
                        onClick={() => setMobileOpen(false)}
                      >
                        <X className="size-4" />
                        <span className="sr-only">Đóng menu</span>
                      </Button>
                    </div>
                    <Separator className="bg-sidebar-border/70" />
                    <ScrollArea className="min-h-0 flex-1 px-4 pb-6">
                      <div className="pt-4">
                        <SurfaceNav
                          pathname={pathname}
                          groups={navGroups}
                          onNavigate={() => setMobileOpen(false)}
                        />
                      </div>
                    </ScrollArea>
                  </SheetContent>
                </Sheet>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="outline"
                      className="rounded-full border-border/70 bg-muted/50 px-3 py-1 uppercase tracking-widest"
                    >
                      {workspaceTitle}
                    </Badge>
                    <Badge
                      variant="secondary"
                      className="rounded-full bg-primary/10 px-3 py-1 text-primary"
                    >
                      Opt-in beta
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {workspaceDescription}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    asChild
                    variant="outline"
                    className="hidden h-11 rounded-2xl border-border/70 bg-background/80 px-4 sm:inline-flex"
                  >
                    <Link href={legacyHref}>
                      Route hiện tại
                      <ExternalLink className="size-4" />
                    </Link>
                  </Button>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        className="h-11 rounded-2xl border-border/70 bg-background/80 px-2.5"
                      >
                        <Avatar size="default" className="bg-muted">
                          <AvatarFallback>{getInitials(userName)}</AvatarFallback>
                        </Avatar>
                        <span className="hidden min-w-0 text-left sm:block">
                          <span className="block truncate text-sm font-medium text-foreground">
                            {userName}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {roleLabel}
                          </span>
                        </span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-64 rounded-2xl">
                      <DropdownMenuLabel className="px-3 py-2">
                        <div className="space-y-0.5">
                          <p className="font-medium text-foreground">{userName}</p>
                          <p className="text-xs text-muted-foreground">{roleLabel}</p>
                        </div>
                      </DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem asChild>
                        <Link href={legacyHref} className="cursor-pointer">
                          Mở bề mặt hiện tại
                          <ExternalLink className="ml-auto size-4" />
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem asChild>
                        <form action="/api/auth/signout" method="post" className="w-full">
                          <button type="submit" className="flex w-full items-center">
                            Đăng xuất
                          </button>
                        </form>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </header>

            <main id="main-content" className="flex-1 px-4 py-4 sm:px-6 lg:px-7 lg:py-6">
              {children}
            </main>
          </div>
        </div>
      </div>
    </div>
  );
}
