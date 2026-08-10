import { redirect } from "next/navigation";

export default async function BranchProductionRedirect({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { branchId } = await params;
  redirect(`/inventory/production?branch=${encodeURIComponent(branchId)}`);
}
