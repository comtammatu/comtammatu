import { createClient } from "@comtammatu/database/supabase/server";
import { extractClaimsFromAccessToken } from "@comtammatu/shared/auth";
import { fetchStocktakeSessions } from "../actions";
import type {
  BranchOption,
  StocktakeSessionRow,
} from "./stocktake-list-client";
import { StocktakeListClient } from "./stocktake-list-client";
import { getBranchSiteDisplayName } from "../_lib/branch-site-labels";

export default async function StocktakePage() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const claims = session?.user
    ? extractClaimsFromAccessToken(session.access_token)
    : null;

  const [sessionsRes, branchesRes] = await Promise.all([
    fetchStocktakeSessions(),
    supabase
      .from("branches")
      .select("id, name, is_active, branch_kind")
      .order("name"),
  ]);

  const sessions: StocktakeSessionRow[] = sessionsRes.success
    ? ((sessionsRes.data ?? []) as StocktakeSessionRow[])
    : [];
  const branches: BranchOption[] = (branchesRes.data ?? [])
    .filter((b) => b.is_active === true)
    .map((b) => ({ ...b, name: getBranchSiteDisplayName(b) })) as BranchOption[];

  return (
    <StocktakeListClient
      initial={sessions}
      branches={branches}
      userRole={claims?.user_role ?? "branch_manager"}
      userBranchId={claims?.branch_id ?? null}
      routeBase="/inventory/stocktake"
    />
  );
}
