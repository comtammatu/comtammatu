import { Card, CardContent } from "@comtammatu/ui/components/card";
import { APP_COPY_VI } from "@comtammatu/shared/labels";
import { loadAuthState } from "@/_lib/auth";
import { StockMovementClient } from "./stock-movement-client";

export default async function StockMovementReportPage() {
  const { supabase, claims } = await loadAuthState();

  const { data: branches } = await supabase
    .from("branches")
    .select("id, name, is_active")
    .order("name");

  const activeBranches = (branches ?? [])
    .filter((b) => b.is_active === true)
    .map((b) => ({ id: b.id, name: b.name }));

  const userBranchId =
    claims.user_role === "branch_manager" ? claims.branch_id : null;

  return (
    <div className="space-y-5 lg:space-y-6">
      <Card>
        <CardContent className="p-5 sm:p-6">
          <div className="space-y-3">
            <span className="inline-flex items-center rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
              {APP_COPY_VI.executiveReporting}
            </span>
            <div className="space-y-2">
              <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                Biến động tồn kho
              </h2>
            </div>
          </div>
        </CardContent>
      </Card>
      <StockMovementClient
        branches={activeBranches}
        userBranchId={userBranchId}
      />
    </div>
  );
}
