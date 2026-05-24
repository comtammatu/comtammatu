import {
  getInventorySiteLabelVi,
  getInventorySiteKindLabelVi,
  resolveSiteKind,
} from "@comtammatu/shared/labels";

type BranchSiteLike = {
  name: string;
  branch_kind?: string | null;
};

export function getBranchSiteLabel(branch: BranchSiteLike): string {
  return getInventorySiteLabelVi(branch);
}

function normalizeForCompare(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}

function isWarehouseDisplayAlias(name: string): boolean {
  const normalized = normalizeForCompare(name);
  return normalized === "tru so chinh" || normalized === "kho tong";
}

export function getBranchSiteDisplayName(branch: BranchSiteLike): string {
  const siteKind = resolveSiteKind(branch);
  if (siteKind === "central_warehouse" && isWarehouseDisplayAlias(branch.name)) {
    return getInventorySiteKindLabelVi(siteKind);
  }
  return branch.name;
}

export function formatBranchSiteLabel(branch: BranchSiteLike): string {
  const siteLabel = getBranchSiteLabel(branch);
  const displayName = getBranchSiteDisplayName(branch);
  if (displayName === siteLabel) return siteLabel;
  return `${siteLabel}: ${displayName}`;
}
