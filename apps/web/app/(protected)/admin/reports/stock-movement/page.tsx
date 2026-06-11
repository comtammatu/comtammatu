import { APP_COPY_VI } from "@comtammatu/shared/labels";
import { loadAuthState } from "@/_lib/auth";
import { AppPage, AppPageHeader } from "@/components/surface";
import { messages } from "@lib/messages";
import { StockMovementClient } from "./stock-movement-client";

export default async function StockMovementReportPage() {
  const { supabase, claims } = await loadAuthState();

  const { data: branches } = await supabase
    .from("branches")
    .select("id, name, is_active")
    .order("name");

  const activeBranches = (branches ?? [])
    .filter((b) => b.is_active === true)
    .map((b) => ({ id: b.id, name: b.name }));

  const userBranchId =
    claims.user_role === "branch_manager" ? claims.branch_id : null;

  return (
    <AppPage>
      <AppPageHeader
        eyebrow={APP_COPY_VI.executiveReporting}
        title={messages.admin.reports.stockMovement.pageTitle}
        description={messages.admin.reports.stockMovement.pageDescription}
      />
      <StockMovementClient
        branches={activeBranches}
        userBranchId={userBranchId}
      />
    </AppPage>
  );
}
