import { AppPage, AppPageHeader } from "@/components/surface";
import { messages } from "@lib/messages";
import { fetchAccessibleBranches } from "../actions";
import { listSummaryRunQueue } from "../summary-invoice-actions";
import { SummaryClient } from "./summary-client";
import type { AccessibleBranch, SummaryQueueRow } from "./types";

export default async function SummaryPage() {
  const copy = messages.finance.summaryPage;
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
        eyebrow={copy.eyebrow}
        title={copy.title}
        description={copy.description}
      />
      <SummaryClient initialBranches={branches} initialQueue={queue} />
    </AppPage>
  );
}
