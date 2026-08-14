import { notFound, redirect } from "next/navigation";

/**
 * Legacy Branch Command surface — absorbed into Hôm nay.
 * Keep the route as a deep-link shim so bookmarks and Owner launchers settle.
 */
export default async function BranchCommandPage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { branchId: branchIdStr } = await params;
  const branchId = Number(branchIdStr);
  if (!Number.isInteger(branchId) || branchId <= 0) {
    notFound();
  }
  redirect(`/br/${branchId}`);
}
