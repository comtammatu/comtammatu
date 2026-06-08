import { redirect } from "next/navigation";
import { loadAuthState } from "@/_lib/auth";
import { BranchTable } from "./branch-table";
import { AddBranchButton } from "./add-branch-button";
import { SettingsPageShell } from "../settings-page-shell";
import { messages } from "@lib/messages";

export default async function BranchesPage() {
  const { supabase, claims } = await loadAuthState();

  if (!["owner", "manager"].includes(claims.user_role)) {
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
    <SettingsPageShell
      title={messages.settings.pages.branchesTitle}
      description={messages.settings.pages.branchCount(branches?.length ?? 0)}
      actions={<AddBranchButton />}
    >
      <BranchTable branches={branchesWithConfig} />
    </SettingsPageShell>
  );
}
