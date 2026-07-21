import Link from "next/link";
import {
  ArrowRight as IconArrowRight,
  Boxes as IconBoxes,
  ReceiptText as IconReceiptText,
  TrendingUp as IconTrendingUp,
  Wallet as IconWallet,
} from "lucide-react";
import { formatCount, formatVND } from "@comtammatu/shared/format";
import { Badge } from "@comtammatu/ui/components/badge";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { KpiCard } from "@/components/kpi/kpi-card";
import {
  AppPage,
  AppPageHeader,
  AppSection,
  KpiRow,
} from "@/components/surface";
import { messages } from "@lib/messages";
import { buildCompareDelta } from "@/components/kpi/compare-chip";
import { FilterBar } from "./components/filter-bar";
import {
  parseFinanceParams,
  resolveFinanceRange,
  type FinanceRange,
} from "./_lib/finance-params";
import {
  fetchFinanceCockpit,
  type FinanceException,
} from "./_lib/finance-cockpit";
import { fetchCashSummary } from "./_lib/cash-cockpit";
import type { FinanceOverviewSearchParams } from "./_lib/finance-overview-types";
import { CurrentFundsSection } from "./components/current-funds-section";

const financeCopy = messages.finance;
const powerLiteCopy = financeCopy.powerLite;
const HKD_RANGES: readonly FinanceRange[] = ["today", "yesterday", "7d", "mtd"];
function FinanceAttentionSection({
  exceptions,
}: {
  exceptions: FinanceException[];
}) {
  const actionable = exceptions.filter(
    (item): item is FinanceException & { href: string } =>
      item.tone !== "neutral" && item.href != null,
  );
  const needsWork = actionable.length > 0;

  return (
    <AppSection
      size="sm"
      title={powerLiteCopy.ownerNewsTitle}
      description={powerLiteCopy.exceptionsDescription}
    >
      {needsWork ? (
        <ItemGroup>
          {actionable.map((item) => (
            <Item
              key={`${item.href}:${item.label}`}
              variant="outline"
              size="sm"
              role="listitem"
              render={<Link href={item.href} />}
            >
              <ItemContent className="min-w-0">
                <ItemTitle className="line-clamp-none">{item.label}</ItemTitle>
                <ItemDescription className="line-clamp-none">
                  {item.hint}
                </ItemDescription>
              </ItemContent>
              <ItemActions className="ml-auto">
                <Badge
                  variant={
                    item.tone === "destructive" ? "destructive" : "warning"
                  }
                >
                  {item.value}
                </Badge>
                <IconArrowRight className="size-4" aria-hidden />
              </ItemActions>
            </Item>
          ))}
        </ItemGroup>
      ) : (
        <p className="text-sm text-muted-foreground">
          {powerLiteCopy.noOwnerNews}
        </p>
      )}
    </AppSection>
  );
}

export default async function FinancePage({
  searchParams,
}: {
  searchParams?: Promise<FinanceOverviewSearchParams>;
}) {
  const rawParams = searchParams ? await searchParams : {};
  const params = parseFinanceParams(rawParams);
  const resolved = resolveFinanceRange(params);
  const [cockpit, cash] = await Promise.all([
    fetchFinanceCockpit(params, resolved),
    fetchCashSummary(),
  ]);

  return (
    <AppPage width="wide" density="compact">
      <AppPageHeader
        title={powerLiteCopy.title}
        description={powerLiteCopy.description}
      />

      <FilterBar
        params={params}
        branches={cockpit.branches}
        basePath="/finance"
        ranges={HKD_RANGES}
        hide={["granularity", "compare"]}
        compact
      />

      <KpiRow
        density="compact"
        className="grid-cols-1 min-[360px]:grid-cols-2 xl:grid-cols-4"
      >
        <KpiCard
          density="compact"
          icon={<IconWallet className="size-4 text-muted-foreground" />}
          label={financeCopy.basic.kpis.moneyCollected}
          value={formatVND(cockpit.kpis.totalCollected)}
          hint={financeCopy.basic.kpis.moneyCollectedHint(
            formatCount(cockpit.kpis.orderCount),
          )}
          tone="primary"
          href="/finance/revenue"
          delta={
            cockpit.compareKpis
              ? buildCompareDelta(
                  cockpit.kpis.totalCollected,
                  cockpit.compareKpis.totalCollected,
                  "higher_better",
                )
              : null
          }
        />

        <KpiCard
          density="compact"
          icon={<IconTrendingUp className="size-4 text-muted-foreground" />}
          label={financeCopy.basic.kpis.netProfit}
          value={formatVND(cockpit.kpis.netProfit)}
          hint={financeCopy.basic.kpis.netProfitHint}
          delta={
            cockpit.compareKpis
              ? buildCompareDelta(
                  cockpit.kpis.netProfit,
                  cockpit.compareKpis.netProfit,
                  "higher_better",
                )
              : null
          }
        />

        <KpiCard
          density="compact"
          icon={<IconBoxes className="size-4 text-muted-foreground" />}
          label={financeCopy.basic.kpis.inventoryValue}
          value={formatVND(cockpit.kpis.inventoryValue)}
          hint={financeCopy.basic.kpis.inventoryValueHint(
            formatVND(cockpit.kpis.inventoryOpeningValue),
          )}
          delta={{
            ...buildCompareDelta(
              cockpit.kpis.inventoryValue,
              cockpit.kpis.inventoryOpeningValue,
              "higher_better",
            ),
            tone: "neutral" as const,
          }}
          compareHint={financeCopy.basic.kpis.inventoryOpeningCompare}
        />

        <KpiCard
          density="compact"
          icon={<IconReceiptText className="size-4 text-muted-foreground" />}
          label={financeCopy.basic.kpis.operatingExpense}
          value={formatVND(cockpit.kpis.operatingExpense)}
          hint={financeCopy.basic.kpis.operatingExpenseHint}
          href="/finance/expenses"
        />
      </KpiRow>

      <CurrentFundsSection cash={cash} />

      <FinanceAttentionSection exceptions={cockpit.exceptions} />
    </AppPage>
  );
}
