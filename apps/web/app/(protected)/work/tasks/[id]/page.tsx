import { redirect } from "next/navigation";

export default async function WorkTaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/work?task=${encodeURIComponent(id)}`);
}
