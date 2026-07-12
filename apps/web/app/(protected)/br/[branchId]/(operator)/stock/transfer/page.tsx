import { notFound, permanentRedirect } from "next/navigation";
import { parseOperatorBranchId } from "../../../_lib/parse-branch-id";

interface PageProps {
  params: Promise<{ branchId: string }>;
}

export default async function OperatorStockTransferPage({ params }: PageProps) {
  const { branchId: rawBranchId } = await params;
  const branchId = parseOperatorBranchId(rawBranchId);
  if (branchId == null) notFound();

  permanentRedirect(`/br/${branchId}/stock/receive`);
}
