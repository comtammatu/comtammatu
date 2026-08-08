import { notFound } from "next/navigation";
import { parseOperatorBranchId } from "../../../_lib/parse-branch-id";
import { RosterTab } from "../../team/_tabs/roster-tab";

/**
 * Full-page branch roster. Kept under `/shift/roster` (not a Team peer tab)
 * so the week grid has a proper page chrome on small phones.
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
  if (branchId == null) notFound();
  const { week } = searchParams ? await searchParams : {};
  return <RosterTab branchId={branchId} week={week} />;
}
