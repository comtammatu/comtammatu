import { Suspense } from "react";
import { headers } from "next/headers";
import { loadAuthState } from "@/_lib/auth";
import { AppEmptyState, AppPageHeader } from "@/components/surface";
import { listFeedbackQrCodes } from "../actions";
import { CreateFeedbackQrButton } from "../_components/create-feedback-qr-button";
import { QrManagement } from "../_components/qr-management";
import { feedbackCopy } from "@lib/messages/feedback";

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

  const branchIds = (branches ?? []).map((branch) => branch.id);
  const tablesResult =
    branchIds.length > 0
      ? await supabase
          .from("tables")
          .select("id, number, branch_id")
          .eq("tenant_id", claims.tenant_id)
          .in("branch_id", branchIds)
          .order("number")
      : { data: [] as { id: number; number: number; branch_id: number }[] };

  const tables = (tablesResult.data ?? []).map((table) => ({
    id: table.id,
    number: table.number,
    branchId: table.branch_id,
  }));

  return (
    <>
      <AppPageHeader
        title={feedbackCopy.qrTitle}
        actions={
          manageBranchId != null ? (
            <CreateFeedbackQrButton
              branchId={manageBranchId}
              tables={tables}
              lockBranch={false}
              branches={branches ?? []}
            />
          ) : null
        }
      />
      {!qrResult.success || !qrResult.data || manageBranchId == null ? (
        <AppEmptyState
          mode="error"
          description={qrResult.error ?? feedbackCopy.qrEmpty}
        />
      ) : (
        <Suspense>
          <QrManagement
            key={branchFilter ?? "all"}
            items={qrResult.data.items}
            canManage
            lockBranch={false}
            branches={branches ?? []}
            selectedBranchId={branchFilter}
            basePath="/feedback/qr"
            showBranchFilter
            presentation="owner"
          />
        </Suspense>
      )}
    </>
  );
}
