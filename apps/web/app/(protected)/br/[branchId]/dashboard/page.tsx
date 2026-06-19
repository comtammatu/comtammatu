import { notFound } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  Armchair as IconArmchair,
  Boxes as IconBoxes,
  ChefHat as IconChefHat,
  ClipboardCheck as IconClipboardCheck,
  ClipboardList as IconClipboardList,
  CreditCard as IconCreditCard,
  Monitor as IconMonitor,
  MonitorUp as IconMonitorUp,
  Printer as IconPrinter,
  ReceiptText as IconReceiptText,
  Settings as IconSettings,
  Users as IconUsers,
  Utensils as IconUtensils,
} from "lucide-react";
import { canAccess, type ModuleKey } from "@comtammatu/shared/auth";
import { formatVND } from "@comtammatu/shared/format";
import { formatVNTime } from "@comtammatu/shared/time";
import type { BadgeProps } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { ItemGroup } from "@comtammatu/ui/components/item";
import { AppPage, AppSection } from "@/components/surface";
import { KpiCard } from "@/components/kpi/kpi-card";
import { loadAuthState } from "@/_lib/auth";
import { messages } from "@lib/messages";
import { BranchActionItem } from "../_components/branch-action-item";
import { BranchManagementShell } from "../_components/branch-management-chrome";
import { fetchBranchDayStatus } from "./data";

type BranchCommandTile = {
  moduleKey: ModuleKey;
  href: string;
  title: string;
  description: string;
  icon: ReactNode;
};

function ReadinessItem({
  icon,
  title,
  description,
  badge,
  badgeVariant,
  href,
  ctaLabel,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  badge: string;
  badgeVariant: BadgeProps["variant"];
  href?: string;
  ctaLabel?: string;
}) {
  return (
    <BranchActionItem
      icon={icon}
      title={title}
      description={description}
      href={href}
      ctaLabel={ctaLabel}
      iconTone="muted"
      badge={{ children: badge, variant: badgeVariant }}
    />
  );
}

function BranchCommandActionList({
  tiles,
  ctaLabel,
}: {
  tiles: BranchCommandTile[];
  ctaLabel: string;
}) {
  return (
    <ItemGroup className="gap-2">
      {tiles.map((tile) => (
        <BranchActionItem
          key={`${tile.moduleKey}-${tile.href}`}
          href={tile.href}
          title={tile.title}
          description={tile.description}
          icon={tile.icon}
          ctaLabel={ctaLabel}
        />
      ))}
    </ItemGroup>
  );
}

