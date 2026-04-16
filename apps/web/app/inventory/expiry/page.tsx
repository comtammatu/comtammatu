import { createClient } from "@comtammatu/database/supabase/server";
import { extractClaims } from "@comtammatu/shared/auth";
import { fetchExpiryAlerts } from "@/inventory/actions";
import { ExpiryListClient } from "@/inventory/expiry/expiry-list-client";
import type { BranchOption, ExpiryAlertRow } from "@/inventory/page";

export default async function ExpiryPage() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const claims = session?.user
    ? extractClaims(session.user.app_metadata)
    : null;

  const [alertsRes, branchesRes] = await Promise.all([
    fetchExpiryAlerts(),
    supabase.from("branches").select("id, name, is_active").order("name"),
  ]);

  const alerts: ExpiryAlertRow[] = alertsRes.success
    ? ((alertsRes.data ?? []) as ExpiryAlertRow[])
    : [];
  const branches: BranchOption[] = (branchesRes.data ?? []).filter(
    (branch) => branch.is_active === true,
  ) as BranchOption[];

  return (
    <ExpiryListClient
      initial={alerts}
      branches={branches}
      userRole={claims?.user_role ?? "branch_manager"}
      userBranchId={claims?.branch_id ?? null}
    />
  );
}
