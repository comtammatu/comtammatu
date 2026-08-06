import { redirect } from "next/navigation";
import { parseOperatorBranchId } from "../../../_lib/parse-branch-id";

/**
 * Redirect shim — checkout approvals live under the Team hub
 * (`/br/{branchId}/team?tab=checkouts`) as of the Branch Manager IA redesign.
 * `?attendanceId=` is forwarded to focus the same record.
 */
export default async function OperatorCheckoutApprovalsPage({
  params,
  searchParams,
}: {
  params: Promise<{ branchId: string }>;
  searchParams: Promise<{ attendanceId?: string | string[] }>;
}) {
  const { branchId: rawBranchId } = await params;
  const { attendanceId: rawAttendanceId } = await searchParams;
  const branchId = parseOperatorBranchId(rawBranchId);
  if (branchId == null) redirect("/br");
  const attendanceId = Array.isArray(rawAttendanceId)
    ? rawAttendanceId[0]
    : rawAttendanceId;
  const query = attendanceId
    ? `?tab=checkouts&attendanceId=${encodeURIComponent(attendanceId)}`
    : "?tab=checkouts";
  redirect(`/br/${branchId}/team${query}`);
}
