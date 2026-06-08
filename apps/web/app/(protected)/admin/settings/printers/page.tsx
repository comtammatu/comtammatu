import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@comtammatu/ui/components/button";
import { Activity as IconActivity } from "lucide-react";
import {
  canManageBranchFloorSettings,
  TENANT_LEVEL_ROLES,
} from "@comtammatu/shared/auth";
import { loadAuthState } from "@/_lib/auth";
import {
  PrintersClient,
  type Agent,
  type Category,
  type Printer,
} from "./printers-client";
import { SettingsPageShell } from "../settings-page-shell";
import { messages } from "@lib/messages";

export default async function PrintersPage() {
  const { supabase, claims } = await loadAuthState();

  if (!canManageBranchFloorSettings(claims.user_role)) {
    redirect("/admin/settings");
  }

  let branchesQuery = supabase
    .from("branches")
    .select("id, name")
    .eq("is_active", true)
    .order("name");

  let printersQuery = supabase
    .from("printers")
    .select(
      "id, branch_id, role, name, lan_host, lan_port, paper_width_mm, code_page, is_active",
    )
    .order("branch_id")
    .order("role");

  let agentsQuery = supabase
    .from("printer_agent_status")
    .select("branch_id, agent_id, version, last_seen_at, is_online");

  const categoriesQuery = supabase
    .from("menu_categories")
    .select("id, name, type, sort_order")
    .eq("is_active", true)
    .order("sort_order")
    .order("name");

  const isTenantLevel = (TENANT_LEVEL_ROLES as readonly string[]).includes(
    claims.user_role,
  );
  const scopedBranch = isTenantLevel ? null : claims.branch_id;
  if (scopedBranch) {
    branchesQuery = branchesQuery.eq("id", scopedBranch);
    printersQuery = printersQuery.eq("branch_id", scopedBranch);
    agentsQuery = agentsQuery.eq("branch_id", scopedBranch);
  }

  const [branchesRes, printersRes, agentsRes, categoriesRes] =
    await Promise.all([
      branchesQuery,
      printersQuery,
      agentsQuery,
      categoriesQuery,
    ]);

  if (branchesRes.error) throw new Error("Không thể tải chi nhánh");
  if (printersRes.error) throw new Error("Không thể tải máy in");
  if (categoriesRes.error) throw new Error("Không thể tải danh mục");

  // HKD lean baseline: per-printer print-type / category routing is out of
  // scope, so every printer carries empty routing lists.
  const printers = (printersRes.data ?? []).map((printer) => ({
    ...printer,
    print_types: [] as string[],
    category_ids: [] as number[],
  }));

  return (
    <SettingsPageShell
      title={messages.settings.pages.printersTitle}
      description={messages.settings.pages.printersDescription}
      actions={
        <Button asChild variant="outline" size="sm" className="gap-1">
          <Link href="/admin/settings/printers/jobs">
            <IconActivity className="size-3.5" />
            {messages.settings.pages.printMonitor}
          </Link>
        </Button>
      }
    >
      <PrintersClient
        branches={branchesRes.data ?? []}
        printers={printers as Printer[]}
        agents={(agentsRes.data ?? []) as Agent[]}
        categories={(categoriesRes.data ?? []) as Category[]}
      />
    </SettingsPageShell>
  );
}
