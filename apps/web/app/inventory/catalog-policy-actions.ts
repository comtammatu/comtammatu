"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PERMISSION_KEYS, STAFF_ROLES } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getAuthContextWithPermission } from "./_lib/auth";

/* ─── Catalog review policy (S10 cold-chain admin) ─── */

export type CategoryReviewPolicyRow = {
  category: string;
  requiresManualReview: boolean;
  itemCount: number;
  updatedAt: string | null;
};

/**
 * List all distinct ingredient categories with their review-policy status.
 * Categories present in `ingredient_category_review_policy` get
 * `requiresManualReview=true`; categories not in the policy table default false.
 */
export async function getCategoryReviewPolicies(): Promise<
  ActionResult<CategoryReviewPolicyRow[]>
> {
  const ctx = await getAuthContextWithPermission(
    STAFF_ROLES,
    PERMISSION_KEYS.INVENTORY_READ,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims } = ctx;

  // Distinct categories with item count
  const { data: ingredientRows, error: ingError } = await supabase
    .from("ingredients")
    .select("category")
    .eq("tenant_id", claims.tenant_id)
    .eq("is_active", true);

  if (ingError) {
    return { success: false, error: "Không tải được danh mục" };
  }

  const counts = new Map<string, number>();
  for (const row of ingredientRows ?? []) {
    const cat = row.category;
    if (!cat) continue;
    counts.set(cat, (counts.get(cat) ?? 0) + 1);
  }

  const { data: policyRows, error: polError } = await supabase
    .from("ingredient_category_review_policy")
    .select("category, requires_manual_review, updated_at")
    .eq("tenant_id", claims.tenant_id);

  if (polError) {
    return { success: false, error: "Không tải được chính sách" };
  }

  const policyMap = new Map<string, { flag: boolean; updatedAt: string | null }>();
  for (const p of policyRows ?? []) {
    policyMap.set(p.category, {
      flag: Boolean(p.requires_manual_review),
      updatedAt: p.updated_at,
    });
  }

  const rows: CategoryReviewPolicyRow[] = Array.from(counts.entries())
    .map(([category, itemCount]) => {
      const existing = policyMap.get(category);
      return {
        category,
        requiresManualReview: existing?.flag ?? false,
        itemCount,
        updatedAt: existing?.updatedAt ?? null,
      };
    })
    .sort((a, b) => a.category.localeCompare(b.category, "vi"));

  return { success: true, data: rows };
}

const setCategorySchema = z.object({
  category: z.string().min(1).max(200),
  requiresManualReview: z.boolean(),
});

/**
 * Toggle the manual-review flag for a given ingredient category.
 * Admin-only (catalog_review_policy_set). Upserts to
 * `ingredient_category_review_policy`.
 */
export async function setCategoryReviewPolicy(
  input: z.infer<typeof setCategorySchema>,
): Promise<ActionResult<void>> {
  const parsed = setCategorySchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Input không hợp lệ" };
  }

  const ctx = await getAuthContextWithPermission(
    STAFF_ROLES,
    PERMISSION_KEYS.INVENTORY_CATALOG_REVIEW_POLICY_SET,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims } = ctx;

  const { error } = await supabase
    .from("ingredient_category_review_policy")
    .upsert(
      {
        tenant_id: claims.tenant_id,
        category: parsed.data.category,
        requires_manual_review: parsed.data.requiresManualReview,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id,category" },
    );

  if (error) {
    return { success: false, error: "Không lưu được chính sách" };
  }

  revalidatePath("/admin/inventory/cold-chain");
  return { success: true };
}
