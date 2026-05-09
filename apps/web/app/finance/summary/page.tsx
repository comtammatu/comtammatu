import { AppPage, AppPageHeader } from "@/components/surface";
import { fetchAccessibleBranches } from "../actions";
import { listSummaryRunQueue } from "../summary-invoice-actions";
import { SummaryClient } from "./summary-client";
import type { AccessibleBranch, SummaryQueueRow } from "./types";

export default async function SummaryPage() {
  const [branchesRes, queueRes] = await Promise.all([
    fetchAccessibleBranches(),
    listSummaryRunQueue(null, 30),
  ]);

  const branches = (
    branchesRes.success ? (branchesRes.data ?? []) : []
  ) as AccessibleBranch[];
  const queue = (
    queueRes.success ? (queueRes.data ?? []) : []
  ) as SummaryQueueRow[];

  return (
    <AppPage>
      <AppPageHeader
        eyebrow="Kế toán · HĐĐT"
        title="HĐ tổng hợp B2C"
        description="Hoá đơn tổng hợp khách hàng không lấy hoá đơn theo TT 78/2021 §11.4. Cron tự động chạy 02:00 ICT mỗi ngày cho dữ liệu hôm trước; có thể trigger thủ công cho ngày cụ thể nếu cron lỗi hoặc cần re-run."
      />
      <SummaryClient initialBranches={branches} initialQueue={queue} />
    </AppPage>
  );
}
