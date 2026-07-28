import { Suspense } from "react";
import { loadAuthState } from "@/_lib/auth";
import { AppEmptyState, AppPage, AppPageHeader } from "@/components/surface";
import { listFeedbackInbox } from "./actions";
import { FeedbackInbox } from "./_components/feedback-inbox";
import { FeedbackSubNav } from "./_components/feedback-sub-nav";
import { feedbackCopy } from "@lib/messages/feedback";

function firstParam(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function FeedbackInboxPage({
  searchParams,
}: {
  searchParams?: Promise<{ branch?: string | string[]; page?: string | string[] }>;
}) {
  const params = searchParams ? await searchParams : {};
  const { supabase, claims } = await loadAuthState();
  const rawBranch = firstParam(params.branch);
  const rawPage = firstParam(params.page);
  const branchId =
    rawBranch && /^\d+$/.test(rawBranch) ? Number(rawBranch) : null;
  const page =
    rawPage && /^\d+$/.test(rawPage) ? Math.max(1, Number(rawPage)) : 1;

  const [{ data: branches }, inbox] = await Promise.all([
    supabase
      .from("branches")
      .select("id, name")
      .eq("tenant_id", claims.tenant_id)
      .eq("branch_kind", "branch")
      .eq("is_active", true)
      .order("name"),
    listFeedbackInbox({ branchId, page }),
  ]);

  return (
    <AppPage width="wide">
      <AppPageHeader title={feedbackCopy.pageTitle} />
      <FeedbackSubNav inboxHref="/feedback" qrHref="/feedback/qr" />
      {!inbox.success || !inbox.data ? (
        <AppEmptyState
          mode="error"
          description={inbox.error ?? feedbackCopy.inboxLoadFailed}
        />
      ) : (
        <Suspense>
          <FeedbackInbox
            items={inbox.data.items}
            total={inbox.data.total}
            page={inbox.data.page}
            branches={branches ?? []}
            selectedBranchId={branchId}
            basePath="/feedback"
            showBranchFilter
          />
        </Suspense>
      )}
    </AppPage>
  );
}
