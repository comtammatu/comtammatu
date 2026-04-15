import { createClient } from "@comtammatu/database/supabase/server";
import { extractClaims } from "@comtammatu/shared/auth";
import { APP_COPY_VI } from "@comtammatu/shared/labels";
import { PageContainer, PageHeader } from "@/components/v2/patterns";
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
    <PageContainer>
      <PageHeader
        eyebrow={APP_COPY_VI.executiveReporting}
        title="Biến động tồn kho"
      />
      <StockMovementClient
        branches={activeBranches}
        userBranchId={userBranchId}
      />
    </PageContainer>
  );
}
