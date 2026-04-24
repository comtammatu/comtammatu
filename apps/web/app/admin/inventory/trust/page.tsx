import { notFound, redirect } from "next/navigation";
import { PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { createClient } from "@comtammatu/database/supabase/server";
import { getAuthContextWithPermission } from "@/inventory/_lib/auth";
import { parseBranchIdParam } from "@/inventory/_lib/inventory-scope";
import { getBranchSiteDisplayName } from "@/inventory/_lib/branch-site-labels";
import { getTrustLeaderboard } from "@/inventory/trust-actions";
import { TrustLeaderboardClient } from "./trust-leaderboard-client";

export const dynamic = "force-dynamic";

export default async function TrustLeaderboardAdminPage({
  searchParams,
}: {
  searchParams: Promise<{
    branchId?: string | string[];
    computed?: string;
  }>;
}) {
  const ctx = await getAuthContextWithPermission(
    [],
    PERMISSION_KEYS.REPORTS_VIEW_BRANCH,
  );
  if (!ctx) redirect("/");

  const params = await searchParams;
  const includeComputed = params.computed === "1";
  const requested = parseBranchIdParam(params.branchId);

  const supabase = await createClient();
  const { data: branchesRes } = await supabase
    .from("branches")
    .select("id, name, is_active, branch_kind")
    .eq("is_active", true)
    .order("name");

  const branches =
    (branchesRes ?? []).map((b) => ({
      id: b.id as number,
      name: getBranchSiteDisplayName(b),
    })) ?? [];

  if (branches.length === 0) notFound();

  const branchId = requested ?? branches[0]?.id ?? null;
  if (branchId === null) notFound();

  const rowsRes = await getTrustLeaderboard(branchId, {
    limit: 200,
    includeComputed,
  });
  const rows = rowsRes.success && rowsRes.data ? rowsRes.data : [];

  return (
    <TrustLeaderboardClient
      branchId={branchId}
      branches={branches}
      rows={rows}
      includeComputed={includeComputed}
    />
  );
}
