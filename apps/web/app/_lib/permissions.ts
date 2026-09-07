/**
 * Auth permission fetchers.
 *
 * Server helpers probe through the request-scoped `has_permission_batch`
 * coalescer. RLS remains the authoritative row gate.
 */

import type { PermissionKey } from "@comtammatu/shared/auth";
import { probePermissionKey } from "./permission-coalescer";

export interface UserPermission {
  permissionKey: string;
  branchId: number | null;
  sourceTemplate: number | null;
  grantedAt: string;
}

/**
 * Check if current user has a permission for a given branch (or tenant-wide).
 * Prefer calling this from Server Actions to gate UI. RLS is still the
 * authoritative enforcement layer.
 */
export async function currentUserHasPermission(
  branchId: number | null,
  key: PermissionKey | string,
): Promise<boolean> {
  return probePermissionKey(key, branchId);
}

/**
 * Check if current user has a permission in any branch or tenant scope.
 * Mirrors the RLS helper `public.has_permission_any`.
 */
export async function currentUserHasPermissionAny(
  key: PermissionKey | string,
): Promise<boolean> {
  return probePermissionKey(key, null);
}

/**
 * Returns true if the user has ANY of the given permission keys (tenant-wide
 * or branch-scoped). Probes enqueue into one `has_permission_batch` wave.
 * Empty `keys` returns `false`. Fail-closed.
 *
 * Spec: regressions.md MULTI-KEY-PERMISSION-PARALLEL.
 */
export async function currentUserHasAnyPermissionAny(
  keys: readonly (PermissionKey | string)[],
): Promise<boolean> {
  if (keys.length === 0) return false;
  const results = await Promise.all(
    keys.map((key) => currentUserHasPermissionAny(key)),
  );
  return results.some(Boolean);
}
