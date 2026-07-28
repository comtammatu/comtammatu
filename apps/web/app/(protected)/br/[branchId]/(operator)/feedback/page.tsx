import { Suspense } from "react";
import { notFound } from "next/navigation";
import { canAccess } from "@comtammatu/shared/auth";
import { loadAuthState } from "@/_lib/auth";
import { resolveBranchContext } from "@/_lib/branch-context";
import { AppEmptyState } from "@/components/surface";
import { BranchOperatorPage } from "@lib/branch-operator/components/branch-operator-page";
import { listFeedbackInbox } from "@/(protected)/feedback/actions";
import { FeedbackInbox } from "@/(protected)/feedback/_components/feedback-inbox";
import { FeedbackSubNav } from "@/(protected)/feedback/_components/feedback-sub-nav";
import { feedbackCopy } from "@lib/messages/feedback";
import { parseOperatorBranchId } from "../../_lib/parse-branch-id";

function firstParam(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function BranchFeedbackInboxPage({
  params,
  searchParams,
}: {
  params: Promise<{ branchId: string }>;
  searchParams?: Promise<{ page?: string | string[] }>;
}) {
  const { branchId: rawBranchId } = await params;
  const branchId = parseOperatorBranchId(rawBranchId);
  if (branchId == null) notFound();

  const { supabase, claims } = await loadAuthState();
  const context = await resolveBranchContext(supabase, claims, branchId);
  if (!context) notFound();

  if (!canAccess(claims.user_role, "branch_feedback")) {
    return (
      <BranchOperatorPage title={feedbackCopy.pageTitle}>
        <AppEmptyState mode="no-access" />
      </BranchOperatorPage>
    );
  }

  const query = searchParams ? await searchParams : {};
  const rawPage = firstParam(query.page);
  const page =
    rawPage && /^\d+$/.test(rawPage) ? Math.max(1, Number(rawPage)) : 1;

  const inbox = await listFeedbackInbox({ branchId, page });

  return (
    <BranchOperatorPage title={feedbackCopy.pageTitle}>
      <FeedbackSubNav
        inboxHref={`/br/${branchId}/feedback`}
        qrHref={`/br/${branchId}/feedback/qr`}
      />
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
            branches={[]}
            selectedBranchId={branchId}
            basePath={`/br/${branchId}/feedback`}
            showBranchFilter={false}
            presentation="branch"
          />
        </Suspense>
      )}
    </BranchOperatorPage>
  );
}
