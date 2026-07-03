/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: operator hub homepage displays inline vietnamese warning for clock-in gate */
import {
  Briefcase,
  ChartBar,
  ChefHat,
  CheckCircle,
  ClipboardCheck,
  ClipboardList,
  Clock,
  FileText,
  Hourglass,
  LayoutDashboard,
  ListChecks,
  Monitor,
  MonitorUp,
  Package,
  Settings,
  Truck,
  Undo2,
  Utensils,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  canAccess,
  resolveOperatorTiles,
  type BranchKind,
} from "@comtammatu/shared/auth";
import { formatVND } from "@comtammatu/shared/format";
import { APP_COPY_VI } from "@comtammatu/shared/labels";
import { Button } from "@comtammatu/ui/components/button";
import { KpiCard } from "@/components/kpi/kpi-card";
import { AppLinkCard, AppSection, LinkCardGrid } from "@/components/surface";
import {
  EmployeeActionSection,
  EmployeePanel,
  EmployeePage,
} from "@/(protected)/employee/components/employee-page";
import { EmployeeHomePageContent } from "@/(protected)/employee/page";
import { getTodayWorkState } from "@/(protected)/employee/_lib/today-work-state";
import { getUnreadCount } from "@/(protected)/notifications/actions";
import { loadAuthState } from "@/_lib/auth";
import { resolveBranchContext } from "@/_lib/branch-context";
import { messages } from "@lib/messages";
import { fetchBranchDayStatus, fetchBranchQueueCounts } from "./dashboard/data";

const branchCopy = messages.settings.branch;

interface QueueRow {
  key: string;
  href: string;
  icon: typeof ClipboardCheck;
  title: string;
  meta: string;
  count: number;
}

function buildQueueRows(
  basePath: string,
  counts: Awaited<ReturnType<typeof fetchBranchQueueCounts>>,
): QueueRow[] {
  const rows: QueueRow[] = [];
  if (counts.pendingCheckouts != null) {
    rows.push({
      key: "checkout-approvals",
      href: `${basePath}/shift/checkout-approvals`,
      icon: ClipboardCheck,
      title: branchCopy.readinessCheckoutTitle,
      meta: branchCopy.queueCheckoutMeta(counts.pendingCheckouts),
      count: counts.pendingCheckouts,
    });
  }
  if (counts.pendingCountSlips != null) {
    rows.push({
      key: "count-slips",
      href: `${basePath}/stock/count-slips`,
      icon: ClipboardCheck,
      title: branchCopy.queueCountSlipsTitle,
      meta: branchCopy.queueCountSlipsMeta(counts.pendingCountSlips),
      count: counts.pendingCountSlips,
    });
  }
  if (counts.pendingWaste != null) {
    rows.push({
      key: "waste-approvals",
      href: `${basePath}/stock/waste-approvals`,
      icon: CheckCircle,
      title: branchCopy.queueWasteTitle,
      meta: branchCopy.queueWasteMeta(counts.pendingWaste),
      count: counts.pendingWaste,
    });
  }
  if (counts.expiringItems != null) {
    rows.push({
      key: "expiry",
      href: `${basePath}/stock/expiry`,
      icon: Hourglass,
      title: branchCopy.queueExpiryTitle,
      meta: branchCopy.queueExpiryMeta(counts.expiringItems),
      count: counts.expiringItems,
    });
  }
  return rows;
}

const ICONS = {
  Briefcase,
  ChartBar,
  ChefHat,
  CheckCircle,
  ClipboardCheck,
  ClipboardList,
  Clock,
  FileText,
  Hourglass,
  LayoutDashboard,
  ListChecks,
  Monitor,
  MonitorUp,
  Package,
  Settings,
  Truck,
  Undo2,
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

  const groups = resolveOperatorTiles(
    claims.user_role,
    context.branchId,
    context.branch.branch_kind as BranchKind,
  );
  const basePath = `/br/${context.branchId}`;
  const showTodayCard = canAccess(claims.user_role, "employee");
  const showOverview = canAccess(claims.user_role, "branch_dashboard");
  const showManagementCard = !showTodayCard && showOverview;

  // Pre-clock-in gate for cashier/chef roles
  const isFloorRole =
    claims.user_role === "cashier" || claims.user_role === "chef";
  // Floor roles structurally hold zero approval permissions — skip the
  // queue fetch for them entirely rather than rendering an always-empty
  // section (queue rows are permission-gated per role, independent of
  // branch_dashboard access, so warehouse/production managers still see it).
  const showQueue = !isFloorRole;

  const [day, unreadResult, queueCounts] = await Promise.all([
    showOverview
      ? fetchBranchDayStatus(supabase, claims, context.branchId)
      : Promise.resolve(null),
    showOverview ? getUnreadCount().catch(() => null) : Promise.resolve(null),
    showQueue
      ? fetchBranchQueueCounts(supabase, claims, context.branchId)
      : Promise.resolve(null),
  ]);
  const unreadCount = unreadResult?.success ? (unreadResult.data?.count ?? 0) : 0;
  const queueRows = queueCounts ? buildQueueRows(basePath, queueCounts) : [];

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

      {queueRows.length > 0 ? (
        <AppSection
          title={branchCopy.queueTitle}
          icon={<ClipboardCheck />}
          tone="warning"
          size="sm"
          badge={{
            children: String(
              queueRows.reduce((sum, row) => sum + row.count, 0),
            ),
            variant: "warning",
          }}
        >
          <LinkCardGrid className="lg:grid-cols-2">
            {queueRows.map((row) => (
              <AppLinkCard
                key={row.key}
                href={row.href}
                title={row.title}
                description={row.meta}
                icon={<row.icon />}
                tone="warning"
                metric={{ value: row.count }}
              />
            ))}
          </LinkCardGrid>
        </AppSection>
      ) : null}

      {showOverview && day ? (
        <EmployeePanel title={messages.settings.branch.hubOverviewTitle} size="sm">
          <div className="grid grid-cols-2 gap-2">
            <KpiCard
              label={messages.settings.branch.dayRevenueLabel}
              value={formatVND(day.todayRevenue)}
              density="compact"
              href={`${basePath}/dashboard`}
            />
            <KpiCard
              label={messages.settings.branch.hubOverviewUnreadLabel}
              value={String(unreadCount)}
              density="compact"
              tone={unreadCount > 0 ? "warning" : "neutral"}
              href="/notifications"
            />
          </div>
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
          wideColumns
        />
      ))}
    </EmployeePage>
  );
}
