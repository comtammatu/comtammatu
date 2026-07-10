import type { ElementType } from "react";

export interface ShellNavItem {
  href: string;
  linkHref?: string;
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

export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .join("")
    .toUpperCase()
    .slice(0, 2);
}
