import { loadAuthState } from "@/_lib/auth";
import { ChecklistAssignmentClient } from "./checklist-assignment-client";

export async function ChecklistAssignment({
  branchId,
}: {
  branchId: number;
}) {
  const { supabase, claims } = await loadAuthState();

  // Fetch active templates
  const { data: templatesRes } = await supabase
    .from("shift_checklist_templates")
    .select("id, name, branch_id")
    .eq("tenant_id", claims.tenant_id)
    .eq("is_active", true)
    .order("id");

  // Filter templates: allow global (branch_id IS NULL) or branch specific
  const templates = (templatesRes ?? []).filter(
    (t) => t.branch_id === null || t.branch_id === branchId
  );

  // Fetch employees for this branch
  const { data: employeesRes } = await supabase
    .from("employees")
    .select(`
      id,
      default_checklist_template_id,
      profiles!inner(full_name, branch_id)
    `)
    .eq("tenant_id", claims.tenant_id)
    .eq("is_active", true)
    .eq("profiles.branch_id", branchId)
    .order("id");

  const employees = (employeesRes ?? []).map((emp) => ({
    id: emp.id,
    name: (emp.profiles as unknown as { full_name: string })?.full_name ?? "Nhân viên",
    templateId: emp.default_checklist_template_id,
  }));

  return (
    <ChecklistAssignmentClient
      branchId={branchId}
      employees={employees}
      templates={templates}
    />
  );
}
