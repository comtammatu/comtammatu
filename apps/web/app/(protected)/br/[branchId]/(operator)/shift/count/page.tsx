import { notFound, redirect } from "next/navigation";
import { StaffCountPageContent } from "@lib/staff-runtime/count/page";
import { loadAuthState } from "@/_lib/auth";

export default async function OperatorShiftCountPage({
  params,
  searchParams,
}: {
  params: Promise<{ branchId: string }>;
  searchParams: Promise<{ location?: string }>;
}) {
  const { branchId: rawBranchId } = await params;
  const branchId = Number(rawBranchId);
  if (!Number.isInteger(branchId) || branchId <= 0) notFound();

  const { claims } = await loadAuthState();
  if (claims.user_role === "owner") redirect(`/br/${branchId}/team`);

  return (
    <StaffCountPageContent
      searchParams={searchParams}
      routeBranchId={branchId}
      baseHref={`/br/${branchId}/shift/count`}
      profileHref={`/br/${branchId}/profile`}
      plane="branch"
    />
  );
}
