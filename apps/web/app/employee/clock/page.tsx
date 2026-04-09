import { redirect } from "next/navigation";
import { createClient } from "@comtammatu/database/supabase/server";
import { extractClaims } from "@comtammatu/shared/auth";
import { ClockClient } from "./clock-client";

export default async function ClockPage() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) redirect("/login");

  const claims = extractClaims(session.user.app_metadata);
  if (!claims) redirect("/login");

  // Find employee record
  const { data: employee } = await supabase
    .from("employees")
    .select("id")
    .eq("profile_id", session.user.id)
    .eq("tenant_id", claims.tenant_id)
    .maybeSingle();

  if (!employee) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <p className="text-sm text-muted-foreground">
          Tài khoản chưa được liên kết hồ sơ nhân viên. Liên hệ quản lý.
        </p>
      </div>
    );
  }

  // Get today's attendance status
  const today = new Date().toLocaleDateString("sv-SE", {
    timeZone: "Asia/Ho_Chi_Minh",
  });
  const { data: record } = await supabase
    .from("attendance_records")
    .select("check_in, check_out, branch_id, branches ( name )")
    .eq("employee_id", employee.id)
    .eq("tenant_id", claims.tenant_id)
    .eq("date", today)
    .maybeSingle();

  // Get active branches with GPS for branch selection
  // branches.latitude/longitude pending migration — cast until db:types
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: branches } = await (supabase as any)
    .from("branches")
    .select("id, name, latitude, longitude")
    .eq("tenant_id", claims.tenant_id)
    .eq("is_active", true)
    .order("name");

  const activeBranches = (
    (branches ?? []) as Array<{
      id: number;
      name: string;
      latitude: number | null;
      longitude: number | null;
    }>
  )
    .filter((b) => b.latitude != null && b.longitude != null)
    .map((b) => ({
      id: b.id,
      name: b.name,
      lat: Number(b.latitude),
      lng: Number(b.longitude),
    }));

  const branchData = record?.branches as { name: string } | null;

  return (
    <ClockClient
      initialStatus={{
        clockedIn: !!record?.check_in && !record?.check_out,
        clockedOut: !!record?.check_out,
        checkInTime: record?.check_in ?? null,
        checkOutTime: record?.check_out ?? null,
        branchName: branchData?.name ?? null,
      }}
      branches={activeBranches}
      defaultBranchId={claims.branch_id}
    />
  );
}