export default async function BranchCommandPage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { branchId: branchIdStr } = await params;
  const branchId = Number(branchIdStr);
  if (!Number.isInteger(branchId) || branchId <= 0) {
    notFound();
  }

  const { supabase, claims, session } = await loadAuthState();

  const { data: branch } = await supabase
    .from("branches")
    .select("id, name, branch_kind, is_active")
    .eq("id", branchId)
    .eq("tenant_id", claims.tenant_id)
    .maybeSingle();

  if (!branch || !branch.is_active) notFound();

  const day = await fetchBranchDayStatus(supabase, claims, branchId);

  const copy = messages.settings.branch;
  const role = claims.user_role;

  const posHref = canAccess(role, "pos") ? `/br/${branchId}/pos` : undefined;
  const kdsHref = canAccess(role, "kds") ? `/br/${branchId}/kds` : undefined;
  const ordersHref = canAccess(role, "orders")
    ? `/orders?branchId=${branchId}`
    : undefined;
  const financeHref = canAccess(role, "finance")
    ? `/finance?branch=${branchId}`
    : undefined;
  const settingsHref = canAccess(role, "branch_settings")
    ? `/br/${branchId}/settings`
    : undefined;
  const tablesHref = settingsHref
    ? `/br/${branchId}/settings/tables`
    : undefined;
  const posSettingsHref = settingsHref
    ? `/br/${branchId}/settings/pos`
    : undefined;
  const kdsSettingsHref = settingsHref
    ? `/br/${branchId}/settings/kds`
    : undefined;
  const printersHref = settingsHref
    ? `/br/${branchId}/settings/printers`
    : undefined;
  const menuHref = canAccess(role, "menu") ? "/menu" : undefined;
  const paymentSettingsHref = canAccess(role, "settings")
    ? "/admin/settings/payments"
    : financeHref;
  const hrHref = canAccess(role, "hr") ? "/hr" : undefined;

  const posOpen = day.posSessionOpenedAt !== null;
  const menuReady = day.setupActiveMenuItems > 0;
  const floorReady = day.tablesTotal > 0 && day.setupActiveTerminals > 0;
  const kdsSetupReady = day.setupActiveKdsStations > 0;
  const printerConfigured = day.setupActivePrinters > 0;
  const staffReady = day.setupActiveStaff > 0;
  const paymentReady = day.setupPaymentReady;
  const hddtReady = day.setupHddtReady;
  const printerDescription = !printerConfigured
    ? copy.readinessPrinterNoConfig
    : !day.printerHasAgent
      ? copy.readinessPrinterNoAgent
      : day.printerOnline
        ? copy.readinessPrinterOnline
        : copy.readinessPrinterOffline;
  const printerFailedSuffix =
    day.printerFailed24h > 0
      ? ` ${copy.readinessPrinterFailed(day.printerFailed24h)}`
      : "";

  const liveOperationTiles: BranchCommandTile[] = [
    {
      moduleKey: "pos",
      href: `/br/${branchId}/pos`,
      title: "POS",
      description: copy.commandPosDescription,
      icon: <IconMonitor />,
    },
    {
      moduleKey: "kds",
      href: `/br/${branchId}/kds`,
      title: "KDS",
      description: copy.commandKdsDescription,
      icon: <IconChefHat />,
    },
    {
      moduleKey: "runner",
      href: `/br/${branchId}/runner`,
      title: "Màn gọi số",
      description: copy.commandRunnerDescription,
      icon: <IconMonitorUp />,
    },
    {
      moduleKey: "branch_menu_limits",
      href: `/br/${branchId}/menu-limits`,
      title: copy.menuLimitsTitle,
      description: copy.commandMenuLimitsDescription,
      icon: <IconUtensils />,
    },
  ];

  const endDayTiles: BranchCommandTile[] = [
    {
      moduleKey: "branch_dashboard",
      href: `/br/${branchId}/settings/pos-sessions`,
      title: copy.commandPosSessionsTitle,
      description: copy.commandPosSessionsDescription,
      icon: <IconReceiptText />,
    },
  ];

  const setupTiles: BranchCommandTile[] = [
    {
      moduleKey: "branch_settings",
      href: `/br/${branchId}/settings`,
      title: copy.commandBranchSetup,
      description: copy.commandBranchSetupDescription,
      icon: <IconSettings />,
    },
  ];

  const drilldownTiles: BranchCommandTile[] = [
    {
      moduleKey: "menu",
      href: "/menu",
      title: "Thực đơn",
      description: copy.commandMenuDescription,
      icon: <IconUtensils />,
    },
    {
      moduleKey: "orders",
      href: `/orders?branchId=${branchId}`,
      title: "Đơn hàng",
      description: copy.commandOrdersDescription,
      icon: <IconClipboardList />,
    },
    {
      moduleKey: "hr",
      href: "/hr",
      title: "Nhân sự",
      description: copy.commandHrDescription,
      icon: <IconUsers />,
    },
    {
      moduleKey: "inventory",
      href: `/inventory?branchId=${branchId}`,
      title: "Kho hàng",
      description: copy.commandInventoryDescription,
      icon: <IconBoxes />,
    },
  ];

  const visibleLiveOperationTiles = liveOperationTiles.filter((tile) =>
    canAccess(role, tile.moduleKey),
  );
  const visibleEndDayTiles = endDayTiles.filter((tile) =>
    canAccess(role, tile.moduleKey),
  );
  const visibleSetupTiles = setupTiles.filter((tile) =>
    canAccess(role, tile.moduleKey),
  );
  const visibleDrilldownTiles = drilldownTiles.filter((tile) =>
    canAccess(role, tile.moduleKey),
  );
  const displayName =
    session.user.user_metadata?.["full_name"] ??
    session.user.email ??
    claims.user_role;

  return (
    <BranchManagementShell
      user={{ name: displayName }}
      role={role}
      branchId={branchId}
      branchName={branch.name}
      defaultPageTitle={copy.commandTitle}
      description={copy.commandDescription(branch.name)}
      breadcrumbSegments={[copy.commandTitle]}
      actions={
        financeHref ? (
          <Button asChild variant="outline" size="sm">
            <Link href={financeHref}>{copy.financeCta}</Link>
          </Button>
        ) : null
      }
    >
      <AppPage width="wide">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label={copy.dayRevenueLabel}
            value={formatVND(day.todayRevenue)}
            hint={copy.dayRevenueHint}
          />
          <KpiCard
            label={copy.dayPaidOrdersLabel}
            value={String(day.paidOrders)}
            hint={copy.dayPaidOrdersHint}
            href={ordersHref}
          />
          <KpiCard
            label={copy.dayTablesLabel}
            value={`${String(day.tablesOccupied)}/${String(day.tablesTotal)}`}
            hint={copy.dayTablesHint}
            href={posHref}
          />
          <KpiCard
            label={copy.dayKitchenLabel}
            value={String(day.kitchenActiveOrders)}
            hint={copy.dayKitchenHint}
            tone={day.kitchenActiveOrders > 0 ? "warning" : "neutral"}
            href={kdsHref}
          />
        </div>

        <AppSection
          title={copy.readinessTitle}
          description={copy.readinessDescription}
        >
          <ItemGroup className="gap-2">
            <ReadinessItem
              icon={<IconUtensils />}
              title={copy.readinessMenuTitle}
              description={
                menuReady
                  ? copy.readinessMenuReady(day.setupActiveMenuItems)
                  : copy.readinessMenuMissing
              }
              badge={
                menuReady
                  ? copy.readinessReadyBadge
                  : copy.readinessMissingBadge
              }
              badgeVariant={menuReady ? "success" : "warning"}
              href={menuHref}
              ctaLabel={menuHref ? copy.readinessMenuCta : undefined}
            />
            <ReadinessItem
              icon={<IconArmchair />}
              title={copy.readinessFloorTitle}
              description={
                floorReady
                  ? copy.readinessFloorReady(
                      day.tablesTotal,
                      day.setupActiveTerminals,
                    )
                  : copy.readinessFloorMissing(
                      day.tablesTotal,
                      day.setupActiveTerminals,
                    )
              }
              badge={
                floorReady
                  ? copy.readinessReadyBadge
                  : copy.readinessMissingBadge
              }
              badgeVariant={floorReady ? "success" : "warning"}
              href={tablesHref ?? posSettingsHref}
              ctaLabel={settingsHref ? copy.readinessSetupCta : undefined}
            />
            <ReadinessItem
              icon={<IconChefHat />}
              title={copy.readinessKdsSetupTitle}
              description={
                kdsSetupReady
                  ? copy.readinessKdsSetupReady(day.setupActiveKdsStations)
                  : copy.readinessKdsSetupMissing
              }
              badge={
                kdsSetupReady
                  ? copy.readinessReadyBadge
                  : copy.readinessWarningBadge
              }
              badgeVariant={kdsSetupReady ? "success" : "secondary"}
              href={kdsSettingsHref}
              ctaLabel={kdsSettingsHref ? copy.readinessSetupCta : undefined}
            />
            <ReadinessItem
              icon={<IconCreditCard />}
              title={copy.readinessPaymentTitle}
              description={
                paymentReady
                  ? copy.readinessPaymentReady(hddtReady)
                  : copy.readinessPaymentMissing
              }
              badge={
                paymentReady && hddtReady
                  ? copy.readinessReadyBadge
                  : paymentReady
                    ? copy.readinessPaymentHddtWarningBadge
                    : copy.readinessMissingBadge
              }
              badgeVariant={
                paymentReady && hddtReady
                  ? "success"
                  : paymentReady
                    ? "secondary"
                    : "warning"
              }
              href={paymentSettingsHref}
              ctaLabel={
                paymentSettingsHref ? copy.readinessPaymentCta : undefined
              }
            />
            <ReadinessItem
              icon={<IconMonitor />}
              title={copy.readinessPosTitle}
              description={
                posOpen && day.posSessionOpenedAt
                  ? copy.readinessPosOpen(formatVNTime(day.posSessionOpenedAt))
                  : copy.readinessPosClosed
              }
              badge={
                posOpen
                  ? copy.readinessPosOpenBadge
                  : copy.readinessPosClosedBadge
              }
              badgeVariant={posOpen ? "success" : "warning"}
              href={posHref}
              ctaLabel={posHref ? copy.readinessPosCta : undefined}
            />
            <ReadinessItem
              icon={<IconChefHat />}
              title={copy.readinessKdsTitle}
              description={
                day.kitchenActiveOrders > 0
                  ? copy.readinessKdsActive(day.kitchenActiveOrders)
                  : copy.readinessKdsEmpty
              }
              badge={copy.readinessKdsBadge(day.kitchenActiveOrders)}
              badgeVariant={
                day.kitchenActiveOrders > 0 ? "warning" : "secondary"
              }
              href={kdsHref}
              ctaLabel={kdsHref ? copy.readinessKdsCta : undefined}
            />
            <ReadinessItem
              icon={<IconPrinter />}
              title={copy.readinessPrinterTitle}
              description={`${printerDescription}${printerFailedSuffix}`}
              badge={
                !printerConfigured
                  ? copy.readinessPrinterNoConfigBadge
                  : day.printerOnline
                    ? copy.readinessPrinterOnlineBadge
                    : copy.readinessPrinterOfflineBadge
              }
              badgeVariant={
                !printerConfigured
                  ? "secondary"
                  : day.printerOnline
                    ? "success"
                    : day.printerFailed24h > 0 || day.printerHasAgent
                      ? "destructive"
                      : "secondary"
              }
              href={printersHref}
              ctaLabel={printersHref ? copy.readinessPrinterCta : undefined}
            />
            <ReadinessItem
              icon={<IconUsers />}
              title={copy.readinessStaffTitle}
              description={
                staffReady
                  ? copy.readinessStaffReady(day.setupActiveStaff)
                  : copy.readinessStaffMissing
              }
              badge={
                staffReady
                  ? copy.readinessReadyBadge
                  : copy.readinessWarningBadge
              }
              badgeVariant={staffReady ? "success" : "secondary"}
              href={hrHref}
              ctaLabel={hrHref ? copy.readinessStaffCta : undefined}
            />
            <ReadinessItem
              icon={<IconClipboardCheck />}
              title={copy.readinessCheckoutTitle}
              description={
                day.pendingCheckouts > 0
                  ? copy.readinessCheckoutPending(day.pendingCheckouts)
                  : copy.readinessCheckoutEmpty
              }
              badge={String(day.pendingCheckouts)}
              badgeVariant={day.pendingCheckouts > 0 ? "warning" : "secondary"}
              href="/employee/checkout-approvals"
              ctaLabel={copy.readinessCheckoutCta}
            />
          </ItemGroup>
        </AppSection>

        <AppSection
          title={copy.liveOperationsTitle}
          description={copy.liveOperationsDescription}
        >
          <BranchCommandActionList
            tiles={visibleLiveOperationTiles}
            ctaLabel={copy.openAction}
          />
        </AppSection>

        {visibleEndDayTiles.length > 0 ? (
          <AppSection
            title={copy.endDayTitle}
            description={copy.endDayDescription}
          >
            <BranchCommandActionList
              tiles={visibleEndDayTiles}
              ctaLabel={copy.openAction}
            />
          </AppSection>
        ) : null}

        {visibleSetupTiles.length > 0 ? (
          <AppSection
            title={copy.setupLaneTitle}
            description={copy.setupLaneDescription}
          >
            <BranchCommandActionList
              tiles={visibleSetupTiles}
              ctaLabel={copy.openAction}
            />
          </AppSection>
        ) : null}

        {visibleDrilldownTiles.length > 0 ? (
          <AppSection
            title={copy.drilldownTitle}
            description={copy.drilldownDescription}
          >
            <BranchCommandActionList
              tiles={visibleDrilldownTiles}
              ctaLabel={copy.openAction}
            />
          </AppSection>
        ) : null}
      </AppPage>
    </BranchManagementShell>
  );
}
