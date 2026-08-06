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
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { branchId: rawBranchId } = await params;
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
  );

  return (
    <BranchOperatorPage
      title={messages.settings.branch.closeDayTitle}
      description={context.branch.name}
    >
      <CloseDayClient
        branchId={context.branchId}
        summary={data.summary}
        sessions={data.sessions}
        businessDate={data.businessDate}
        loadFailed={data.loadFailed}
      />
    </BranchOperatorPage>
  );
}
