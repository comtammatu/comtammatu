"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3 as IconBarChart,
  LayoutDashboard as IconLayoutDashboard,
  Menu as IconMenu,
  Package as IconPackage,
  Wallet as IconWallet,
} from "lucide-react";
import {
  canAccess,
  MODULE_ACL,
  type ModuleKey,
  type StaffRole,
} from "@comtammatu/shared/auth";
import { cn } from "@comtammatu/ui";
import { Button } from "@comtammatu/ui/components/button";
import { useSidebar } from "@comtammatu/ui/components/sidebar";
import { messages } from "@lib/messages";

const copy = messages.admin.nav;

const NAV_ITEMS: ReadonlyArray<{
  moduleKey: ModuleKey;
  label: string;
  icon: typeof IconLayoutDashboard;
}> = [
  { moduleKey: "dashboard", label: copy.overview, icon: IconLayoutDashboard },
  { moduleKey: "reports", label: copy.reports, icon: IconBarChart },
  { moduleKey: "inventory", label: copy.inventory, icon: IconPackage },
  { moduleKey: "finance", label: copy.finance, icon: IconWallet },
];

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}

/**
 * Mobile bottom navbar for the back-office workspace (admin, reports,
 * inventory, finance). Top destinations get a thumb-reachable tab; the
 * trailing "Menu" tab opens the full sidebar drawer. Must render inside
 * `SidebarProvider` (AppShell does this).
 */
export function WorkspaceBottomNav({ role }: { role: StaffRole }) {
  const pathname = usePathname();
  const { toggleSidebar } = useSidebar();

  const items = NAV_ITEMS.filter((item) => canAccess(role, item.moduleKey));

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 px-3 pt-2 shadow-sm chrome-safe-pb backdrop-blur lg:hidden print:hidden"
      aria-label={copy.ariaLabel}
    >
      <div className="no-scrollbar mx-auto flex max-w-lg items-stretch gap-1 overflow-x-auto">
        {items.map((item) => {
          const href = MODULE_ACL[item.moduleKey].path;
          const active = isActive(pathname, href);
          const Icon = item.icon;
          return (
            <Button
              key={item.moduleKey}
              asChild
              variant={active ? "secondary" : "ghost"}
              size="touch"
              data-active={active ? "true" : undefined}
              className={cn(
                "min-w-0 flex-1 flex-col gap-1 px-1 text-2xs transition-[transform,background-color,color,box-shadow] duration-150 active:translate-y-px",
                active &&
                  "shadow-sm motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:duration-150",
              )}
            >
              <Link href={href} aria-current={active ? "page" : undefined}>
                <Icon data-icon="inline-start" strokeWidth={active ? 2.4 : 2} />
                <span>{item.label}</span>
              </Link>
            </Button>
          );
        })}
        <Button
          variant="ghost"
          size="touch"
          onClick={toggleSidebar}
          className="min-w-0 flex-1 flex-col gap-1 px-1 text-2xs transition-[transform,background-color,color,box-shadow] duration-150 active:translate-y-px"
        >
          <IconMenu data-icon="inline-start" />
          <span>{copy.menu}</span>
        </Button>
      </div>
    </nav>
  );
}
