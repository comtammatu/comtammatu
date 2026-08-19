import { notFound } from "next/navigation";
import { BranchOperatorPage } from "@lib/branch-operator/components/branch-operator-page";
import { loadAuthState } from "@/_lib/auth";
import { resolveBranchContext } from "@/_lib/branch-context";
import { messages } from "@lib/messages";
import { parseOperatorBranchId } from "../../_lib/parse-branch-id";
import { fetchCloseDayData } from "./data";
import { CloseDayClient } from "./close-day-client";

export default async function CloseDayPage({
  params,
  searchParams,
}: {
  params: Promise<{ branchId: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const { branchId: rawBranchId } = await params;
  const { date: requestedDate } = await searchParams;
  const branchId = parseOperatorBranchId(rawBranchId);
  if (branchId == null) notFound();

  const { supabase, claims } = await loadAuthState();
  const context = await resolveBranchContext(supabase, claims, branchId);
  if (!context) notFound();

  const data = await fetchCloseDayData(
    supabase,
    claims,
    context.branchId,
    context.branch.name,
    requestedDate,
  );

  return (
    <BranchOperatorPage
      title={messages.settings.branch.closeDayTitle}
      description={context.branch.name}
      hideHeaderOnMobile
    >
      <CloseDayClient
        branchId={context.branchId}
        report={data.report}
        sessions={data.sessions}
        attendance={data.attendance}
        businessDate={data.businessDate}
        todayBusinessDate={data.todayBusinessDate}
        pendingWasteCount={data.pendingWasteCount}
        pendingCountSlipsCount={data.pendingCountSlipsCount}
        pendingCheckoutsCount={data.pendingCheckoutsCount}
        loadFailed={data.loadFailed}
      />
    </BranchOperatorPage>
  );
}
