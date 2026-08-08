import { notFound } from "next/navigation";
import { parseOperatorBranchId } from "../../../_lib/parse-branch-id";
import { AttendanceTab } from "../../team/_tabs/attendance-tab";

/**
 * Full-page branch attendance for branch managers.
 */
export default async function BranchAttendancePage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { branchId: rawBranchId } = await params;
  const branchId = parseOperatorBranchId(rawBranchId);
  if (branchId == null) notFound();
  return <AttendanceTab branchId={branchId} />;
}
