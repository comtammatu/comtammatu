"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PERMISSION_KEYS, STAFF_ROLES } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getAuthContext, getAuthContextWithPermission } from "./_lib/auth";
import { INVENTORY_FEATURE_FLAG_META } from "./_lib/feature-flag-meta";

export type BranchFlagState = {
  branchId: number;
  branchName: string;
  flagKey: string;
  enabled: boolean;
  enabledAt: string | null;
  enabledBy: string | null;
  enabledByName: string | null;
  notes: string | null;
};

export type FlagMatrixBranch = {
  id: number;
  name: string;
};

export type FlagMatrixCell = {
  enabled: boolean;
  enabledAt: string | null;
  enabledBy: string | null;
  enabledByName: string | null;
};

export type FlagMatrix = {
  branches: FlagMatrixBranch[];
  flags: typeof INVENTORY_FEATURE_FLAG_META;
  /** Nested map: `state[flagKey][branchId] = cell` */
  state: Record<string, Record<number, FlagMatrixCell>>;
};

/**
 * Fetch full branch × flag matrix for the admin grid (non-write).
 * Any authenticated tenant user can read per RLS; we still surface it
 * through the server action for audit + consistent shape.
 */
export async function getFeatureFlagMatrix(): Promise<ActionResult<FlagMatrix>> {
  // Pass STAFF_ROLES (not []) — getAuthContext rejects if role NOT in list;
  // an empty list would therefore reject every authenticated user.
  const ctx = await getAuthContext(STAFF_ROLES);
  if (!ctx) return { success: false, error: "Chưa đăng nhập" };
  const { supabase } = ctx;

  const [branchesRes, flagsRes] = await Promise.all([
    supabase
      .from("branches")
      .select("id, name, is_active, branch_kind")
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("branch_feature_flags")
      .select(
        "branch_id, flag_key, enabled, enabled_at, enabled_by, notes, profiles:enabled_by(full_name)",
      ),
  ]);

  if (branchesRes.error) {
    return { success: false, error: "Không tải được danh sách chi nhánh" };
  }
  if (flagsRes.error) {
    return { success: false, error: "Không tải được feature flags" };
  }

  const branches = (branchesRes.data ?? []).map((b) => ({
    id: b.id as number,
    name: String(b.name ?? `CN #${b.id}`),
  }));

  const state: Record<string, Record<number, FlagMatrixCell>> = {};
  for (const meta of INVENTORY_FEATURE_FLAG_META) {
    state[meta.key] = {};
  }
  for (const row of flagsRes.data ?? []) {
    const raw = row as Record<string, unknown>;
    const flagKey = String(raw.flag_key ?? "");
    const branchId = Number(raw.branch_id ?? 0);
    if (!state[flagKey]) state[flagKey] = {};
    const prof = (raw.profiles ?? null) as { full_name?: string } | null;
    state[flagKey][branchId] = {
      enabled: Boolean(raw.enabled),
      enabledAt: (raw.enabled_at ?? null) as string | null,
      enabledBy: (raw.enabled_by ?? null) as string | null,
      enabledByName: prof?.full_name ?? null,
    };
  }

  return {
    success: true,
    data: {
      branches,
      flags: INVENTORY_FEATURE_FLAG_META,
      state,
    },
  };
}

/* ─── Toggle a single cell ─── */

const toggleSchema = z.object({
  branchId: z.coerce.number().int().positive(),
  flagKey: z.string().min(1).max(100),
  enabled: z.boolean(),
  notes: z.string().max(500).optional(),
});

/**
 * Flip one branch × flag cell. Permission gate mirrors RLS:
 * `settings:branch` for the target branch, OR tenant-wide `settings:tenant`.
 *
 * Writes `enabled_by = current user id` + `enabled_at = now()` for audit.
 * Re-running with same value is a no-op at the UI level (idempotent upsert).
 */
export async function setBranchFeatureFlag(
  input: z.infer<typeof toggleSchema>,
): Promise<
  ActionResult<{ branchId: number; flagKey: string; enabled: boolean }>
> {
  const parsed = toggleSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Input không hợp lệ",
    };
  }

  // Use branch-scoped perm check first; fall back to tenant-wide perm.
  let ctx = await getAuthContextWithPermission(
    STAFF_ROLES,
    PERMISSION_KEYS.SETTINGS_BRANCH,
    parsed.data.branchId,
  );
  if (!ctx) {
    ctx = await getAuthContextWithPermission(
      STAFF_ROLES,
      PERMISSION_KEYS.SETTINGS_TENANT,
    );
  }
  if (!ctx) return { success: false, error: "Không có quyền đổi feature flag" };
  const { supabase, user } = ctx;

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("branch_feature_flags")
    .upsert(
      {
        branch_id: parsed.data.branchId,
        flag_key: parsed.data.flagKey,
        enabled: parsed.data.enabled,
        enabled_at: now,
        enabled_by: user.id,
        notes: parsed.data.notes ?? null,
      },
      { onConflict: "branch_id,flag_key" },
    );

  if (error) {
    return { success: false, error: "Không lưu được flag" };
  }

  revalidatePath("/admin/inventory/feature-flags");
  revalidatePath("/admin/inventory");
  return {
    success: true,
    data: {
      branchId: parsed.data.branchId,
      flagKey: parsed.data.flagKey,
      enabled: parsed.data.enabled,
    },
  };
}

/* ─── Bulk: enable all inventory flags for a branch (pilot helper) ─── */

const bulkEnableSchema = z.object({
  branchId: z.coerce.number().int().positive(),
  /** Omit `flagKeys` to enable every inventory flag the UI knows about. */
  flagKeys: z.array(z.string().min(1).max(100)).optional(),
});

/**
 * One-click "enable inventory pilot on this branch" — turns on all canonical
 * inventory flags at once. Replaces the manual `scripts/enable-inventory-
 * pilot-flags.sql` path for owners.
 */
export async function bulkEnablePilotFlags(
  input: z.infer<typeof bulkEnableSchema>,
): Promise<
  ActionResult<{ branchId: number; enabledCount: number }>
> {
  const parsed = bulkEnableSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Input không hợp lệ",
    };
  }

  let ctx = await getAuthContextWithPermission(
    STAFF_ROLES,
    PERMISSION_KEYS.SETTINGS_BRANCH,
    parsed.data.branchId,
  );
  if (!ctx) {
    ctx = await getAuthContextWithPermission(
      STAFF_ROLES,
      PERMISSION_KEYS.SETTINGS_TENANT,
    );
  }
  if (!ctx) return { success: false, error: "Không có quyền đổi feature flag" };
  const { supabase, user } = ctx;

  const keys =
    parsed.data.flagKeys && parsed.data.flagKeys.length > 0
      ? parsed.data.flagKeys
      : INVENTORY_FEATURE_FLAG_META.filter((m) => !m.sprint.includes("deferred")).map(
          (m) => m.key,
        );

  const now = new Date().toISOString();
  const rows = keys.map((flagKey) => ({
    branch_id: parsed.data.branchId,
    flag_key: flagKey,
    enabled: true,
    enabled_at: now,
    enabled_by: user.id,
    notes: "pilot bulk enable",
  }));

  const { error } = await supabase
    .from("branch_feature_flags")
    .upsert(rows, { onConflict: "branch_id,flag_key" });

  if (error) {
    return { success: false, error: "Không bulk-enable được" };
  }

  revalidatePath("/admin/inventory/feature-flags");
  revalidatePath("/admin/inventory");
  return {
    success: true,
    data: { branchId: parsed.data.branchId, enabledCount: keys.length },
  };
}
