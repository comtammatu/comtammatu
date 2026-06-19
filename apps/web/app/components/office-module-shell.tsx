"use client";

import Link from "next/link";
import {
  Briefcase as IconBriefcase,
  Receipt as IconReceipt,
  Utensils as IconUtensils,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { resolveRoleHomeLink, type StaffRole } from "@comtammatu/shared/auth";
import { APP_COPY_VI, MODULE_LABELS_VI } from "@comtammatu/shared/labels";
import { ORDER_VI } from "@comtammatu/shared/messages";
import { Button } from "@comtammatu/ui/components/button";
import { AppShell } from "@/components/app-shell";
import { resolveOfficeNavGroups } from "@/lib/office-nav";
import { messages } from "@lib/messages";

// Generic Management shell for office modules whose only sidebar is the shared
// office nav (no module-specific deep nav). Chrome lives in this client
// registry — keyed by a serializable `module` id — so layouts (server
// components) pass only the id across the RSC boundary, never an icon. Modules
// with deep nav (admin, finance, inventory) keep their own shell.

export type OfficeModuleId = "hr" | "menu" | "orders";

interface ModuleChrome {
  icon: LucideIcon;
  subLabel: string;
  mainLabel: string;
  defaultPageTitle: string;
  crumbLabel: string;
  description: string;
}

const hrShell = messages.hr.shell;

const OFFICE_MODULE_CHROME: Record<OfficeModuleId, ModuleChrome> = {
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
    crumbLabel: "Catalog · Thực đơn",
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
  const homeLink = resolveRoleHomeLink(role, branchId);

  return (
    <AppShell
      user={user}
      role={role}
      branchId={branchId}
      brand={{
        icon: chrome.icon,
        subLabel: chrome.subLabel,
        mainLabel: chrome.mainLabel,
      }}
      navGroups={resolveOfficeNavGroups(role, branchId)}
      defaultPageTitle={chrome.defaultPageTitle}
      pageHeader={{
        crumbLabel: chrome.crumbLabel,
        description: chrome.description,
        actions: (
          <Button asChild variant="outline" size="sm">
            <Link href={homeLink.href}>{homeLink.label}</Link>
          </Button>
        ),
      }}
    >
      {children}
    </AppShell>
  );
}
