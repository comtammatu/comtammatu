"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
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
  ExternalLink,
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
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { toLegacyFromBetaPath, type BetaNavGroup } from "../_lib/routes";

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

function isItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function SurfaceNav({
  pathname,
  groups,
}: {
  pathname: string;
  groups: BetaNavGroup[];
}) {
  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <section key={group.title} className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">{group.title}</p>
          <div className="grid gap-2">
            {group.items.map((item) => {
              const Icon = ICON_MAP[item.icon] ?? LayoutDashboard;
              const active = isItemActive(pathname, item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    buttonVariants({
                      variant: active ? "secondary" : "ghost",
                      size: "default",
                    }),
                    "w-full justify-start gap-2",
                  )}
                >
                  <Icon className="size-4" />
                  <span className="truncate">{item.label}</span>
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
  const legacyHref = toLegacyFromBetaPath(pathname);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
        <Card>
          <CardHeader className="gap-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">Beta</Badge>
                  <Badge variant="outline">{roleLabel}</Badge>
                </div>
                <CardTitle>{workspaceTitle}</CardTitle>
                <CardDescription>{workspaceDescription}</CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  href="/beta"
                  className={buttonVariants({ variant: "outline", size: "default" })}
                >
                  Hub beta
                </Link>
                <Link
                  href={legacyHref}
                  className={buttonVariants({ variant: "outline", size: "default" })}
                >
                  Route hiện tại
                  <ExternalLink className="size-4" />
                </Link>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Separator />
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium">{userName}</p>
                <p className="text-sm text-muted-foreground">{roleLabel}</p>
              </div>
              <form action="/api/auth/signout" method="post">
                <input type="hidden" name="returnTo" value="/beta/login" />
                <button
                  type="submit"
                  className={buttonVariants({ variant: "outline", size: "default" })}
                >
                  Đăng xuất
                </button>
              </form>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-4">
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle>Điều hướng</CardTitle>
              <CardDescription>Giữ nguyên cây route beta hiện tại.</CardDescription>
            </CardHeader>
            <CardContent>
              <SurfaceNav pathname={pathname} groups={navGroups} />
            </CardContent>
          </Card>

          <div className="space-y-6 lg:col-span-3">{children}</div>
        </div>
      </div>
    </div>
  );
}
