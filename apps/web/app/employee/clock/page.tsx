import { loadAuthState } from "@/_lib/auth";
import { ClockClient } from "./clock-client";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@comtammatu/ui/components/empty";

export default async function ClockPage() {
  const { supabase, session, claims } = await loadAuthState();

  // Find employee record
  const { data: employee } = await supabase
    .from("employees")
    .select("id")
    .eq("profile_id", session.user.id)
    .eq("tenant_id", claims.tenant_id)
    .maybeSingle();

  if (!employee) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Chưa có hồ sơ nhân viên</EmptyTitle>
          <EmptyDescription>
            Tài khoản chưa được liên kết hồ sơ nhân viên. Liên hệ quản lý.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
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
  const { data: branches } = await supabase
    .from("branches")
    .select("id, name, latitude, longitude")
    .eq("tenant_id", claims.tenant_id)
    .eq("is_active", true)
    .order("name");

  const activeBranches = (branches ?? [])
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
