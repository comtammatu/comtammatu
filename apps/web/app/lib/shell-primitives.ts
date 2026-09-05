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
  "hr.checkout_requested": "/hr/attendance",
  "hr.checkout_approved": "/me/clock",
  "hr.checkout_rejected": "/me/clock",
  "hr.leave_approved": "/me/schedule/leave",
  "hr.leave_rejected": "/me/schedule/leave",
  "hr.leave_requested": "/hr/attendance",
  "hr.payroll_period_ready": "/hr/payroll",
  "inventory.count_slip_submitted": "/inventory/count-slips",
  "inventory.count_slip_recount": "/inventory/count-slips",
  "inventory.stock_low": "/inventory/stock",
  "inventory.stocktake_conflict": "/inventory/stocktake",
  "inventory.waste.weekly_report": "/inventory/waste/approvals",
  "inventory.waste_pending_approval": "/inventory/waste/approvals",
  "inventory.stock_request_submitted": "/inventory/transfers",
  "inventory.stock_request_rejected": "/inventory/transfers",
  "inventory.valuation_variance": "/finance/supplier-invoices",
  "inventory.valuation_reconciliation_failed": "/finance/food-cost",
  "inventory.pos_stock_shortfall": "/inventory/stock",
  "procurement.purchase_request_submitted": "/inventory/purchase-orders",
  "procurement.po_pending_approval": "/inventory/purchase-orders",
  "workflow.grn_pending": "/inventory/grn",
  "workflow.po_approved": "/inventory/purchase-orders",
  "workflow.po_sent": "/inventory/purchase-orders",
  "workflow.transfer_in_transit": "/inventory/transfers",
  "pos.void_requested": "/orders",
  "pos.void_resolved": "/orders",
  "pos.void_rejected": "/orders",
  "pos.kds_out_of_stock": "/orders",
  "order.delay_sla_breach": "/orders",
  "work.task_assigned": "/work",
};

/** FYI / history kinds stay in the feed but must not badge work-queue nav. */
const NAV_BADGE_EXCLUDED_KINDS: ReadonlySet<string> = new Set([
  "inventory.stocktake_completed",
]);

// Only the match-relevant fields are read here, so the parameter is the
// `Pick` of those — letting icon-less navs (settings tabs) route their
// active-state through this single helper without inventing placeholder data.
export type NavMatchTarget = Pick<
  ShellNavItem,
  "href" | "exact" | "matchPrefixes"
>;

function navPath(href: string): string {
  return href.split(/[?#]/, 1)[0] ?? href;
}

export function isNavItemActive(
  item: NavMatchTarget,
  pathname: string,
): boolean {
  const href = navPath(item.href);
  if (pathname === href) return true;
  if (item.exact) {
    return item.matchPrefixes?.some((p) => pathname.startsWith(p)) ?? false;
  }
  if (pathname.startsWith(href + "/")) return true;
  return item.matchPrefixes?.some((p) => pathname.startsWith(p)) ?? false;
}

// Longest-href-first so a deep entry wins over a coarser ancestor when both
// match the active pathname.
export function findActivePrimaryNavItem(
  tier1: ShellNavItem[],
  pathname: string,
): ShellNavItem | undefined {
  return [...tier1]
    .sort((a, b) => navPath(b.href).length - navPath(a.href).length)
    .find((item) => isNavItemActive(item, pathname));
}

function notificationKindTargetPath(kind: string): string | null {
  // Prefer action_url for POS variance — lands on branch pos-sessions, not Finance.
  if (kind === "pos.shift_variance") return null;
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
  if (kind.startsWith("work.")) return "/work";
  if (kind.startsWith("system.")) return "/settings";
  return null;
}

export function getNavNotificationCount(
  item: NavMatchTarget,
  targets: readonly ShellNotificationTarget[],
): number {
  return targets.reduce((total, target) => {
    if (NAV_BADGE_EXCLUDED_KINDS.has(target.kind)) return total;
    const actionPath = target.actionUrl?.split(/[?#]/, 1)[0] ?? null;
    const targetPath = notificationKindTargetPath(target.kind) ?? actionPath;
    const isMatched =
      Boolean(targetPath && isNavItemActive(item, targetPath)) ||
      Boolean(actionPath && item.href.startsWith("/br/") && isNavItemActive(item, actionPath));
    return isMatched ? total + target.unreadCount : total;
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
