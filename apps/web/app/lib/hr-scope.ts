export type HrBranchScope = "all" | "office" | `${number}`;

type BranchLike = { id: number };

export function resolveHrBranchScope(
  raw: string | string[] | null | undefined,
  branches?: readonly BranchLike[],
): HrBranchScope {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === "all" || value === "office") return value;

  const branchId = Number(value);
  if (!Number.isSafeInteger(branchId) || branchId <= 0) return "all";
  if (branches && !branches.some((branch) => branch.id === branchId)) {
    return "all";
  }
  return String(branchId) as HrBranchScope;
}

export function getHrScopeBranchId(scope: HrBranchScope): number | null {
  if (scope === "all" || scope === "office") return null;
  return Number(scope);
}

export function matchesHrBranchScope(
  branchId: number | null,
  scope: HrBranchScope,
): boolean {
  if (scope === "all") return true;
  if (scope === "office") return branchId == null;
  return branchId === Number(scope);
}

export function withHrBranchScope(
  href: string,
  scope: HrBranchScope,
): string {
  const [pathname, query = ""] = href.split("?", 2);
  if (pathname !== "/hr" && !pathname?.startsWith("/hr/")) return href;
  const params = new URLSearchParams(query);
  params.set("branch", scope);
  return `${pathname}?${params.toString()}`;
}
