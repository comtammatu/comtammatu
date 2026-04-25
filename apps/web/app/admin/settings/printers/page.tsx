import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@comtammatu/ui/components/button";
import { Activity as IconActivity } from "lucide-react";
import {
  canManageBranchFloorSettings,
  TENANT_LEVEL_ROLES,
} from "@comtammatu/shared/auth";
import { loadAuthState } from "@/_lib/auth";
import { PrintersClient, type Printer, type Agent } from "./printers-client";

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
      "id, branch_id, role, name, connection_type, lan_host, lan_port, usb_vendor_id, usb_product_id, paper_width_mm, code_page, is_active",
    )
    .order("branch_id")
    .order("role");

  let agentsQuery = supabase
    .from("printer_agent_status")
    .select("branch_id, agent_id, version, last_seen_at, is_online");

  const isTenantLevel = (TENANT_LEVEL_ROLES as readonly string[]).includes(
    claims.user_role,
  );
  const scopedBranch = isTenantLevel ? null : claims.branch_id;
  if (scopedBranch) {
    branchesQuery = branchesQuery.eq("id", scopedBranch);
    printersQuery = printersQuery.eq("branch_id", scopedBranch);
    agentsQuery = agentsQuery.eq("branch_id", scopedBranch);
  }

  const [branchesRes, printersRes, agentsRes] = await Promise.all([
    branchesQuery,
    printersQuery,
    agentsQuery,
  ]);

  if (branchesRes.error) throw new Error("Không thể tải chi nhánh");
  if (printersRes.error) throw new Error("Không thể tải máy in");

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Máy in</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Cấu hình 3 máy in mỗi chi nhánh: hoá đơn, bếp 1, bếp 2
          </p>
        </div>
        <Button asChild variant="outline" size="sm" className="gap-1">
          <Link href="/admin/settings/printers/jobs">
            <IconActivity className="size-3.5" />
            Giám sát in
          </Link>
        </Button>
      </div>
      <PrintersClient
        branches={branchesRes.data ?? []}
        printers={(printersRes.data ?? []) as Printer[]}
        agents={(agentsRes.data ?? []) as Agent[]}
      />
    </div>
  );
}
