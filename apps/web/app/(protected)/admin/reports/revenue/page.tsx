import { redirect } from "next/navigation";

// Báo cáo doanh thu đã được hợp nhất vào surface Finance để tránh
// phân mảnh giữa /admin/reports/* và /finance/*. Giữ route cũ làm
// redirect để các bookmark / link cũ vẫn hoạt động — preserve mọi
// query params (granularity, start, end, branch).
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
