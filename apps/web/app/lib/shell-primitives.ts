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

export function formatPathSegment(segment: string): string {
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
