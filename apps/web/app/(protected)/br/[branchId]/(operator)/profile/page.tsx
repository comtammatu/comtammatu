import { notFound } from "next/navigation";
import { ProfilePageContent } from "@lib/staff-runtime/profile/page";

export default async function OperatorProfilePage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { branchId: rawBranchId } = await params;
  const branchId = Number(rawBranchId);
  if (!Number.isInteger(branchId) || branchId <= 0) notFound();

  return <ProfilePageContent />;
}
