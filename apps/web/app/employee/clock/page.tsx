import { getEmployeeContext } from "../_lib/employee-context";
import { ClockClient } from "./clock-client";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@comtammatu/ui/components/empty";
import { getTodayVN } from "../_lib/vn-business-date";

export default async function ClockPage() {
  const ctx = await getEmployeeContext();

  if (!ctx) {
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

  const { supabase, claims, employeeId } = ctx;

  // Get today's attendance status
  const today = getTodayVN();
  const { data: record } = await supabase
    .from("attendance_records")
    .select("check_in, check_out, branch_id, branches ( name )")
    .eq("employee_id", employeeId)
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

  const branchData = record?.branches as unknown as { name: string } | null | undefined;

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
