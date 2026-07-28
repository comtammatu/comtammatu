import { Suspense } from "react";
import { notFound } from "next/navigation";
import { canAccess, PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { headers } from "next/headers";
import { loadAuthState, probePermission } from "@/_lib/auth";
import { resolveBranchContext } from "@/_lib/branch-context";
import { AppEmptyState, AppPage, AppPageHeader } from "@/components/surface";
import { listFeedbackQrCodes } from "@/(protected)/feedback/actions";
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
      <AppPage width="wide">
        <AppPageHeader title={feedbackCopy.qrTitle} />
        <AppEmptyState mode="no-access" />
      </AppPage>
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
      .select("id, number")
      .eq("tenant_id", claims.tenant_id)
      .eq("branch_id", branchId)
      .order("number"),
  ]);

  return (
    <AppPage width="wide">
      <AppPageHeader title={feedbackCopy.qrTitle} />
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
            branchId={branchId}
            tables={tablesResult.data ?? []}
            canManage={canManage}
            lockBranch
          />
        </Suspense>
      )}
    </AppPage>
  );
}
