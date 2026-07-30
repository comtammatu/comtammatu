import type { ElementType } from "react";

export interface ShellNavItem {
  href: string;
  linkHref?: string;
  label: string;
  icon: ElementType;
  badgeCount?: number;
  exact?: boolean;
  matchPrefixes?: string[];
}

export interface ShellNavGroup {
  title: string;
  items: ShellNavItem[];
}

export interface ShellNotificationTarget {
  kind: string;
  actionUrl: string | null;
  unreadCount: number;
}

const NOTIFICATION_KIND_TARGET_PATH: Readonly<Record<string, string>> = {
  "attendance.checkout_requested": "/hr/attendance",
  "hr.leave_approved": "/hr/attendance",
  "hr.leave_rejected": "/hr/attendance",
  "hr.leave_requested": "/hr/attendance",
  "inventory.expiry_soon": "/inventory/stock",
  "inventory.stock_low": "/inventory/stock",
  "inventory.stock_request_submitted": "/inventory/transfers",
  "pos.shift_variance": "/finance",
  "procurement.purchase_request_submitted": "/inventory/purchase-orders",
  "procurement.po_pending_approval": "/inventory/purchase-orders",
  "workflow.grn_pending": "/inventory/grn",
  "workflow.po_approved": "/inventory/purchase-orders",
  "workflow.po_sent": "/inventory/purchase-orders",
  "workflow.transfer_in_transit": "/inventory/transfers",
};

// Only the match-relevant fields are read here, so the parameter is the
// `Pick` of those — letting icon-less navs (settings tabs) route their
// active-state through this single helper without inventing placeholder data.
export type NavMatchTarget = Pick<
  ShellNavItem,
  "href" | "exact" | "matchPrefixes"
>;

export function isNavItemActive(
  item: NavMatchTarget,
  pathname: string,
): boolean {
  if (pathname === item.href) return true;
  if (item.exact) {
    return item.matchPrefixes?.some((p) => pathname.startsWith(p)) ?? false;
  }
  if (pathname.startsWith(item.href + "/")) return true;
  return item.matchPrefixes?.some((p) => pathname.startsWith(p)) ?? false;
}

// Longest-href-first so a deep entry wins over a coarser ancestor when both
// match the active pathname.
export function findActivePrimaryNavItem(
  tier1: ShellNavItem[],
  pathname: string,
): ShellNavItem | undefined {
  return [...tier1]
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) => isNavItemActive(item, pathname));
}

function notificationKindTargetPath(kind: string): string | null {
  const targetPath = NOTIFICATION_KIND_TARGET_PATH[kind];
  if (targetPath) return targetPath;
  if (
    kind.startsWith("inventory.") ||
    kind.startsWith("procurement.") ||
    kind.startsWith("workflow.")
  ) {
    return "/inventory";
  }
  if (kind.startsWith("hr.") || kind.startsWith("attendance.")) return "/hr";
  if (kind.startsWith("pos.")) return "/orders";
  if (kind.startsWith("feedback.")) return "/feedback";
  if (kind.startsWith("menu.")) return "/menu";
  if (kind.startsWith("system.")) return "/settings";
  return null;
}

export function getNavNotificationCount(
  item: NavMatchTarget,
  targets: readonly ShellNotificationTarget[],
): number {
  return targets.reduce((total, target) => {
    const actionPath = target.actionUrl?.split(/[?#]/, 1)[0] ?? null;
    const targetPath = notificationKindTargetPath(target.kind) ?? actionPath;
    return targetPath && isNavItemActive(item, targetPath)
      ? total + target.unreadCount
      : total;
  }, 0);
}

export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .join("")
    .toUpperCase()
    .slice(0, 2);
}
