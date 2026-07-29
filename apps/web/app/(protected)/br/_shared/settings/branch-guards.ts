import type { ActionContext } from "@/_lib/with-action";

export async function verifyBranchOwnership(
  supabase: ActionContext["supabase"],
  branchId: number,
  tenantId: number,
): Promise<boolean> {
  const { data } = await supabase
    .from("branches")
    .select("id")
    .eq("id", branchId)
    .eq("tenant_id", tenantId)
    .single();
  return !!data;
}

export function canOperateBranch(
  claimsBranchId: number | null,
  targetBranchId: number,
): boolean {
  if (claimsBranchId === null) return true;
  return claimsBranchId === targetBranchId;
}
