import { redirect } from "next/navigation";
import Link from "next/link";
import { AppPage, AppPageHeader } from "@/components/surface";
import { Button } from "@comtammatu/ui/components/button";
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import { loadAuthState } from "@/_lib/auth";
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
  const auth = await loadAuthState();
  if (auth.claims.user_role !== "owner") {
    redirect("/finance");
  }

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
  const monthInputValue = yearMonth.slice(0, 7);

  return (
    <AppPage width="wide" density="compact">
      <AppPageHeader
        title={copy.page.title}
        description={copy.page.description}
      />

      <form className="flex flex-wrap items-end gap-3" method="get">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="revenue-target-month">{copy.monthLabel}</Label>
          <Input
            id="revenue-target-month"
            type="month"
            name="month"
            defaultValue={monthInputValue}
            className="w-auto font-mono"
          />
        </div>
        <Button type="submit" variant="outline">
          {copy.applyMonth}
        </Button>
        <Button render={<Link href="/finance/revenue" />} variant="ghost">
          {messages.finance.nav.items.revenue}
        </Button>
      </form>

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
