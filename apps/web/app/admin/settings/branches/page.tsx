import { redirect } from "next/navigation";
import { createClient } from "@comtammatu/database/supabase/server";
import { extractClaims } from "@comtammatu/shared/auth";
import { BranchTable } from "./branch-table";
import { AddBranchButton } from "./add-branch-button";
import { hasBranchKindSchema } from "../../_lib/branch-kind-schema";

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

  const branchKindSchemaAvailable = await hasBranchKindSchema(supabase);

  const branchesQuery = branchKindSchemaAvailable
    ? supabase
        .from("branches")
        .select(
          "id, name, address, phone, is_active, is_headquarters, branch_kind, latitude, longitude",
        )
        .order("is_headquarters", { ascending: false })
        .order("name")
    : supabase
        .from("branches")
        .select(
          "id, name, address, phone, is_active, is_headquarters, latitude, longitude",
        )
        .order("is_headquarters", { ascending: false })
        .order("name");

  const { data: branches } = await branchesQuery;

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
    branch_kind:
      "branch_kind" in b && typeof b.branch_kind === "string"
        ? b.branch_kind
        : null,
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
        <AddBranchButton branchKindSchemaAvailable={branchKindSchemaAvailable} />
      </div>
      {!branchKindSchemaAvailable && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          Database hiện tại chưa có cột <code>branch_kind</code>. Danh sách
          điểm vận hành vẫn dùng được, nhưng phân loại bếp trung tâm sẽ chỉ hoạt động
          sau khi migration được áp dụng.
        </div>
      )}
      <BranchTable
        branches={branchesWithConfig}
        branchKindSchemaAvailable={branchKindSchemaAvailable}
      />
    </div>
  );
}
