import { PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { currentUserHasPermissionAny } from "@/_lib/permissions";
import {
  parseFinanceParams,
  resolveFinanceRange,
} from "../_lib/finance-params";
import {
  isSingleCalendarMonth,
  monthStartFromIsoDate,
} from "../_lib/revenue-target";
import { listBranchRevenueTargetProgress } from "../targets/actions";
import { loadRevenueBundle } from "./_lib/revenue-loader";
import { RevenueClient } from "./revenue-client";

export default async function RevenueReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const params = parseFinanceParams(sp);
  const resolved = resolveFinanceRange(params);
  const showTargetMonth = isSingleCalendarMonth(resolved.start, resolved.end);
  const yearMonth = monthStartFromIsoDate(resolved.start);

  const [bundle, canRefreshFinanceViews, targetProgressRes] = await Promise.all([
    loadRevenueBundle(params, resolved),
    currentUserHasPermissionAny(PERMISSION_KEYS.SETTINGS_TENANT),
    showTargetMonth
      ? listBranchRevenueTargetProgress(yearMonth)
      : Promise.resolve(null),
  ]);

  const targetRows =
    targetProgressRes?.success === true ? (targetProgressRes.data ?? []) : [];

  return (
    <RevenueClient
      params={params}
      branches={bundle.branches}
      kpis={bundle.kpis}
      compare={bundle.compare}
      rollupRows={bundle.rollupRows}
      topItems={bundle.topItems}
      hourBuckets={bundle.hourBuckets}
      hourlyEnabled={bundle.hourlyEnabled}
      cashierEnabled={bundle.cashierEnabled}
      cashiers={bundle.cashiers}
      cashVariance={bundle.cashVariance}
      dashboardSummary={bundle.dashboardSummary}
      dashboardHealth={bundle.dashboardHealth}
      resolvedStart={resolved.start}
      resolvedEnd={resolved.end}
      canRefreshFinanceViews={canRefreshFinanceViews}
      targetRows={targetRows}
      showTargetMonth={showTargetMonth}
    />
  );
}
