import { redirect } from "next/navigation";

// The revenue report is consolidated into the Finance surface to avoid
// fragmenting /admin/reports/* vs /finance/*. The old route stays as a
// redirect so bookmarks / old links keep working — preserves all query
// params (granularity, start, end, branch).
export default async function LegacyRevenueReportRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    if (typeof value === "string") {
      params.set(key, value);
    } else if (Array.isArray(value) && value.length > 0 && value[0] != null) {
      params.set(key, value[0]);
    }
  }
  const qs = params.toString();
  redirect(`/finance/revenue${qs ? `?${qs}` : ""}`);
}
