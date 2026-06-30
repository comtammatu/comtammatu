import { notFound } from "next/navigation";
import { EmployeeCountPageContent } from "@/(protected)/employee/count/page";

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
    <EmployeeCountPageContent
      searchParams={searchParams}
      routeBranchId={branchId}
    />
  );
}
