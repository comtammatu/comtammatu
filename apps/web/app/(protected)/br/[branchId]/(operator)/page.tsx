/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: operator hub homepage displays inline vietnamese warning for clock-in gate */
import {
  ChefHat,
  ClipboardCheck,
  Clock,
  LayoutDashboard,
  ListChecks,
  Monitor,
  MonitorUp,
  Package,
  Settings,
  Truck,
  Utensils,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { canAccess, resolveOperatorTiles } from "@comtammatu/shared/auth";
import { APP_COPY_VI } from "@comtammatu/shared/labels";
import { Button } from "@comtammatu/ui/components/button";
import {
  EmployeeActionSection,
  EmployeePanel,
  EmployeePage,
} from "@/(protected)/employee/components/employee-page";
import { EmployeeHomePageContent } from "@/(protected)/employee/page";
import { getTodayWorkState } from "@/(protected)/employee/_lib/today-work-state";
import { loadAuthState } from "@/_lib/auth";
import { resolveBranchContext } from "@/_lib/branch-context";

const ICONS = {
  ChefHat,
  ClipboardCheck,
  Clock,
  LayoutDashboard,
  ListChecks,
  Monitor,
  MonitorUp,
  Package,
  Settings,
  Truck,
  Utensils,
} as const;

function parseBranchId(raw: string): number | null {
  const branchId = Number(raw);
  return Number.isInteger(branchId) && branchId > 0 ? branchId : null;
}

function resolveIcon(icon: string) {
  return ICONS[icon as keyof typeof ICONS] ?? Monitor;
}

export default async function OperatorHomePage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { branchId: rawBranchId } = await params;
  const branchId = parseBranchId(rawBranchId);
  if (branchId == null) notFound();

  const authState = await loadAuthState();
  const { supabase, claims } = authState;
  const context = await resolveBranchContext(supabase, claims, branchId);
  if (!context) notFound();

  const groups = resolveOperatorTiles(claims.user_role, context.branchId);
  const basePath = `/br/${context.branchId}`;
  const showTodayCard = canAccess(claims.user_role, "employee");
  const showManagementCard =
    !showTodayCard && canAccess(claims.user_role, "branch_dashboard");

  // Pre-clock-in gate for cashier/chef roles
  const isFloorRole =
    claims.user_role === "cashier" || claims.user_role === "chef";
  const workState = await getTodayWorkState();
  const beforeClockIn = workState.status === "not_started";

  // Pre-clock-in: tiles stay VISIBLE but disabled (owner decision, cutover
  // spec "Open implementation notes") — the greyed tile plus the banner is
  // the clock-in prompt.
  const lockedGroupIds = new Set(["sales_kitchen", "stock"]);
  const tilesLockedBeforeClockIn = isFloorRole && beforeClockIn;

  return (
    <EmployeePage title={APP_COPY_VI.operatorHome} hideHeaderOnMobile>
      {showTodayCard ? (
        <EmployeeHomePageContent
          authState={authState}
          mode="today-card"
          routes={{
            clock: `${basePath}/shift/clock`,
            tasks: `${basePath}/shift`,
            schedule: `${basePath}/shift/schedule`,
            profile: `${basePath}/profile`,
            checkoutApprovals: `${basePath}/shift/checkout-approvals`,
            count: `${basePath}/stock/count`,
            wasteApprovals: `${basePath}/stock/waste-approvals`,
          }}
          showNotificationControl={false}
        />
      ) : showManagementCard ? (
        <EmployeePanel
          title={APP_COPY_VI.branchCommand}
          description={context.branch.name}
          tone="info"
          size="sm"
        >
          <Button asChild size="touch-lg" className="w-full sm:w-fit">
            <Link href={`${basePath}/dashboard`}>
              <LayoutDashboard data-icon="inline-start" />
              {APP_COPY_VI.branchCommand}
            </Link>
          </Button>
        </EmployeePanel>
      ) : null}

      {isFloorRole && beforeClockIn && (
        <div className="rounded-md border border-warning/30 bg-warning/5 p-3 text-sm text-warning-foreground">
          Bạn cần <strong>chấm công vào ca</strong> để mở khóa các chức năng Bán
          hàng, Bếp và Kho chi nhánh.
        </div>
      )}

      {groups.map((group) => (
        <EmployeeActionSection
          key={group.id}
          title={group.title}
          links={group.tiles.map((tile) => ({
            key: `${group.id}-${tile.moduleKey}-${tile.href}`,
            href: tile.href,
            icon: resolveIcon(tile.icon),
            title: tile.label,
            disabled: tilesLockedBeforeClockIn && lockedGroupIds.has(group.id),
          }))}
          columns={2}
          mobileColumns={2}
        />
      ))}
    </EmployeePage>
  );
}
