import { createClient } from "@comtammatu/database/supabase/server";
import { extractClaims } from "@comtammatu/shared/auth";
import { redirect } from "next/navigation";
import { ShiftAssignmentsClient } from "./shift-assignments-client";

export default async function ShiftAssignmentsPage() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) redirect("/login");

  const claims = extractClaims(session.user.app_metadata);
  if (!claims) redirect("/login");

  const [{ data: branches }, { data: employees }] = await Promise.all([
    supabase
      .from("branches")
      .select("id, name")
      .eq("tenant_id", claims.tenant_id)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("employees")
      .select(
        `
        id, employee_code, is_active,
        profiles ( full_name, branch_id )
      `,
      )
      .eq("tenant_id", claims.tenant_id)
      .eq("is_active", true),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Phân ca làm việc</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Xếp lịch ca cho nhân viên theo tuần
        </p>
      </div>
      <ShiftAssignmentsClient
        branches={branches ?? []}
        employees={employees ?? []}
        defaultBranchId={claims.branch_id ?? undefined}
      />
    </div>
  );
}
