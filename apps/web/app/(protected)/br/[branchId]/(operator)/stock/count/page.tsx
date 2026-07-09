import { notFound } from "next/navigation";
import { StaffCountPageContent } from "@lib/staff-runtime/count/page";

interface PageProps {
  params: Promise<{ branchId: string }>;
  searchParams: Promise<{ location?: string }>;
}

export default async function OperatorStockCountPage({
  params,
  searchParams,
}: PageProps) {
  const { branchId: rawBranchId } = await params;
  const branchId = Number(rawBranchId);
  if (!Number.isInteger(branchId) || branchId <= 0) notFound();

  return (
    <StaffCountPageContent
      searchParams={searchParams}
      routeBranchId={branchId}
      profileHref={`/br/${branchId}/profile`}
      hideHeaderOnMobile
      plane="branch"
    />
  );
}
