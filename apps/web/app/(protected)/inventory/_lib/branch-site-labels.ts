import { getInventorySiteLabelVi } from "@comtammatu/shared/labels";

type BranchSiteLike = {
  name: string;
  branch_kind?: string | null;
};

function getBranchSiteLabel(branch: BranchSiteLike): string {
  return getInventorySiteLabelVi(branch);
}

export function getBranchSiteDisplayName(branch: BranchSiteLike): string {
  return branch.name;
}

export function formatBranchSiteLabel(branch: BranchSiteLike): string {
  const siteLabel = getBranchSiteLabel(branch);
  const displayName = getBranchSiteDisplayName(branch);
  if (displayName === siteLabel) return siteLabel;
  return `${siteLabel}: ${displayName}`;
}
