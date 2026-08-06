import { redirect } from "next/navigation";
import { parseOperatorBranchId } from "../../../_lib/parse-branch-id";

/**
 * Redirect shim — roster lives under the Team hub
 * (`/br/{branchId}/team?tab=roster`) as of the Branch Manager IA redesign.
 * `?week=` is forwarded for deep links.
 */
export default async function OperatorShiftRosterPage({
  params,
  searchParams,
}: {
  params: Promise<{ branchId: string }>;
  searchParams?: Promise<{ week?: string }>;
}) {
  const { branchId: rawBranchId } = await params;
  const branchId = parseOperatorBranchId(rawBranchId);
  if (branchId == null) redirect("/br");
  const { week } = searchParams ? await searchParams : {};
  const query = week ? `?tab=roster&week=${encodeURIComponent(week)}` : "?tab=roster";
  redirect(`/br/${branchId}/team${query}`);
}
