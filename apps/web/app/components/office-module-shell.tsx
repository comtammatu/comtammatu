"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import {
  canAccess,
  resolveRoleHomeLink,
  type StaffRole,
} from "@comtammatu/shared/auth";
import { APP_COPY_VI, MODULE_LABELS_VI } from "@comtammatu/shared/labels";
import { Button } from "@comtammatu/ui/components/button";
import { ManagementShell } from "@/components/management-chrome";
import {
  findActiveNavItem,
  formatPathSegment,
  type ShellNavGroup,
} from "@/lib/shell-primitives";
import { resolveOfficeDeepNav } from "@/lib/office-nav";
import { messages } from "@lib/messages";

// Generic Management shell for modules whose chrome is the shared primary tabs +
// the module's own deep nav, and whose chrome carries no shell-scoped client
// state. Chrome lives in this client registry keyed by a serializable `module`
// id, so layouts pass only the id across the RSC boundary.
// Modules that own shell-scoped client state keep their own wrapper.

export type OfficeModuleId = "admin" | "hr" | "menu" | "orders" | "branches";

interface ModuleChrome {
  defaultPageTitle: string;
  crumbLabel: string;
  description?: string;
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
    defaultPageTitle: APP_COPY_VI.settingsLabel,
    crumbLabel: APP_COPY_VI.storeManagement,
    breadcrumbFromNav: true,
  },
  hr: {
    defaultPageTitle: hrShell.defaultPageTitle,
    crumbLabel: APP_COPY_VI.hrWorkspaceSubtitle,
    description: hrShell.pageDescription,
  },
  menu: {
    defaultPageTitle: MODULE_LABELS_VI.menu,
    crumbLabel: MODULE_LABELS_VI.menu,
    description:
      "Nhập danh mục, món ăn, biến thể và topping cho toàn chuỗi tại cùng một nơi.",
  },
  orders: {
    defaultPageTitle: "Đơn hàng",
    crumbLabel: "Đối soát · Đơn hàng",
    description:
      "Tra cứu lịch sử đơn hàng, xử lý hoàn tiền và đối soát doanh thu.",
  },
  branches: {
    defaultPageTitle: MODULE_LABELS_VI.branches,
    crumbLabel: MODULE_LABELS_VI.branches,
    description:
      "Quản lý danh sách Hub vận hành, địa chỉ liên hệ và cổng mạng tin cậy.",
  },
};

// Dynamic breadcrumb trail from the active nav item. Only admin opts in via
// `breadcrumbFromNav`; the office modules show the static crumb badge.
function buildBreadcrumbTrail(
  pathname: string,
  groups: ShellNavGroup[],
): Array<{ label: string; href?: string }> {
  const active = findActiveNavItem(groups, pathname);
  if (!active) return [{ label: APP_COPY_VI.settingsLabel }];
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
    { label: APP_COPY_VI.settingsLabel, href: "/admin/settings" },
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
  const tier2 = resolveOfficeDeepNav(role, module, branchId);

  let actionLink: { href: string; label: string } | null = resolveRoleHomeLink(
    role,
    branchId,
  );
  if (chrome.action) {
    const allowed =
      !chrome.action.gateModule || canAccess(role, chrome.action.gateModule);
    actionLink = allowed
      ? { href: chrome.action.href, label: chrome.action.label }
      : null;
  }

  return (
    <ManagementShell
      user={user}
      role={role}
      branchId={branchId}
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
    </ManagementShell>
  );
}
