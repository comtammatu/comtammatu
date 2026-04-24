import { notFound, redirect } from "next/navigation";
import { createClient } from "@comtammatu/database/supabase/server";
import { extractClaimsFromAccessToken } from "@comtammatu/shared/auth";
import {
  INVENTORY_FEATURE_FLAGS,
  isFeatureEnabledForBranch,
} from "../../_lib/feature-flags";
import { parseBranchIdParam } from "../../_lib/inventory-scope";
import { AutoWasteListClient } from "./auto-list-client";

export const dynamic = "force-dynamic";

export default async function AutoWasteListPage({
  searchParams,
}: {
  searchParams: Promise<{ branchId?: string | string[] }>;
}) {
  const params = await searchParams;
  const requested = parseBranchIdParam(params.branchId);

  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) redirect("/login?next=/inventory/waste/auto");

  const claims = extractClaimsFromAccessToken(session.access_token);
  if (!claims) notFound();

  const branchId = requested ?? claims.branch_id ?? null;
  if (branchId === null) {
    redirect("/inventory/waste?error=branch_required");
  }

  const flagEnabled = await isFeatureEnabledForBranch(
    supabase,
    branchId,
    INVENTORY_FEATURE_FLAGS.S11_EXT_AUTO_WASTE,
  );
  if (!flagEnabled) {
    redirect(`/inventory/waste?branchId=${branchId}&error=auto_waste_not_enabled`);
  }

  // Read the last 50 auto-generated waste headers for this branch.
  // Source-type filter covers POS return + KDS mid/after cook stages.
  const { data } = await supabase
    .from("stock_issues")
    .select(
      "id, issued_at, source_type, source_ref, approval_status, notes, branch_id, created_by, stock_issue_items(id, ingredient_id, quantity, unit, total_cost, reason_code, ingredients(name))",
    )
    .eq("branch_id", branchId)
    .eq("issue_type", "writeoff")
    .in("source_type", [
      "pos_return",
      "kds_cancel_mid_cook",
      "kds_cancel_after_cook",
    ])
    .order("issued_at", { ascending: false })
    .limit(50);

  const rows = (data ?? []).map((r) => {
    const raw = r as Record<string, unknown>;
    const items =
      ((raw.stock_issue_items ?? []) as Array<Record<string, unknown>>).map(
        (it) => ({
          id: Number(it.id ?? 0),
          ingredientName: String(
            (it.ingredients as { name?: string } | null)?.name ?? "",
          ),
          quantity: Number(it.quantity ?? 0),
          unit: String(it.unit ?? ""),
          totalCost: Number(it.total_cost ?? 0),
          reasonCode: (it.reason_code ?? null) as string | null,
        }),
      ) ?? [];
    return {
      id: Number(raw.id ?? 0),
      issuedAt: String(raw.issued_at ?? ""),
      sourceType: String(raw.source_type ?? ""),
      sourceRef: (raw.source_ref ?? null) as Record<string, unknown> | null,
      approvalStatus: String(raw.approval_status ?? "not_required"),
      notes: (raw.notes ?? null) as string | null,
      items,
    };
  });

  return <AutoWasteListClient branchId={branchId} rows={rows} />;
}
