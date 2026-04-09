import { createClient } from "@comtammatu/database/supabase/server";
import { extractClaims } from "@comtammatu/shared/auth";
import { StockMovementClient } from "./stock-movement-client";

export default async function StockMovementReportPage() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const claims = session?.user
    ? extractClaims(session.user.app_metadata)
    : null;

  const { data: branches } = await supabase
    .from("branches")
    .select("id, name, is_active")
    .order("name");

  const activeBranches = (branches ?? [])
    .filter((b) => b.is_active === true)
    .map((b) => ({ id: b.id, name: b.name }));

  const userBranchId =
    claims?.user_role === "branch_manager" ? claims.branch_id : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Biến động tồn kho</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tồn đầu kỳ, nhập, xuất, tiêu thụ, điều chỉnh, tồn cuối kỳ theo kỳ
        </p>
      </div>
      <StockMovementClient
        branches={activeBranches}
        userBranchId={userBranchId}
      />
    </div>
  );
}
