import { createClient } from "@comtammatu/database/supabase/server";
import { extractClaims } from "@comtammatu/shared/auth";
import { ReportsClient } from "./reports-client";
import { PageHeader } from "@/components/foundation/ui-patterns";

export default async function ReportsPage() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const claims = session?.user
    ? extractClaims(session.user.app_metadata)
    : null;

  const { data: branchesRaw } = await supabase
    .from("branches")
    .select("id, name, is_active")
    .order("is_headquarters", { ascending: false })
    .order("name");

  const branches = (branchesRaw ?? [])
    .filter((b) => b.is_active === true)
    .map((b) => ({ id: b.id, name: b.name }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Báo cáo kho"
        description="Biến động tồn kho, tổng hợp chi nhánh, công nợ NCC và chênh lệch tiêu hao"
      />
      <ReportsClient
        branches={branches}
        defaultBranchId={claims?.branch_id ?? null}
      />
    </div>
  );
}
