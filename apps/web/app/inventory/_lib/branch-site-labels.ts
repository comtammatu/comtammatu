import { getInventorySiteLabelVi } from "@comtammatu/shared/labels";

type BranchSiteLike = {
  name: string;
  branch_kind?: string | null;
};

export function getBranchSiteLabel(branch: BranchSiteLike): string {
  return getInventorySiteLabelVi(branch);
}

export function formatBranchSiteLabel(branch: BranchSiteLike): string {
  return `${getBranchSiteLabel(branch)}: ${branch.name}`;
}
