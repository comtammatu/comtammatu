import { notFound } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  Boxes as IconBoxes,
  ChefHat as IconChefHat,
  ClipboardCheck as IconClipboardCheck,
  ClipboardList as IconClipboardList,
  Monitor as IconMonitor,
  MonitorUp as IconMonitorUp,
  Printer as IconPrinter,
  Settings as IconSettings,
  Users as IconUsers,
  Utensils as IconUtensils,
} from "lucide-react";
import { canAccess, type ModuleKey } from "@comtammatu/shared/auth";
import { formatVND } from "@comtammatu/shared/format";
import { formatVNTime } from "@comtammatu/shared/time";
import { Badge, type BadgeProps } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import {
  AppLinkCard,
  AppPage,
  AppPageHeader,
  AppSection,
  type AppLinkCardProps,
} from "@/components/surface";
import { KpiCard } from "@/components/kpi/kpi-card";
import { loadAuthState } from "@/_lib/auth";
import { messages } from "@lib/messages";
import { fetchBranchDayStatus } from "./data";

type BranchCommandTile = {
  moduleKey: ModuleKey;
  href: string;
  title: string;
  description: string;
  icon: AppLinkCardProps["icon"];
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
    <Item variant="outline" className="items-start">
      <ItemMedia
        variant="icon"
        className="size-8 rounded-md bg-muted text-muted-foreground [&_svg]:size-4"
      >
        {icon}
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle className="flex w-full items-center gap-2 text-sm">
          {title}
          <Badge variant={badgeVariant}>{badge}</Badge>
        </ItemTitle>
        <ItemDescription>{description}</ItemDescription>
      </ItemContent>
      {href && ctaLabel ? (
        <ItemActions className="w-full justify-start sm:w-auto sm:justify-end">
          <Button
            asChild
            variant="outline"
            size="sm"
            className="w-full sm:w-auto"
          >
            <Link href={href}>{ctaLabel}</Link>
          </Button>
        </ItemActions>
      ) : null}
    </Item>
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

  const { supabase, claims } = await loadAuthState();

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
  const printersHref = canAccess(role, "branch_settings")
    ? `/br/${branchId}/settings/printers`
    : undefined;

  const posOpen = day.posSessionOpenedAt !== null;
  const printerDescription = !day.printerHasAgent
    ? copy.readinessPrinterNoAgent
    : day.printerOnline
      ? copy.readinessPrinterOnline
      : copy.readinessPrinterOffline;
  const printerFailedSuffix =
    day.printerFailed24h > 0
      ? ` ${copy.readinessPrinterFailed(day.printerFailed24h)}`
      : "";

  const tiles: BranchCommandTile[] = [
    {
      moduleKey: "branch_settings",
      href: `/br/${branchId}/settings`,
      title: copy.commandBranchSetup,
      description: copy.commandBranchSetupDescription,
      icon: <IconSettings />,
    },
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

  const visibleTiles = tiles.filter((tile) =>
    canAccess(claims.user_role, tile.moduleKey),
  );

  return (
    <AppPage width="default">
      <AppPageHeader
        eyebrow="Theo chi nhánh"
        title={copy.commandTitle}
        description={copy.commandDescription(branch.name)}
        badge={{
          children: branch.name,
          variant: "secondary",
        }}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
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
            icon={<IconMonitor />}
            title={copy.readinessPosTitle}
            description={
              posOpen && day.posSessionOpenedAt
                ? copy.readinessPosOpen(formatVNTime(day.posSessionOpenedAt))
                : copy.readinessPosClosed
            }
            badge={
              posOpen ? copy.readinessPosOpenBadge : copy.readinessPosClosedBadge
            }
            badgeVariant={posOpen ? "success" : "warning"}
            href={posHref}
            ctaLabel={posHref ? copy.readinessPosCta : undefined}
          />
          <ReadinessItem
            icon={<IconPrinter />}
            title={copy.readinessPrinterTitle}
            description={`${printerDescription}${printerFailedSuffix}`}
            badge={
              day.printerOnline
                ? copy.readinessPrinterOnlineBadge
                : copy.readinessPrinterOfflineBadge
            }
            badgeVariant={
              day.printerOnline
                ? "success"
                : day.printerFailed24h > 0 || day.printerHasAgent
                  ? "destructive"
                  : "secondary"
            }
            href={printersHref}
            ctaLabel={printersHref ? copy.readinessPrinterCta : undefined}
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
        title={copy.commandOverviewTitle}
        description={copy.commandOverviewDescription}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {visibleTiles.map((tile) => (
            <AppLinkCard
              key={`${tile.moduleKey}-${tile.href}`}
              href={tile.href}
              title={tile.title}
              description={tile.description}
              icon={tile.icon}
              ctaLabel="Mở"
            />
          ))}
        </div>
      </AppSection>
    </AppPage>
  );
}
