import { redirect } from "next/navigation";

interface StaffPageProps {
  searchParams: Promise<{
    position?: string;
    branch?: string;
    status?: string;
    q?: string;
  }>;
}

export default async function StaffPage({ searchParams }: StaffPageProps) {
  const params = await searchParams;
  const next = new URLSearchParams();
  next.set("view", "accounts");
  if (params.position) next.set("position", params.position);
  if (params.branch) next.set("branch", params.branch);
  if (params.status) next.set("status", params.status);
  if (params.q) next.set("q", params.q);
  redirect(`/hr?${next.toString()}`);
}
