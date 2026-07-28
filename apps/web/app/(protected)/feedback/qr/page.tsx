import { loadAuthState } from "@/_lib/auth";
import { AppEmptyState, AppPage, AppPageHeader } from "@/components/surface";
import { listFeedbackQrCodes } from "../actions";
import { FeedbackSubNav } from "../_components/feedback-sub-nav";
import { QrManagement } from "../_components/qr-management";
import { feedbackCopy } from "@lib/messages/feedback";
import { headers } from "next/headers";

function firstParam(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function FeedbackQrPage({
  searchParams,
}: {
  searchParams?: Promise<{ branch?: string | string[] }>;
}) {
  const params = searchParams ? await searchParams : {};
  const { supabase, claims } = await loadAuthState();
  const rawBranch = firstParam(params.branch);
  const branchFilter =
    rawBranch && /^\d+$/.test(rawBranch) ? Number(rawBranch) : null;

  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  const proto = headerStore.get("x-forwarded-proto") ?? "https";
  const origin = host ? `${proto}://${host}` : "http://localhost:3000";

  const [{ data: branches }, qrResult] = await Promise.all([
    supabase
      .from("branches")
      .select("id, name")
      .eq("tenant_id", claims.tenant_id)
      .eq("branch_kind", "branch")
      .eq("is_active", true)
      .order("name"),
    listFeedbackQrCodes({ branchId: branchFilter, origin }),
  ]);

  const manageBranchId =
    branchFilter ?? branches?.[0]?.id ?? claims.branch_id ?? null;

  const tablesResult =
    manageBranchId != null
      ? await supabase
          .from("tables")
          .select("id, number")
          .eq("tenant_id", claims.tenant_id)
          .eq("branch_id", manageBranchId)
          .order("number")
      : { data: [] as { id: number; number: number }[] };

  return (
    <AppPage width="wide">
      <AppPageHeader title={feedbackCopy.qrTitle} />
      <FeedbackSubNav inboxHref="/feedback" qrHref="/feedback/qr" />
      {!qrResult.success || !qrResult.data || manageBranchId == null ? (
        <AppEmptyState
          mode="error"
          description={qrResult.error ?? feedbackCopy.qrEmpty}
        />
      ) : (
        <QrManagement
          items={qrResult.data.items}
          branchId={manageBranchId}
          tables={tablesResult.data ?? []}
          canManage
          lockBranch={false}
        />
      )}
    </AppPage>
  );
}
