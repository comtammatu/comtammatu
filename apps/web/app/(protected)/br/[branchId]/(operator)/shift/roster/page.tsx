import { notFound, redirect } from "next/navigation";
import { parseOperatorBranchId } from "../../../_lib/parse-branch-id";

/** Class C: old bookmarks and notification URLs land on `/team/roster`. */
export default async function OperatorShiftRosterShimPage({
  params,
  searchParams,
}: {
  params: Promise<{ branchId: string }>;
  searchParams?: Promise<{ week?: string }>;
}) {
  const { branchId: rawBranchId } = await params;
  const branchId = parseOperatorBranchId(rawBranchId);
  if (branchId == null) notFound();
  const { week } = searchParams ? await searchParams : {};
  const query = week ? `?week=${encodeURIComponent(week)}` : "";
  redirect(`/br/${branchId}/team/roster${query}`);
}
