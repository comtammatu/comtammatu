"use client";

import type { LucideIcon } from "lucide-react";

export interface ShellNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  matchPrefixes?: string[];
}

export interface ShellNavGroup {
  title: string;
  items: ShellNavItem[];
}

export function isNavItemActive(item: ShellNavItem, pathname: string): boolean {
  if (pathname === item.href || pathname.startsWith(`${item.href}/`)) {
    return true;
  }

  return (
    item.matchPrefixes?.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    ) ?? false
  );
}

export function findActiveNavItem(
  groups: ShellNavGroup[],
  pathname: string,
): ShellNavItem | null {
  const items = groups.flatMap((group) => group.items);

  return (
    items
      .filter((item) => isNavItemActive(item, pathname))
      .sort((left, right) => right.href.length - left.href.length)[0] ?? null
  );
}

export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0] ?? "")
    .filter(Boolean)
    .slice(-2)
    .join("")
    .toUpperCase();
}

export function formatPathSegment(segment: string): string {
  if (/^\d+$/.test(segment)) {
    return `#${segment}`;
  }

  return decodeURIComponent(segment)
    .replaceAll("-", " ")
    .replaceAll("_", " ")
    .split(" ")
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}
