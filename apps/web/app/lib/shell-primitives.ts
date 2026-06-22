import type { ElementType } from "react";

export interface ShellNavItem {
  href: string;
  label: string;
  icon: ElementType;
  exact?: boolean;
  matchPrefixes?: string[];
}

export interface ShellNavGroup {
  title: string;
  items: ShellNavItem[];
}

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

export function findActiveNavItem(
  groups: ShellNavGroup[],
  pathname: string,
): ShellNavItem | undefined {
  for (const group of groups) {
    for (const item of group.items) {
      if (isNavItemActive(item, pathname)) return item;
    }
  }
  return undefined;
}

// Longest-href-first so a deep entry (e.g. /admin/reports) wins over a coarser
// ancestor (e.g. /admin) when both match the active pathname.
export function findActiveRailItem(
  tier1: ShellNavItem[],
  pathname: string,
): ShellNavItem | undefined {
  return [...tier1]
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) => isNavItemActive(item, pathname));
}

const PATH_SEGMENT_LABELS_VI: Record<string, string> = {
  admin: "Quản trị",
  audit: "Nhật ký quyền hạn",
  branches: "Điểm vận hành",
  dashboard: "Tổng quan vận hành",
  expenses: "Chi vận hành",
  finance: "Tài chính",
  "food-cost": "Giá vốn món",
  general: "Cài đặt chung",
  "inventory-value": "Giá trị tồn kho",
  invoices: "Hóa đơn điện tử",
  jobs: "Lệnh in",
  kds: "Trạm bếp",
  payments: "Thanh toán",
  payroll: "Đối soát lương",
  pos: "POS",
  "pos-sessions": "Đối soát ca POS",
  printers: "Máy in",
  qr: "Mã QR",
  reports: "Báo cáo",
  revenue: "Doanh thu",
  settings: "Cài đặt",
  staff: "Nhân viên",
  "stock-movement": "Biến động tồn kho",
  summary: "HĐ khách không lấy hóa đơn",
  tables: "Bàn",
};

export function formatPathSegment(segment: string): string {
  const normalizedSegment = decodeURIComponent(segment).toLowerCase();
  const label = PATH_SEGMENT_LABELS_VI[normalizedSegment];
  if (label) return label;

  return segment.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
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
