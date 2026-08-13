import { notFound, redirect } from "next/navigation";

export default async function ProductionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ branch?: string | string[] }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const runId = Number.parseInt(id, 10);
  if (Number.isNaN(runId) || runId <= 0) notFound();

  const qs = new URLSearchParams();
  qs.set("runId", String(runId));
  qs.set("mode", "view");
  const branch = Array.isArray(query.branch) ? query.branch[0] : query.branch;
  if (branch) qs.set("branch", branch);
  redirect(`/inventory/production?${qs.toString()}`);
}
