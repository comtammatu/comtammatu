import { createClient } from "@comtammatu/database/supabase/server";
import { extractClaims } from "@comtammatu/shared/auth";
import { fetchExpiryAlerts } from "@/admin/inventory/actions";
import { ExpiryListClient } from "@/admin/inventory/expiry/expiry-list-client";
import { PageHeader } from "../../_components/shared";
import type { BranchOption, ExpiryAlertRow } from "@/admin/inventory/page";

export default async function ExpirySettingsPage() {
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
    (b) => b.is_active === true,
  ) as BranchOption[];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Hạn sử dụng"
        description="Theo dõi và xử lý hàng hết hạn"
      />
      <ExpiryListClient
        initial={alerts}
        branches={branches}
        userRole={claims?.user_role ?? "branch_manager"}
        userBranchId={claims?.branch_id ?? null}
      />
    </div>
  );
}
