/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: operator hub homepage displays inline vietnamese warning for clock-in gate */
import {
  CalendarCheck,
  ChefHat,
  CheckCircle,
  ChevronRight,
  ClipboardCheck,
  FileText,
  LayoutDashboard,
  Package,
  Truck,
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
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { NoteCallout } from "@comtammatu/ui/components/note-callout";
import { KpiCard } from "@/components/kpi/kpi-card";
import { AppEmptyState } from "@/components/surface";
import {
  EmployeeActionSection,
  EmployeePanel,
  EmployeePage,
} from "@lib/employee/components/employee-page";
import { EmployeeHomePageContent } from "@lib/employee/page";
import { getTodayWorkState } from "@lib/employee/_lib/today-work-state";
import { getUnreadCount } from "@/(protected)/notifications/actions";
import { loadAuthState } from "@/_lib/auth";
import { resolveBranchContext } from "@/_lib/branch-context";
import { messages } from "@lib/messages";
import { parseOperatorBranchId } from "../_lib/parse-branch-id";
import { fetchBranchDayStatus, fetchBranchQueueCounts } from "./dashboard/data";
import {
  CENTRAL_HOME_TILE_SUFFIXES,
  getBranchHomeTileLimit,
  getBranchPrimaryHomeGroup,
} from "./_lib/operator-home-contract";
import { resolveOperatorTileIcon } from "./operator-tile-icons";

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
  // Central-kind domain rows lead the feed (design contract screens 1+4):
  // the site's own work queue comes before the shared approval rows.
  if (counts.draftGrns != null) {
    rows.push({
      key: "draft-grns",
      href: `${basePath}/stock/grn`,
      icon: FileText,
      title: branchCopy.queueDraftGrnsTitle,
      meta: branchCopy.queueDraftGrnsMeta(counts.draftGrns),
      count: counts.draftGrns,
    });
  }
  if (counts.openPurchaseOrders != null) {
    rows.push({
      key: "open-pos",
      href: `${basePath}/stock/purchase-orders`,
      icon: Package,
      title: branchCopy.queueOpenPosTitle,
      meta: branchCopy.queueOpenPosMeta(counts.openPurchaseOrders),
      count: counts.openPurchaseOrders,
    });
  }
  if (counts.draftProductionOrders != null) {
    rows.push({
      key: "draft-production",
      href: `${basePath}/stock/production`,
      icon: ChefHat,
      title: branchCopy.queueDraftProductionTitle,
      meta: branchCopy.queueDraftProductionMeta(counts.draftProductionOrders),
      count: counts.draftProductionOrders,
    });
  }
  if (counts.inboundTransfers != null) {
    rows.push({
      key: "inbound-transfers",
      href: `${basePath}/stock/receive`,
      icon: Truck,
      title: branchCopy.queueInboundTransfersTitle,
      meta: branchCopy.queueInboundTransfersMeta(counts.inboundTransfers),
      count: counts.inboundTransfers,
    });
  }
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
  if (counts.pendingLeaveRequests != null) {
    rows.push({
      key: "leave-approvals",
      href: `${basePath}/shift/leave-approvals`,
      icon: CalendarCheck,
      title: branchCopy.queueLeaveTitle,
      meta: branchCopy.queueLeaveMeta(counts.pendingLeaveRequests),
      count: counts.pendingLeaveRequests,
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
  return rows;
}

function QueueRowItem({ row }: { row: QueueRow }) {
  return (
    <Item
      asChild
      variant="outline"
      size="sm"
      className="chrome-tap min-h-12 select-none bg-card transition-transform active:scale-[0.97]"
    >
      <Link href={row.href}>
        <ItemMedia
          variant="icon"
          className="rounded-md bg-warning/10 p-2 text-warning"
        >
          <row.icon />
        </ItemMedia>
        <ItemContent className="min-w-0">
          <ItemTitle className="line-clamp-none w-full text-sm font-semibold">
            {row.title}
          </ItemTitle>
        </ItemContent>
        <ItemActions className="shrink-0 text-muted-foreground">
          <Badge variant="warning">{row.count}</Badge>
          <ChevronRight />
        </ItemActions>
      </Link>
    </Item>
  );
}

function CompactQueueSection({ rows }: { rows: QueueRow[] }) {
  const pendingRows = rows.filter((row) => row.count > 0);

  if (pendingRows.length === 0) {
    return (
      <AppEmptyState compact title={branchCopy.queueEmpty} className="py-3" />
    );
  }

  return (
    <ItemGroup className="gap-2">
      {pendingRows.map((row) => (
        <QueueRowItem key={row.key} row={row} />
      ))}
    </ItemGroup>
  );
}

// Approved home tile curation per central kind (design contract screens 1+4):
// four job tiles; every other job stays reachable via the CTA, the queue feed,
// the bottom nav, and /more. Suffixes are matched against tile hrefs.
export default async function OperatorHomePage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { branchId: rawBranchId } = await params;
  const branchId = parseOperatorBranchId(rawBranchId);
  if (branchId == null) notFound();

  const authState = await loadAuthState();
  const { supabase, claims } = authState;
  const context = await resolveBranchContext(supabase, claims, branchId);
  if (!context) notFound();

  const branchKind = context.branch.branch_kind as BranchKind;
  const rawGroups = resolveOperatorTiles(
    claims.user_role,
    context.branchId,
    branchKind,
  );
  const basePath = `/br/${context.branchId}`;
  const showTodayCard = canAccess(claims.user_role, "employee");
  // Sales KPIs and the branch-command door are branch-floor chrome — central
  // sites keep their home to the curated job tiles (D066 no-hub-bloat).
  const showOverview =
    canAccess(claims.user_role, "branch_dashboard") && branchKind === "branch";
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
      ? fetchBranchQueueCounts(supabase, claims, context.branchId, branchKind)
      : Promise.resolve(null),
  ]);
  const unreadCount = unreadResult?.success
    ? (unreadResult.data?.count ?? 0)
    : 0;
  const queueRows = queueCounts
    ? buildQueueRows(basePath, queueCounts)
    : [];

  const workState = await getTodayWorkState();
  const beforeClockIn = workState.status === "not_started";

  // Pre-clock-in: tiles stay VISIBLE but disabled (owner decision, cutover
  // spec "Open implementation notes") — the greyed tile plus the banner is
  // the clock-in prompt.
  const lockedGroupIds = new Set(["sales_kitchen", "stock"]);
  const tilesLockedBeforeClockIn = isFloorRole && beforeClockIn;

  const queuePendingTotal = queueRows.reduce((sum, row) => sum + row.count, 0);

  const isCentral = branchKind !== "branch";
  const isCentralSupply = branchKind === "central_supply";
  const centralSuffixes = CENTRAL_HOME_TILE_SUFFIXES[branchKind] ?? null;
  // Central homes render one curated job-tile group; the full tile directory
  // lives on /more (design contract screens 1+4).
  const centralGroups =
    isCentral && centralSuffixes
      ? (() => {
          const stockTiles = rawGroups
            .flatMap((group) => (group.id === "stock" ? group.tiles : []))
            .filter((tile) =>
              centralSuffixes.some((suffix) => tile.href.endsWith(suffix)),
            )
            .sort(
              (a, b) =>
                centralSuffixes.findIndex((s) => a.href.endsWith(s)) -
                centralSuffixes.findIndex((s) => b.href.endsWith(s)),
            );
          return stockTiles.length > 0
            ? [
                {
                  id: "central-jobs",
                  title: isCentralSupply
                    ? branchCopy.centralSupplyTilesTitle
                    : branchCopy.centralKitchenTilesTitle,
                  tiles: stockTiles,
                },
              ]
            : [];
        })()
      : rawGroups;
  const branchTodayGroup = getBranchPrimaryHomeGroup(rawGroups);
  const branchTodayTileLimit = branchTodayGroup
    ? getBranchHomeTileLimit(branchTodayGroup.id)
    : 0;
  const branchTodayTileCount = branchTodayGroup?.tiles.length ?? 0;
  const branchTodayGroups = branchTodayGroup
    ? [
        {
          ...branchTodayGroup,
          tiles: branchTodayGroup.tiles.slice(0, branchTodayTileLimit),
        },
      ].filter((group) => group.tiles.length > 0)
    : [];
  const groups = isCentral ? centralGroups : branchTodayGroups;
  const showMoreLink =
    !isCentral &&
    rawGroups.some((group) =>
      group.id !== branchTodayGroup?.id
        ? group.tiles.length > 0
        : branchTodayTileCount > branchTodayTileLimit,
    );

  const todayStatusSection = showTodayCard ? (
    <EmployeeHomePageContent
      authState={authState}
      mode="compact-status"
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
  ) : null;

  const centralAction = isCentral ? (
    <Button asChild size="touch-lg" className="w-full">
      <Link
        href={
          isCentralSupply
            ? `${basePath}/stock/grn/new`
            : `${basePath}/stock/production`
        }
      >
        {isCentralSupply ? (
          <Truck data-icon="inline-start" />
        ) : (
          <ChefHat data-icon="inline-start" />
        )}
        {isCentralSupply
          ? branchCopy.centralReceiveCta
          : branchCopy.centralProductionCta}
      </Link>
    </Button>
  ) : null;

  const queueSection =
    queueRows.length > 0 || isCentral ? (
      <EmployeePanel
        title={branchCopy.queueTitle}
        icon={ClipboardCheck}
        tone="warning"
        size="sm"
        badge={
          queuePendingTotal > 0
            ? { children: String(queuePendingTotal), variant: "warning" }
            : undefined
        }
      >
        <CompactQueueSection rows={queueRows} />
      </EmployeePanel>
    ) : null;

  const overviewSection =
    showOverview && day ? (
      <EmployeePanel
        title={messages.settings.branch.hubOverviewTitle}
        size="sm"
      >
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
    ) : null;

  const clockGateSection =
    isFloorRole && beforeClockIn ? (
      <NoteCallout tone="warning">
        Bạn cần <strong>chấm công vào ca</strong> để mở khóa các chức năng Bán
        hàng, Bếp và Kho chi nhánh.
      </NoteCallout>
    ) : null;

  const isCentralKitchen = branchKind === "central_kitchen";
  const secondaryLinksSection = isCentral || showMoreLink ? (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {isCentral ? (
        <Button asChild variant="outline" size="touch">
          <Link href={`${basePath}/shift/clock`}>
            {branchCopy.centralClockLink}
          </Link>
        </Button>
      ) : null}
      {isCentralKitchen ? (
        <Button asChild variant="outline" size="touch">
          <Link href={`${basePath}/stock/production/recipes`}>
            Công thức
          </Link>
        </Button>
      ) : null}
      <Button asChild variant="outline" size="touch">
        <Link href={`${basePath}/more`}>{branchCopy.centralMoreTitle}</Link>
      </Button>
    </div>
  ) : null;
  const mainColumnClassName =
    queueSection || overviewSection ? "lg:col-span-2" : "lg:col-span-3";

  return (
    <EmployeePage title={APP_COPY_VI.operatorHome} hideHeaderOnMobile>
      <div className="grid gap-3 lg:grid-cols-3 lg:items-start">
        {todayStatusSection ? (
          <div className={mainColumnClassName}>{todayStatusSection}</div>
        ) : null}
        {centralAction ? (
          <div className={mainColumnClassName}>{centralAction}</div>
        ) : null}
        {queueSection || overviewSection ? (
          <div className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-3 lg:col-start-3 lg:row-span-6 lg:row-start-1">
            {queueSection}
            {overviewSection}
          </div>
        ) : null}
        {clockGateSection ? (
          <div className={mainColumnClassName}>{clockGateSection}</div>
        ) : null}
        {groups.map((group) => (
          <div key={group.id} className={mainColumnClassName}>
            <EmployeeActionSection
              title={group.title}
              description={
                isCentral
                  ? isCentralSupply
                    ? branchCopy.centralSupplyTilesDescription
                    : branchCopy.centralKitchenTilesDescription
                  : undefined
              }
              links={group.tiles.map((tile) => ({
                key: `${group.id}-${tile.moduleKey}-${tile.href}`,
                href: tile.href,
                icon: resolveOperatorTileIcon(tile.icon),
                title: tile.label,
                disabled:
                  tilesLockedBeforeClockIn && lockedGroupIds.has(group.id),
              }))}
              columns={2}
              mobileColumns={group.id === "sales_kitchen" ? 1 : 2}
              wideColumns
            />
          </div>
        ))}
        {secondaryLinksSection ? (
          <div className={mainColumnClassName}>{secondaryLinksSection}</div>
        ) : null}
      </div>
    </EmployeePage>
  );
}
