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

export function isNavItemActive(item: ShellNavItem, pathname: string): boolean {
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

const PATH_SEGMENT_LABELS_VI: Record<string, string> = {
  accounting: "Kế toán",
  admin: "Quản trị",
  audit: "Nhật ký quyền hạn",
  branches: "Điểm vận hành",
  crm: "Khách hàng",
  dashboard: "Tổng quan vận hành",
  feedback: "Phản ánh khách",
  finance: "Tài chính",
  general: "Cài đặt chung",
  "inventory-value": "Giá trị tồn kho",
  jobs: "Job in",
  kds: "Trạm bếp",
  payments: "Thanh toán",
  periods: "Kỳ kế toán",
  pos: "POS",
  printers: "Máy in",
  qr: "Mã QR",
  reports: "Báo cáo",
  revenue: "Doanh thu",
  settings: "Cài đặt",
  staff: "Nhân viên",
  "stock-movement": "Biến động tồn kho",
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
