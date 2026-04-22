import { redirect } from "next/navigation";
import { createClient } from "@comtammatu/database/supabase/server";
import { extractClaims } from "@comtammatu/shared/auth";
import { BranchTable } from "./branch-table";
import { AddBranchButton } from "./add-branch-button";

export default async function BranchesPage() {
  const supabase = await createClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const claims = session?.user
    ? extractClaims(session.user.app_metadata)
    : null;
  if (!claims || !["owner", "super_manager"].includes(claims.user_role)) {
    redirect("/admin/settings/tables");
  }

  const { data: branches } = await supabase
    .from("branches")
    .select(
      "id, name, address, phone, is_active, branch_kind, latitude, longitude",
    )
    .order("branch_kind")
    .order("name");

  // Check which branches have attendance secrets configured
  const { data: configs } = await supabase
    .from("branch_attendance_config")
    .select("branch_id")
    .eq("tenant_id", claims.tenant_id);

  const configuredBranchIds = new Set((configs ?? []).map((c) => c.branch_id));

  const branchesWithConfig = (branches ?? []).map((b) => ({
    ...b,
    latitude: b.latitude as number | null,
    longitude: b.longitude as number | null,
    hasAttendanceSecret: configuredBranchIds.has(b.id),
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Điểm vận hành</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {branches?.length ?? 0} điểm vận hành
          </p>
        </div>
        <AddBranchButton />
      </div>
      <BranchTable branches={branchesWithConfig} />
    </div>
  );
}
