import { notFound } from "next/navigation";
import { formatVNLongDate } from "@comtammatu/shared/time";
import { AppEmptyState } from "@/components/surface";
import { BranchOperatorPage } from "@lib/branch-operator/components/branch-operator-page";
import { loadAuthState } from "@/_lib/auth";
import { messages } from "@lib/messages";
import { fetchBranchMenuDailyLimits } from "./actions";
import { MenuLimitsClient } from "./menu-limits-table";

export const dynamic = "force-dynamic";

export default async function BranchMenuLimitsPage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { branchId: branchIdStr } = await params;
  const branchId = Number(branchIdStr);
  if (!Number.isInteger(branchId) || branchId <= 0) {
    notFound();
  }

  const { supabase, claims } = await loadAuthState();

  const { data: branch } = await supabase
    .from("branches")
    .select("id, name, branch_kind, is_active")
    .eq("id", branchId)
    .eq("tenant_id", claims.tenant_id)
    .maybeSingle();

  if (!branch || !branch.is_active) notFound();

  const result = await fetchBranchMenuDailyLimits(branchId);

  const today = formatVNLongDate(new Date());

  return (
    <BranchOperatorPage
      title={messages.settings.branch.menuLimitsTitle}
      description={`${branch.name} · ${today}`}
    >
      {result.success && result.data ? (
        <MenuLimitsClient branchId={branchId} rows={result.data} />
      ) : (
        <AppEmptyState
          mode="error"
          compact
          description={
            result.error ?? messages.settings.branch.menuLimitsLoadFailed
          }
        />
      )}
    </BranchOperatorPage>
  );
}
