import { notFound, redirect } from "next/navigation";
import { loadProductionSurfaceData } from "@/(protected)/inventory/production-data";
import { resolveBranchContext } from "@/_lib/branch-context";
import { loadAuthState } from "@/_lib/auth";
import { parseOperatorBranchId } from "../../../_lib/parse-branch-id";
import { ProductionOperatorClient } from "./production-operator-client";

interface PageProps {
  params: Promise<{ branchId: string }>;
}

export default async function OperatorProductionPage({ params }: PageProps) {
  const { branchId: rawBranchId } = await params;
  const branchId = parseOperatorBranchId(rawBranchId);
  if (branchId == null) notFound();

  const { supabase, claims } = await loadAuthState();
  const branchContext = await resolveBranchContext(supabase, claims, branchId);
  if (!branchContext) notFound();
  if (branchContext.branch.branch_kind === "branch") {
    redirect(`/br/${branchId}/stock`);
  }

  const data = await loadProductionSurfaceData({ routeBranchId: branchId });
  const scopedRuns = data.runs.filter(
    (run) => run.branch_id === branchId || run.target_branch_id === branchId,
  );

  return (
    <ProductionOperatorClient
      branchId={branchId}
      canCreateProduction={data.canCreateProduction}
      runs={scopedRuns}
    />
  );
}
