import {
  DollarSign as IconCurrencyDollar,
  Package as IconPackage,
  Wallet as IconWallet,
} from "lucide-react";
import { canAccess, MODULE_ACL } from "@comtammatu/shared/auth";
import { formatVND } from "@comtammatu/shared/format";
import { loadAuthState } from "@/_lib/auth";
import { messages } from "@lib/messages";
import {
  AppPage,
  AppPageHeader,
  AppSection,
  KpiRow,
} from "@/components/surface";
import { KpiCard } from "@/components/kpi/kpi-card";
import { buildCompareDelta } from "@/components/kpi/compare-chip";
import { fetchFinanceCockpit } from "../../finance/_lib/finance-cockpit";
import {
  parseFinanceParams,
  resolveFinanceRange,
} from "../../finance/_lib/finance-params";
import { fetchBranchOperatingStatus } from "./actions";
import { buildOwnerDailyCommandSummary, rankOwnerWorkQueue } from "./owner-view-model";
import {
  BranchOperatingList,
  buildBranchQueueItems,
  buildFinanceQueueItems,
  OwnerWorkQueueList,
} from "./_components/owner-work-queue";

const ADMIN_DASHBOARD_COPY = messages.admin.dashboard;

export default async function DashboardPage() {
  const ownerFinanceParams = parseFinanceParams({
    range: "mtd",
    compare: "prev_month",
  });
  const ownerFinanceRange = resolveFinanceRange(ownerFinanceParams);
  const [{ claims }, financeCockpit, branchStatus] = await Promise.all([
    loadAuthState(),
    fetchFinanceCockpit(ownerFinanceParams, ownerFinanceRange),
    fetchBranchOperatingStatus({
      startDate: ownerFinanceRange.start,
      endDate: ownerFinanceRange.end,
    }),
  ]);

  const role = claims.user_role;
  const reportsHref = canAccess(role, "reports")
    ? "/finance/revenue"
    : undefined;
  const financeHref = canAccess(role, "finance")
    ? "/finance?range=mtd&compare=prev_month"
    : undefined;
  const revenueHref = canAccess(role, "finance")
    ? "/finance/revenue?range=mtd&compare=prev_month"
    : reportsHref;
  const inventoryHref = canAccess(role, "inventory")
    ? MODULE_ACL.inventory.path
    : undefined;
  const workQueue = rankOwnerWorkQueue([
    ...buildBranchQueueItems(branchStatus),
    ...buildFinanceQueueItems(financeCockpit.exceptions),
  ]);
  const ownerSummary = buildOwnerDailyCommandSummary({
    branchStatus,
    workQueue,
  });
  const financeKpis = financeCockpit.kpis;
  const compareFinanceKpis = financeCockpit.compareKpis;
  const collectedMonth = Math.round(financeKpis.totalCollected);

  return (
    <AppPage width="wide" density="compact">
      <AppPageHeader
        title={ADMIN_DASHBOARD_COPY.pageTitle}
        description={ADMIN_DASHBOARD_COPY.pageDescription}
        badge={{
          children: ADMIN_DASHBOARD_COPY.pageBadge,
          variant: "secondary",
        }}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {/* id anchor for the owner work-queue scroll target; AppSection has no id slot */}
        <div id="owner-work-queue" className="lg:col-span-2">
          <AppSection
            title={ADMIN_DASHBOARD_COPY.workQueueTitle}
            description={ADMIN_DASHBOARD_COPY.workQueueDescription}
            badge={{
              children: ADMIN_DASHBOARD_COPY.workQueueBadge(
                ownerSummary.attentionTotal,
              ),
              variant: ownerSummary.attentionTotal > 0 ? "warning" : "success",
            }}
            tone={ownerSummary.attentionTotal > 0 ? "warning" : "default"}
          >
            <OwnerWorkQueueList items={workQueue} />
          </AppSection>
        </div>

        <AppSection
          size="sm"
          title={ADMIN_DASHBOARD_COPY.branchStatusTitle}
          description={ADMIN_DASHBOARD_COPY.branchStatusDescription}
        >
          <BranchOperatingList rows={branchStatus} />
        </AppSection>
      </div>

      <AppSection
        size="sm"
        title={ADMIN_DASHBOARD_COPY.financeSnapshotTitle}
        description={ADMIN_DASHBOARD_COPY.financeSnapshotDescription}
      >
        <KpiRow density="compact">
          <KpiCard
            label={ADMIN_DASHBOARD_COPY.revenueLabel}
            value={formatVND(collectedMonth)}
            delta={buildCompareDelta(
              financeKpis.totalCollected,
              compareFinanceKpis?.totalCollected ?? 0,
              "higher_better",
            )}
            compareHint={ADMIN_DASHBOARD_COPY.compareHint}
            hint={ADMIN_DASHBOARD_COPY.revenueHelper}
            icon={<IconCurrencyDollar />}
            href={revenueHref}
          />
          <KpiCard
            label={ADMIN_DASHBOARD_COPY.operatingExpenseLabel}
            value={formatVND(Math.round(financeKpis.operatingExpense))}
            delta={buildCompareDelta(
              financeKpis.operatingExpense,
              compareFinanceKpis?.operatingExpense ?? 0,
              "lower_better",
            )}
            compareHint={ADMIN_DASHBOARD_COPY.compareHint}
            hint={ADMIN_DASHBOARD_COPY.operatingExpenseHelper}
            icon={<IconWallet />}
            href={financeHref}
          />
          <KpiCard
            label={ADMIN_DASHBOARD_COPY.inventoryValueLabel}
            value={formatVND(Math.round(financeKpis.inventoryValue))}
            hint={ADMIN_DASHBOARD_COPY.inventoryValueHelper}
            icon={<IconPackage />}
            href={inventoryHref}
          />
        </KpiRow>
      </AppSection>
    </AppPage>
  );
}
