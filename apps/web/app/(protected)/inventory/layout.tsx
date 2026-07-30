import type { ReactNode } from "react";
import { canSubscribeBranchOpsTopic } from "@comtammatu/shared/auth";
import { loadAuthState } from "@/_lib/auth";
import { BranchOpsRefresh } from "@/(protected)/br/[branchId]/(operator)/branch-ops-refresh";
import { resolveInventoryBranchScope } from "./_lib/inventory-scope";

export default async function InventoryLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { supabase, claims } = await loadAuthState();
  const scope = await resolveInventoryBranchScope(supabase, claims, null);

  return (
    <>
      {scope.selectedBranchId &&
      canSubscribeBranchOpsTopic(claims, scope.selectedBranchId) ? (
        <BranchOpsRefresh branchId={scope.selectedBranchId} />
      ) : null}
      {children}
    </>
  );
}
