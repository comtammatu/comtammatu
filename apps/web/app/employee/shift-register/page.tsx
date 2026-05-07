import { redirect } from "next/navigation";
import { AppPage, AppPageHeader, AppSection } from "@/components/surface";
import { getEmployeeContext } from "../_lib/employee-context";
import { ShiftRegisterClient } from "./shift-register-client";

export default async function EmployeeShiftRegisterPage() {
  const ctx = await getEmployeeContext();
  if (!ctx) {
    redirect("/employee");
  }

  const { supabase, claims, employeeId, branchId } = ctx;

  // Branches the employee can register at:
  // - Primary: their assigned branch (claims.branch_id)
  // - Fallback: all active branches in tenant (employees without a fixed
  //   branch can still register, but UI will pick the only one or show all).
  const { data: branchesData } = await supabase
    .from("branches")
    .select("id, name")
    .eq("tenant_id", claims.tenant_id)
    .eq("is_active", true)
    .order("name");

  const allBranches = (branchesData ?? []) as { id: number; name: string }[];
  const branches = branchId
    ? allBranches.filter((b) => b.id === branchId)
    : allBranches;

  const todayIso = new Date().toISOString().split("T")[0]!;
  const horizonIso = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 21);
    return d.toISOString().split("T")[0]!;
  })();

  // Read own existing requests in the [today, +21d] horizon.
  const { data: requestsData } = await supabase
    .from("shift_requests")
    .select(
      `
      id, status, date, note, created_at, rejected_reason,
      shift_id, branch_id,
      shifts ( id, name, start_time, end_time )
    `,
    )
    .eq("employee_id", employeeId)
    .eq("tenant_id", claims.tenant_id)
    .gte("date", todayIso)
    .lte("date", horizonIso)
    .order("date", { ascending: true });

  const initialRequests = (requestsData ?? []) as unknown as InitialRequest[];

  return (
    <AppPage width="narrow">
      <AppPageHeader
        eyebrow="Nhân sự"
        title="Đăng ký ca làm"
        description="Gửi nguyện vọng ca làm cho 21 ngày tới. Quản lý sẽ duyệt và phân ca."
      />
      <AppSection>
        <ShiftRegisterClient
          branches={branches}
          defaultBranchId={branchId ?? branches[0]?.id ?? null}
          initialRequests={initialRequests}
        />
      </AppSection>
    </AppPage>
  );
}

export interface InitialRequest {
  id: number;
  status: "pending" | "approved" | "rejected" | "cancelled";
  date: string;
  note: string | null;
  created_at: string;
  rejected_reason: string | null;
  shift_id: number;
  branch_id: number;
  shifts: {
    id: number;
    name: string;
    start_time: string;
    end_time: string;
  } | null;
}
