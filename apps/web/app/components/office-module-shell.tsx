"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Briefcase as IconBriefcase,
  Receipt as IconReceipt,
  ShieldCheck as IconShieldCheck,
  Utensils as IconUtensils,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import {
  canAccess,
  resolveRoleHomeLink,
  type StaffRole,
} from "@comtammatu/shared/auth";
import { APP_COPY_VI, MODULE_LABELS_VI } from "@comtammatu/shared/labels";
import { ORDER_VI } from "@comtammatu/shared/messages";
import { Button } from "@comtammatu/ui/components/button";
import { AppShell } from "@/components/app-shell";
import {
  findActiveNavItem,
  formatPathSegment,
  type ShellNavGroup,
} from "@/lib/shell-primitives";
import { resolveOfficeDeepNav, resolveOfficeRailItems } from "@/lib/office-nav";
import { messages } from "@lib/messages";

// Generic Management shell for modules whose chrome is the shared office rail +
// the module's own deep nav, and whose chrome carries no shell-scoped client
// state. Chrome lives in this client registry — keyed by a serializable `module`
// id — so layouts (server components) pass only the id across the RSC boundary,
// never an icon. Optional per-module knobs (back-link, breadcrumb-from-nav, a
// permission-gated header action) let admin ride this shell alongside
// hr/menu/orders.
// ponytail: the knobs are registry data, not new abstractions. Modules that own
// shell-scoped client state keep their own wrapper (finance: lifted realtime
// channel; inventory: branch-reactive nav + branch-filter/mobile header chrome).

export type OfficeModuleId = "admin" | "hr" | "menu" | "orders";

interface ModuleChrome {
  icon: LucideIcon;
  subLabel: string;
  mainLabel: string;
  defaultPageTitle: string;
  crumbLabel: string;
  description?: string;
  /** Show the role-home back link above the brand block; defaults to true. */
  showBackLink?: boolean;
  /** Render a multi-level breadcrumb from the active nav item instead of the
   *  static crumb badge. */
  breadcrumbFromNav?: boolean;
  /** Header action overriding the default role-home link; hidden unless
   *  `gateModule` is accessible. */
  action?: {
    href: string;
    label: string;
    gateModule?: Parameters<typeof canAccess>[1];
  };
}

const hrShell = messages.hr.shell;

const OFFICE_MODULE_CHROME: Record<OfficeModuleId, ModuleChrome> = {
  admin: {
    icon: IconShieldCheck,
    subLabel: "Cơm Tấm Má Tư",
    mainLabel: "Quản trị",
    defaultPageTitle: APP_COPY_VI.adminSurface,
    crumbLabel: APP_COPY_VI.storeManagement,
    showBackLink: false,
    breadcrumbFromNav: true,
    action: {
      href: "/employee",
      label: MODULE_LABELS_VI.employee,
      gateModule: "employee",
    },
  },
  hr: {
    icon: IconBriefcase,
    subLabel: hrShell.brandSubLabel,
    mainLabel: APP_COPY_VI.hrWorkspace,
    defaultPageTitle: hrShell.defaultPageTitle,
    crumbLabel: APP_COPY_VI.hrWorkspaceSubtitle,
    description: hrShell.pageDescription,
  },
  menu: {
    icon: IconUtensils,
    subLabel: "Chuyên trách",
    mainLabel: MODULE_LABELS_VI.menu,
    defaultPageTitle: MODULE_LABELS_VI.menu,
    crumbLabel: MODULE_LABELS_VI.menu,
    description:
      "Nhập danh mục, món ăn, biến thể và topping cho toàn chuỗi tại cùng một nơi.",
  },
  orders: {
    icon: IconReceipt,
    subLabel: "Đối soát",
    mainLabel: ORDER_VI.long,
    defaultPageTitle: "Đơn hàng",
    crumbLabel: "Đối soát · Đơn hàng",
    description:
      "Tra cứu lịch sử đơn hàng, xử lý hoàn tiền và đối soát doanh thu.",
  },
};

// Dynamic breadcrumb trail from the active nav item. Only admin opts in via
// `breadcrumbFromNav`; the office modules show the static crumb badge.
function buildBreadcrumbTrail(
  pathname: string,
  groups: ShellNavGroup[],
): Array<{ label: string; href?: string }> {
  const active = findActiveNavItem(groups, pathname);
  if (!active) return [{ label: APP_COPY_VI.adminSurface }];
  const tailSegments = pathname
    .slice(active.href.length)
    .split("/")
    .filter(Boolean);
  let accumulatedHref = active.href;
  const pathTail = tailSegments.map((segment) => {
    accumulatedHref = `${accumulatedHref}/${segment}`;
    return { label: formatPathSegment(segment), href: accumulatedHref };
  });
  return [
    { label: APP_COPY_VI.adminSurface, href: "/admin/dashboard" },
    { label: active.label, href: active.href },
    ...pathTail,
  ];
}

export function OfficeModuleShell({
  module,
  user,
  role,
  branchId,
  children,
}: {
  module: OfficeModuleId;
  user: { name: string };
  role: StaffRole;
  branchId?: number | null;
  children: ReactNode;
}) {
  const chrome = OFFICE_MODULE_CHROME[module];
  const pathname = usePathname();
  const tier1 = resolveOfficeRailItems(role, branchId);
  const tier2 = resolveOfficeDeepNav(role, module, branchId);

  let actionLink: { href: string; label: string } | null =
    resolveRoleHomeLink(role, branchId);
  if (chrome.action) {
    const allowed =
      !chrome.action.gateModule || canAccess(role, chrome.action.gateModule);
    actionLink = allowed
      ? { href: chrome.action.href, label: chrome.action.label }
      : null;
  }

  return (
    <AppShell
      user={user}
      role={role}
      branchId={branchId}
      brand={{
        icon: chrome.icon,
        subLabel: chrome.subLabel,
        mainLabel: chrome.mainLabel,
        showBackLink: chrome.showBackLink,
      }}
      tier1={tier1}
      tier2={tier2}
      defaultPageTitle={chrome.defaultPageTitle}
      pageHeader={{
        breadcrumbSegments: chrome.breadcrumbFromNav
          ? buildBreadcrumbTrail(pathname, tier2).slice(0, -1)
          : undefined,
        crumbLabel: chrome.crumbLabel,
        description: chrome.description,
        actions: actionLink ? (
          <Button asChild variant="outline" size="sm">
            <Link href={actionLink.href}>{actionLink.label}</Link>
          </Button>
        ) : undefined,
      }}
    >
      {children}
    </AppShell>
  );
}
