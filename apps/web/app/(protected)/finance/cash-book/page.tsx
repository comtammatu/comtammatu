import { AppPage, AppPageHeader } from "@/components/surface";
import { messages } from "@lib/messages";
import { fetchAccessibleBranches } from "../actions";
import { fetchCashEntries } from "../cash-book-actions";
import { FilterBar } from "../components/filter-bar";
import {
  parseFinanceParams,
  resolveFinanceRange,
} from "../_lib/finance-params";
import type { FinanceRange } from "../_lib/finance-params";
import type { CashEntryRow } from "../_lib/cash-book";
import { CashBookClient } from "./cash-book-client";

type SearchParams = Record<string, string | string[] | undefined>;

const financeCopy = messages.finance;
const cashCopy = financeCopy.cashBook;
const HKD_RANGES: readonly FinanceRange[] = ["today", "yesterday", "7d", "mtd"];

type AccessibleBranch = { id: number; name: string };

export default async function CashBookPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const rawParams = searchParams ? await searchParams : {};
  const params = parseFinanceParams(rawParams);
  const resolved = resolveFinanceRange(params);

  const [branchesRes, entriesRes] = await Promise.all([
    fetchAccessibleBranches(),
    fetchCashEntries(params.branch, resolved.start, resolved.end),
  ]);

  const branches = (
    branchesRes.success ? (branchesRes.data ?? []) : []
  ) as AccessibleBranch[];
  const entries = (
    entriesRes.success ? (entriesRes.data ?? []) : []
  ) as CashEntryRow[];

  const totalIn = entries
    .filter((e) => e.direction === "in")
    .reduce((sum, e) => sum + Number(e.amount), 0);
  const totalOut = entries
    .filter((e) => e.direction === "out")
    .reduce((sum, e) => sum + Number(e.amount), 0);

  return (
    <AppPage width="wide" density="compact">
      <AppPageHeader
        eyebrow={cashCopy.eyebrow}
        title={cashCopy.title}
        description={cashCopy.description}
        meta={financeCopy.basic.periodMeta(resolved.start, resolved.end)}
      />

      <FilterBar
        params={params}
        branches={branches}
        basePath="/finance/cash-book"
        ranges={HKD_RANGES}
        hide={["granularity", "compare", "payment"]}
      />

      <CashBookClient
        entries={entries}
        branches={branches}
        defaultBranchId={params.branch}
        totalIn={totalIn}
        totalOut={totalOut}
      />
    </AppPage>
  );
}
