import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@comtammatu/database/types";
import {
  getWorkTask,
  type WorkChecklistItemRow,
  type WorkTaskAttachmentRow,
  type WorkTaskCommentRow,
} from "../actions";
import type { WorkTaskDetailPayload } from "../_components/work-task-detail-dialog-host";

export async function loadWorkTaskDetail(
  supabase: SupabaseClient<Database>,
  taskId: number,
): Promise<
  | { success: true; data: WorkTaskDetailPayload }
  | { success: false; error: string }
> {
  const taskResult = await getWorkTask({ taskId });
  if (!taskResult.success || !taskResult.data) {
    return {
      success: false,
      error: taskResult.error ?? "task_not_found",
    };
  }

  const task = taskResult.data;
  const [
    { data: memberRows },
    { data: commentRows },
    { data: checklistRows },
    { data: attachmentRows },
    { data: participantRows },
  ] = await Promise.all([
    supabase
      .from("work_department_members")
      .select("user_id, profiles!inner(full_name)")
      .eq("tenant_id", task.tenantId)
      .eq("department_id", task.departmentId)
      .eq("is_active", true),
    supabase
      .from("work_task_comments")
      .select("id, task_id, author_id, body, created_at")
      .eq("tenant_id", task.tenantId)
      .eq("task_id", taskId)
      .order("created_at", { ascending: true }),
    supabase
      .from("work_task_checklist_items")
      .select("id, task_id, title, is_done, sort_order")
      .eq("tenant_id", task.tenantId)
      .eq("task_id", taskId)
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true }),
    supabase
      .from("work_task_attachments")
      .select(
        "id, task_id, tenant_id, storage_path, file_name, content_type, byte_size, uploaded_by, created_at",
      )
      .eq("tenant_id", task.tenantId)
      .eq("task_id", taskId)
      .order("created_at", { ascending: true }),
    supabase
      .from("work_task_participants")
      .select("user_id, kind")
      .eq("tenant_id", task.tenantId)
      .eq("task_id", taskId),
  ]);

  const assigneeOptions = (memberRows ?? []).flatMap((row) => {
    const profile = row.profiles as unknown as { full_name: string } | null;
    if (!profile) return [];
    return [{ id: row.user_id, fullName: profile.full_name }];
  });

  const participants = participantRows ?? [];
  const assigneeIdsFromParticipants = participants
    .filter((p) => p.kind === "assignee")
    .map((p) => p.user_id);
  const initialAssigneeIds =
    assigneeIdsFromParticipants.length > 0
      ? assigneeIdsFromParticipants
      : task.assigneeId
        ? [task.assigneeId]
        : [];
  const initialSupporterIds = participants
    .filter((p) => p.kind === "collaborator")
    .map((p) => p.user_id);

  const comments: WorkTaskCommentRow[] = (commentRows ?? []).map((row) => ({
    id: row.id,
    taskId: row.task_id,
    authorId: row.author_id,
    body: row.body,
    createdAt: row.created_at,
  }));

  const checklist: WorkChecklistItemRow[] = (checklistRows ?? []).map((row) => ({
    id: row.id,
    taskId: row.task_id,
    title: row.title,
    isDone: row.is_done,
    sortOrder: row.sort_order,
  }));

  const attachments: WorkTaskAttachmentRow[] = (attachmentRows ?? []).map(
    (row) => ({
      id: row.id,
      taskId: row.task_id,
      tenantId: row.tenant_id,
      storagePath: row.storage_path,
      fileName: row.file_name,
      contentType: row.content_type,
      byteSize: row.byte_size,
      uploadedBy: row.uploaded_by,
      createdAt: row.created_at,
    }),
  );

  return {
    success: true,
    data: {
      task,
      assigneeOptions,
      initialAssigneeIds,
      initialSupporterIds,
      comments,
      checklist,
      attachments,
    },
  };
}
