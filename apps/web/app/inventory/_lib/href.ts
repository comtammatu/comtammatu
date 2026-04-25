/**
 * Build an inventory-page href that preserves `branchId` from the current
 * scope. When `branchId` is null (super_manager browsing tenant-wide), the
 * param is dropped entirely so the target page resolves its own default.
 *
 * Reused by Phase 4 click-through chips on Stock + Today's Playbook to keep
 * branch context when deep-linking across pages.
 */
export function branchHrefOrPath(
  branchId: number | null,
  path: string,
  extraParams?: Record<string, string | number | undefined>,
): string {
  const params = new URLSearchParams();
  if (branchId != null) params.set("branchId", String(branchId));
  if (extraParams) {
    for (const [key, value] of Object.entries(extraParams)) {
      if (value === undefined || value === "") continue;
      params.set(key, String(value));
    }
  }
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}
