import { redirect } from "next/navigation";
import { loadAuthState } from "@/_lib/auth";
import { BranchTable } from "./branch-table";
import { AddBranchButton } from "./add-branch-button";
import { SettingsPageShell } from "../settings-page-shell";
import { messages } from "@lib/messages";

export default async function BranchesPage() {
  const { supabase, claims } = await loadAuthState();

  if (!["owner", "super_manager"].includes(claims.user_role)) {
    redirect("/admin/settings/tables");
  }

  const { data: branches } = await supabase
    .from("branches")
    .select("id, name, address, phone, is_active, branch_kind")
    .order("branch_kind")
    .order("name");

  // Check which branches have attendance secrets configured
  const { data: configs } = await supabase
    .from("branch_attendance_config")
    .select("branch_id")
    .eq("tenant_id", claims.tenant_id);

  const configuredBranchIds = new Set((configs ?? []).map((c) => c.branch_id));

  const { data: checklistTemplates } = await supabase
    .from("shift_checklist_templates")
    .select("id, branch_id")
    .eq("tenant_id", claims.tenant_id)
    .eq("is_active", true);

  const templateIds = (checklistTemplates ?? []).map((template) => template.id);
  const { data: checklistItems } =
    templateIds.length > 0
      ? await supabase
          .from("shift_checklist_template_items")
          .select("template_id, title, sort_order")
          .eq("tenant_id", claims.tenant_id)
          .eq("is_active", true)
          .in("template_id", templateIds)
          .order("sort_order")
      : { data: [] };

  const templateBranchById = new Map(
    (checklistTemplates ?? []).map((template) => [
      template.id,
      template.branch_id,
    ]),
  );
  const checklistByBranchId = new Map<number, string[]>();
  for (const item of checklistItems ?? []) {
    const branchId = templateBranchById.get(item.template_id);
    if (!branchId) continue;
    const list = checklistByBranchId.get(branchId) ?? [];
    list.push(item.title);
    checklistByBranchId.set(branchId, list);
  }

  const branchesWithConfig = (branches ?? []).map((b) => ({
    ...b,
    hasAttendanceSecret: configuredBranchIds.has(b.id),
    checklistItems: checklistByBranchId.get(b.id) ?? [],
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
