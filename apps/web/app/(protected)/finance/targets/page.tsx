import { AppPage, AppPageHeader } from "@/components/surface";
import { messages } from "@lib/messages";
import {
  currentVnMonthStart,
  monthStartFromIsoDate,
} from "../_lib/revenue-target";
import {
  listBranchRevenueTargetProgress,
  listBranchRevenueTargets,
} from "./actions";
import { RevenueTargetsClient } from "./targets-client";

const copy = messages.finance.revenueTargets;

export default async function FinanceRevenueTargetsPage({
  searchParams,
}: {
  searchParams?: Promise<{ month?: string | string[] }>;
}) {
  const raw = searchParams ? await searchParams : {};
  const monthParam = Array.isArray(raw.month) ? raw.month[0] : raw.month;
  const yearMonth =
    monthParam && /^\d{4}-\d{2}(-\d{2})?$/.test(monthParam)
      ? monthStartFromIsoDate(
          monthParam.length === 7 ? `${monthParam}-01` : monthParam,
        )
      : currentVnMonthStart();

  const [result, progressResult] = await Promise.all([
    listBranchRevenueTargets(yearMonth),
    listBranchRevenueTargetProgress(yearMonth),
  ]);
  const rows = result.success ? (result.data ?? []) : [];
  const progressByBranch = new Map(
    progressResult.success
      ? (progressResult.data ?? []).map((row) => [row.branchId, row])
      : [],
  );
  const rowsWithProgress = rows.map((row) => {
    const progress = progressByBranch.get(row.branchId);
    return {
      ...row,
      currentNetRevenue: progress?.netRevenue ?? null,
    };
  });

  return (
    <AppPage width="wide" density="compact">
      <AppPageHeader
        title={copy.page.title}
        description={copy.page.description}
      />

      {!result.success ? (
        <p className="text-sm text-destructive">{result.error}</p>
      ) : (
        <RevenueTargetsClient
          yearMonth={yearMonth}
          initialRows={rowsWithProgress}
        />
      )}
    </AppPage>
  );
}
