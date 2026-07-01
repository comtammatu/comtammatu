import { redirect } from "next/navigation";
import { loadAuthState } from "@/_lib/auth";
import { resolveEmployeeBranchRuntimePath } from "../_lib/branch-runtime-redirect";

export default async function EmployeeAttendancePage() {
  const { claims } = await loadAuthState();
  redirect(
    resolveEmployeeBranchRuntimePath(claims, "shiftSchedule") ??
      "/employee/schedule",
  );
}
