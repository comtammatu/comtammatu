import { redirect } from "next/navigation";
import { canManageBranchFloorSettings } from "@comtammatu/shared/auth";
import { loadAuthState } from "@/_lib/auth";
import { TerminalsClient } from "./terminals-client";
import type { TerminalRow, BranchOption } from "./terminals-client";

export default async function PosSettingsPage() {
  const { supabase, claims } = await loadAuthState();

  if (!canManageBranchFloorSettings(claims.user_role)) {
    redirect("/admin/settings");
  }

  const branchFilter = claims.branch_id;

  let branchesQuery = supabase
    .from("branches")
    .select("id, name, is_active")
    .eq("is_active", true)
    .order("name");

  let terminalsQuery = supabase
    .from("pos_terminals")
    .select("id, name, branch_id, device_id, is_active")
    .order("name");

  if (branchFilter) {
    branchesQuery = branchesQuery.eq("id", branchFilter);
    terminalsQuery = terminalsQuery.eq("branch_id", branchFilter);
  }

  const [branchesRes, terminalsRes] = await Promise.all([
    branchesQuery,
    terminalsQuery,
  ]);

  if (branchesRes.error) throw new Error("Không thể tải chi nhánh");
  if (terminalsRes.error) throw new Error("Không thể tải máy POS");

  const branches = branchesRes.data as BranchOption[];
  const terminals = (terminalsRes.data ?? []) as TerminalRow[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">POS</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Quản lý máy POS theo chi nhánh để mở ca và chọn đúng quầy làm việc.
        </p>
      </div>

      <TerminalsClient branches={branches} terminals={terminals} />
    </div>
  );
}
