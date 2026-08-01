import { redirect } from "next/navigation";

export default async function BranchProductionDetailRedirect({
  params,
}: {
  params: Promise<{ branchId: string; id: string }>;
}) {
  const { branchId, id } = await params;
  redirect(
    `/inventory/production/${encodeURIComponent(id)}?branchId=${encodeURIComponent(branchId)}`,
  );
}
