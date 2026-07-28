import { Suspense } from "react";
import { notFound } from "next/navigation";
import { canAccess, PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { headers } from "next/headers";
import { loadAuthState, probePermission } from "@/_lib/auth";
import { resolveBranchContext } from "@/_lib/branch-context";
import { AppEmptyState } from "@/components/surface";
import { BranchOperatorPage } from "@lib/branch-operator/components/branch-operator-page";
import { listFeedbackQrCodes } from "@/(protected)/feedback/actions";
import { CreateFeedbackQrButton } from "@/(protected)/feedback/_components/create-feedback-qr-button";
import { FeedbackSubNav } from "@/(protected)/feedback/_components/feedback-sub-nav";
import { QrManagement } from "@/(protected)/feedback/_components/qr-management";
import { feedbackCopy } from "@lib/messages/feedback";
import { parseOperatorBranchId } from "../../../_lib/parse-branch-id";

export default async function BranchFeedbackQrPage({
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

  if (!canAccess(claims.user_role, "branch_feedback")) {
    return (
      <BranchOperatorPage title={feedbackCopy.qrTitle}>
        <AppEmptyState mode="no-access" />
      </BranchOperatorPage>
    );
  }

  const canManage = await probePermission(
    { supabase, claims },
    PERMISSION_KEYS.FEEDBACK_MANAGE_QR,
    branchId,
  );

  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  const proto = headerStore.get("x-forwarded-proto") ?? "https";
  const origin = host ? `${proto}://${host}` : "http://localhost:3000";

  const [qrResult, tablesResult] = await Promise.all([
    listFeedbackQrCodes({ branchId, origin }),
    supabase
      .from("tables")
      .select("id, number, branch_id")
      .eq("tenant_id", claims.tenant_id)
      .eq("branch_id", branchId)
      .order("number"),
  ]);

  const tables = (tablesResult.data ?? []).map((table) => ({
    id: table.id,
    number: table.number,
    branchId: table.branch_id,
  }));

  return (
    <BranchOperatorPage
      title={feedbackCopy.qrTitle}
      action={
        canManage ? (
          <CreateFeedbackQrButton
            branchId={branchId}
            tables={tables}
            lockBranch
          />
        ) : null
      }
    >
      <FeedbackSubNav
        inboxHref={`/br/${branchId}/feedback`}
        qrHref={`/br/${branchId}/feedback/qr`}
      />
      {!qrResult.success || !qrResult.data ? (
        <AppEmptyState
          mode="error"
          description={qrResult.error ?? feedbackCopy.qrEmpty}
        />
      ) : (
        <Suspense>
          <QrManagement
            items={qrResult.data.items}
            canManage={canManage}
            lockBranch
            presentation="branch"
          />
        </Suspense>
      )}
    </BranchOperatorPage>
  );
}
