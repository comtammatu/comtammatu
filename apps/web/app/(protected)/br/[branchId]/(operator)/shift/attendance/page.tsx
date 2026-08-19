import { notFound, redirect } from "next/navigation";
import { parseOperatorBranchId } from "../../../_lib/parse-branch-id";

/** Class C: old bookmarks land on `/team/attendance`. */
export default async function OperatorShiftAttendanceShimPage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { branchId: rawBranchId } = await params;
  const branchId = parseOperatorBranchId(rawBranchId);
  if (branchId == null) notFound();
  redirect(`/br/${branchId}/team/attendance`);
}
