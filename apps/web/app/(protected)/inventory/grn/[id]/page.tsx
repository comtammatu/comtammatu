import { notFound, redirect } from "next/navigation";
import { isGrnLookupParam } from "@lib/inventory/grn-detail-model";

export default async function GRNDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isGrnLookupParam(id)) notFound();
  redirect(`/inventory/grn?grnId=${encodeURIComponent(id)}&mode=view`);
}
