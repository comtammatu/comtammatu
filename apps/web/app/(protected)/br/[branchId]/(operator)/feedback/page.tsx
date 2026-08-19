import { notFound } from "next/navigation";
import { canAccess } from "@comtammatu/shared/auth";
import { loadAuthState } from "@/_lib/auth";
import { resolveBranchContext } from "@/_lib/branch-context";
import { AppEmptyState } from "@/components/surface";
import { BranchFeedbackPage } from "./_components/branch-feedback-page";
import { listFeedbackInbox } from "@/(protected)/feedback/actions";
import { feedbackCopy } from "@lib/messages/feedback";
import { parseOperatorBranchId } from "../../_lib/parse-branch-id";
import { BranchFeedbackInboxList } from "./_components/branch-feedback-inbox-list";
import { BranchFeedbackTabs } from "./_components/branch-feedback-tabs";

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
      <BranchFeedbackPage branchId={branchId} title={feedbackCopy.pageTitle}>
        <AppEmptyState mode="no-access" />
      </BranchFeedbackPage>
    );
  }

  const query = searchParams ? await searchParams : {};
  const rawPage = firstParam(query.page);
  const page =
    rawPage && /^\d+$/.test(rawPage) ? Math.max(1, Number(rawPage)) : 1;

  const inbox = await listFeedbackInbox({ branchId, page });
  const inboxHref = `/br/${branchId}/feedback`;
  const qrHref = `/br/${branchId}/feedback/qr`;

  return (
    <BranchFeedbackPage branchId={branchId} title={feedbackCopy.pageTitle}>
      <div className="flex flex-col gap-3">
        <BranchFeedbackTabs
          inboxHref={inboxHref}
          qrHref={qrHref}
          active="inbox"
        />
        {!inbox.success || !inbox.data ? (
          <AppEmptyState
            mode="error"
            description={inbox.error ?? feedbackCopy.inboxLoadFailed}
          />
        ) : (
          <BranchFeedbackInboxList
            items={inbox.data.items}
            total={inbox.data.total}
            page={inbox.data.page}
            basePath={inboxHref}
          />
        )}
      </div>
    </BranchFeedbackPage>
  );
}
