import { redirect } from "next/navigation";

// /finance is now an alias for /finance/revenue (the canonical KPI
// surface). Two pages were drifting (/finance overview KPIs vs
// /finance/revenue detailed KPIs from the same RPCs) so we collapsed
// to one. Owners landing on the old URL get pushed to today's revenue.

export default function FinancePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Preserve any compatible query params (branch, range, ...) so saved
  // bookmarks keep working. Anything else is dropped silently.
  void searchParams;
  redirect("/finance/revenue?range=today");
}
