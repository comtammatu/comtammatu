import { notFound } from "next/navigation";
import { loadAuthState } from "@/_lib/auth";
import { AppEmptyState, AppPage, AppPageHeader } from "@/components/surface";
import { workCopy } from "@lib/messages/work";
import { getWorkTask } from "../../actions";
import { WorkTaskDetail } from "../../_components/work-task-detail";

export default async function WorkTaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  if (!/^\d+$/.test(rawId)) notFound();
  const taskId = Number(rawId);

  const { supabase } = await loadAuthState();
  const { data: canAccess, error: accessError } = await supabase.rpc(
    "can_access_workspace",
  );
  if (accessError || canAccess !== true) {
    return (
      <AppPage width="wide">
        <AppPageHeader title={workCopy.detailTitle} />
        <AppEmptyState mode="no-data" description={workCopy.noAccess} />
      </AppPage>
    );
  }

  const taskResult = await getWorkTask({ taskId });
  if (!taskResult.success || !taskResult.data) {
    notFound();
  }

  const [{ data: memberRows }, { data: commentRows }, { data: checklistRows }] =
    await Promise.all([
      supabase
        .from("work_department_members")
        .select("user_id, profiles!inner(full_name)")
        .eq("tenant_id", taskResult.data.tenantId)
        .eq("department_id", taskResult.data.departmentId)
        .eq("is_active", true),
      supabase
        .from("work_task_comments")
        .select("id, task_id, author_id, body, created_at")
        .eq("tenant_id", taskResult.data.tenantId)
        .eq("task_id", taskId)
        .order("created_at", { ascending: true }),
      supabase
        .from("work_task_checklist_items")
        .select("id, task_id, title, is_done, sort_order")
        .eq("tenant_id", taskResult.data.tenantId)
        .eq("task_id", taskId)
        .order("sort_order", { ascending: true })
        .order("id", { ascending: true }),
    ]);

  const assigneeOptions = (memberRows ?? []).flatMap((row) => {
    const profile = row.profiles as unknown as { full_name: string } | null;
    if (!profile) return [];
    return [{ id: row.user_id, fullName: profile.full_name }];
  });

  return (
    <WorkTaskDetail
      task={taskResult.data}
      assigneeOptions={assigneeOptions}
      initialComments={(commentRows ?? []).map((row) => ({
        id: row.id,
        taskId: row.task_id,
        authorId: row.author_id,
        body: row.body,
        createdAt: row.created_at,
      }))}
      initialChecklist={(checklistRows ?? []).map((row) => ({
        id: row.id,
        taskId: row.task_id,
        title: row.title,
        isDone: row.is_done,
        sortOrder: row.sort_order,
      }))}
    />
  );
}
