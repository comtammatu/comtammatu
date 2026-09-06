"use client";

import {
  ChefHat,
  CreditCard,
  FileText,
  ListOrdered,
  Volume2,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  canAccess,
  type BranchKind,
  type ResolvedBranchPrimaryTab,
  type StaffRole,
} from "@comtammatu/shared/auth";
import { APP_COPY_VI } from "@comtammatu/shared/labels";
import { cn } from "@comtammatu/ui";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { isNavItemActive, type ShellNavItem } from "@/lib/shell-primitives";
import { messages } from "@lib/messages";
import type { BranchNavBadgeCounts } from "./_lib/branch-nav-badges";
import {
  centralResidualNavItems,
  pendingBadgeLabel,
  projectPrimaryTabs,
} from "./operator-bottom-nav";

export function OperatorDesktopNav({
  branchId,
  tabs,
  branchKind = "branch",
  badges,
  userRole,
}: {
  branchId: number;
  tabs: readonly ResolvedBranchPrimaryTab[];
  branchKind?: BranchKind;
  badges?: BranchNavBadgeCounts;
  userRole: StaffRole;
}) {
  const pathname = usePathname();

  const items: ShellNavItem[] =
    branchKind !== "branch"
      ? centralResidualNavItems(branchId, branchKind)
      : projectPrimaryTabs(tabs, badges);

  const hasPosAccess = canAccess(userRole, "pos") && branchKind === "branch";
  const hasKdsAccess = canAccess(userRole, "kds") && branchKind === "branch";
  const hasPickupAccess = canAccess(userRole, "pickup") && branchKind === "branch";

  return (
    <aside
      aria-label={APP_COPY_VI.operatorAriaLabel}
      className="hidden lg:flex lg:w-60 lg:flex-col lg:shrink-0 lg:border-r lg:border-border/70 lg:bg-card/40 select-none print:hidden"
    >
      {(hasPosAccess || hasKdsAccess || hasPickupAccess) ? (
        <div className="flex flex-col gap-2 p-3 border-b border-border/60">
          <p className="px-1 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
            {messages.operator.nav.stationsSection}
          </p>
          {hasPosAccess ? (
            <Button
              variant="outline"
              size="touch"
              className="justify-start gap-2 px-3 font-medium border-primary/20 text-primary hover:bg-primary/10 active:scale-[0.97]"
              render={<Link href={`/br/${branchId}/pos`} />}
            >
              <CreditCard className="size-4 shrink-0 text-primary" />
              <span className="truncate">{messages.operator.nav.posStation}</span>
            </Button>
          ) : null}
          {hasKdsAccess ? (
            <Button
              variant="outline"
              size="touch"
              className="justify-start gap-2 px-3 font-medium border-border/80 hover:bg-muted active:scale-[0.97]"
              render={<Link href={`/br/${branchId}/kds`} />}
            >
              <ChefHat className="size-4 shrink-0 text-warning" />
              <span className="truncate">{messages.operator.nav.kdsStation}</span>
            </Button>
          ) : null}
          {hasPickupAccess ? (
            <Button
              variant="outline"
              size="touch"
              className="justify-start gap-2 px-3 font-medium border-border/80 hover:bg-muted active:scale-[0.97]"
              render={<Link href={`/br/${branchId}/pickup`} />}
            >
              <Volume2 className="size-4 shrink-0 text-info" />
              <span className="truncate">{messages.operator.nav.pickupStation}</span>
            </Button>
          ) : null}
        </div>
      ) : null}

      <nav className="flex flex-col gap-1 p-3 flex-1 overflow-y-auto">
        <p className="px-1 py-1 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
          {messages.operator.nav.workspacesSection}
        </p>
        {items.map((item) => {
          const Icon = item.icon;
          const badgeCount = item.badgeCount ?? 0;
          const hasBadge = badgeCount > 0;
          const active = isNavItemActive(item, pathname);
          return (
            <Button
              key={item.href}
              variant="ghost"
              size="touch"
              data-active={active ? "true" : undefined}
              className={cn(
                "justify-start gap-3 px-3 text-sm font-medium rounded-md w-full transition-colors active:scale-[0.97]",
                active
                  ? "bg-primary/10 text-primary font-semibold hover:bg-primary/15"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
              render={
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                />
              }
            >
              <Icon className="size-5 shrink-0" />
              <span className="flex-1 truncate text-left">{item.label}</span>
              {hasBadge ? (
                <Badge
                  variant="secondary"
                  className="ml-auto h-5 min-w-5 justify-center rounded-full px-1.5 text-3xs font-semibold"
                >
                  {badgeCount > 99 ? "99+" : badgeCount}
                </Badge>
              ) : null}
              {hasBadge ? (
                <span className="sr-only">{pendingBadgeLabel(badgeCount)}</span>
              ) : null}
            </Button>
          );
        })}
      </nav>

      {branchKind === "branch" ? (
        <div className="mt-auto border-t border-border/60 p-3 flex flex-col gap-1">
          <p className="px-1 py-1 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
            {messages.operator.nav.shortcutsSection}
          </p>
          <Button
            variant="ghost"
            size="touch"
            className={cn(
              "justify-start gap-2 px-3 text-sm font-medium rounded-md w-full text-muted-foreground hover:bg-muted hover:text-foreground active:scale-[0.97]",
              pathname.startsWith(`/br/${branchId}/orders`) &&
                "bg-primary/10 text-primary font-semibold",
            )}
            render={<Link href={`/br/${branchId}/orders`} />}
          >
            <ListOrdered className="size-4 shrink-0" />
            <span className="truncate">{messages.operator.nav.ordersShortcut}</span>
          </Button>
          <Button
            variant="ghost"
            size="touch"
            className={cn(
              "justify-start gap-2 px-3 text-sm font-medium rounded-md w-full text-muted-foreground hover:bg-muted hover:text-foreground active:scale-[0.97]",
              pathname.startsWith(`/br/${branchId}/close-day`) &&
                "bg-primary/10 text-primary font-semibold",
            )}
            render={<Link href={`/br/${branchId}/close-day`} />}
          >
            <FileText className="size-4 shrink-0" />
            <span className="truncate">{messages.operator.nav.closeDayShortcut}</span>
          </Button>
        </div>
      ) : null}
    </aside>
  );
}
