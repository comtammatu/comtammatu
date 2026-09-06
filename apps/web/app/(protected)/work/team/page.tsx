import { redirect } from "next/navigation";

export default async function WorkTeamPage({
  searchParams,
}: {
  searchParams?: Promise<{ department?: string | string[] }>;
}) {
  const raw = searchParams ? await searchParams : undefined;
  const rawDepartment = Array.isArray(raw?.department)
    ? raw?.department[0]
    : raw?.department;
  if (rawDepartment && /^\d+$/.test(rawDepartment)) {
    redirect(`/work?department=${encodeURIComponent(rawDepartment)}`);
  }
  redirect("/work");
}
