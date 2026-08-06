import { redirect } from "next/navigation";

export default async function IssuesPage({
  searchParams,
}: {
  searchParams: Promise<{
    branchId?: string | string[];
    endDate?: string | string[];
    startDate?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const qParams = new URLSearchParams();
  qParams.set("view", "waste");
  for (const key of ["branchId", "startDate", "endDate"] as const) {
    const value = params[key];
    if (!value) continue;
    if (Array.isArray(value)) {
      for (const item of value) qParams.append(key, item);
    } else {
      qParams.set(key, value);
    }
  }
  redirect(`/inventory/consumption?${qParams.toString()}`);
}
