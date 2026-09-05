"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@comtammatu/shared/types";
import { getVNDateString, getVNDayUtcRange } from "@comtammatu/shared/time";
import type { Database } from "@comtammatu/database/types";
import { createServiceClient } from "@comtammatu/database/supabase/service";
import { loadAuthState } from "@/_lib/auth";
import { withAction, type ActionContext } from "@/_lib/with-action";
import { staffDisplayLabel } from "@/_lib/profile-display-names";
import {
  includesAny,
  mapRpcError,
  type RpcErrorMapping,
} from "@/_lib/rpc-error-map";
import {
  WORK_TASK_PRIORITIES,
  WORK_TASK_STATUSES,
  workCopy,
} from "@lib/messages/work";
import { WORK_ROUTE_ROLES } from "./_lib/work-roles";

type WorkTaskDbRow = Database["public"]["Tables"]["work_tasks"]["Row"];

export type WorkTaskStatus = (typeof WORK_TASK_STATUSES)[number];
export type WorkTaskPriority = (typeof WORK_TASK_PRIORITIES)[number];

export type WorkTaskRow = {
  id: number;
  tenantId: number;
  departmentId: number;
  projectId: number | null;
  title: string;
  description: string | null;
  status: WorkTaskStatus;
  priority: WorkTaskPriority;
  assigneeId: string | null;
  dueAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  revision: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  checklistTotal?: number;
  checklistDone?: number;
  participantIds?: string[];
  assigneeIds?: string[];
  supporterIds?: string[];
};

export type WorkTaskEventRow = {
  id: number;
  taskId: number;
  actorId: string;
  actorName: string | null;
  eventKind: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type WorkDepartmentOption = {
  id: number;
  name: string;
};

export type WorkProjectOption = {
  id: number;
  name: string;
  departmentId: number;
};

const STATUS_ORDER: Record<WorkTaskStatus, number> = {
  backlog: 0,
  todo: 1,
  in_progress: 2,
  review: 3,
  done: 4,
  canceled: 5,
};

const workRpcMappings: readonly RpcErrorMapping[] = [
  {
    match: includesAny("task_revision_conflict"),
    errorCode: "work.revision_conflict",
    userMessage: workCopy.revisionConflict,
  },
  {
    match: includesAny("forbidden", "42501"),
    errorCode: "work.forbidden",
    userMessage: workCopy.forbidden,
  },
  {
    match: includesAny("task_not_found"),
    errorCode: "work.not_found",
    userMessage: workCopy.taskNotFound,
  },
];

const workRpcFallback = {
  userMessage: workCopy.loadFailed,
  errorCode: "work.load_failed",
} as const;

function isWorkTaskStatus(value: string): value is WorkTaskStatus {
  return (WORK_TASK_STATUSES as readonly string[]).includes(value);
}

function isWorkTaskPriority(value: string): value is WorkTaskPriority {
  return (WORK_TASK_PRIORITIES as readonly string[]).includes(value);
}

function mapWorkTaskRow(row: WorkTaskDbRow): WorkTaskRow {
  const status = isWorkTaskStatus(row.status) ? row.status : "todo";
  const priority = isWorkTaskPriority(row.priority) ? row.priority : "normal";
  return {
    id: row.id,
    tenantId: row.tenant_id,
    departmentId: row.department_id,
    projectId: row.project_id,
    title: row.title,
    description: row.description,
    status,
    priority,
    assigneeId: row.assignee_id,
    dueAt: row.due_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    revision: row.revision,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    checklistTotal: 0,
    checklistDone: 0,
    participantIds: row.assignee_id ? [row.assignee_id] : [],
    assigneeIds: row.assignee_id ? [row.assignee_id] : [],
    supporterIds: [],
  };
}

async function enrichWorkTasks(
  tasks: WorkTaskRow[],
  ctx: ActionContext,
): Promise<WorkTaskRow[]> {
  if (tasks.length === 0) return tasks;
  const taskIds = tasks.map((t) => t.id);

  const [checklistRes, participantsRes] = await Promise.all([
    ctx.supabase
      .from("work_task_checklist_items")
      .select("task_id, is_done")
      .eq("tenant_id", ctx.claims.tenant_id)
      .in("task_id", taskIds),
    ctx.supabase
      .from("work_task_participants")
      .select("task_id, user_id, kind")
      .eq("tenant_id", ctx.claims.tenant_id)
      .in("task_id", taskIds),
  ]);

  const checklistMap = new Map<number, { total: number; done: number }>();
  if (checklistRes.data) {
    for (const item of checklistRes.data) {
      const entry = checklistMap.get(item.task_id) ?? { total: 0, done: 0 };
      entry.total += 1;
      if (item.is_done) entry.done += 1;
      checklistMap.set(item.task_id, entry);
    }
  }

  const participantsMap = new Map<
    number,
    { participantIds: Set<string>; assigneeIds: string[]; supporterIds: string[] }
  >();
  if (participantsRes.data) {
    for (const p of participantsRes.data) {
      let entry = participantsMap.get(p.task_id);
      if (!entry) {
        entry = { participantIds: new Set(), assigneeIds: [], supporterIds: [] };
        participantsMap.set(p.task_id, entry);
      }
      entry.participantIds.add(p.user_id);
      if (p.kind === "assignee") {
        entry.assigneeIds.push(p.user_id);
      } else if (p.kind === "collaborator") {
        entry.supporterIds.push(p.user_id);
      }
    }
  }

  return tasks.map((task) => {
    const chk = checklistMap.get(task.id) ?? { total: 0, done: 0 };
    const p = participantsMap.get(task.id);
    const participantIds = new Set(p?.participantIds ?? []);
    if (task.assigneeId) {
      participantIds.add(task.assigneeId);
    }
    const assigneeIds =
      p?.assigneeIds && p.assigneeIds.length > 0
        ? p.assigneeIds
        : task.assigneeId
          ? [task.assigneeId]
          : [];
    const supporterIds = p?.supporterIds ?? [];

    return {
      ...task,
      checklistTotal: chk.total,
      checklistDone: chk.done,
      participantIds: Array.from(participantIds),
      assigneeIds,
      supporterIds,
    };
  });
}

function sortWorkTasks(tasks: WorkTaskRow[]): WorkTaskRow[] {
  return [...tasks].sort((left, right) => {
    const statusDiff = STATUS_ORDER[left.status] - STATUS_ORDER[right.status];
    if (statusDiff !== 0) return statusDiff;
    if (left.dueAt == null && right.dueAt == null) return 0;
    if (left.dueAt == null) return 1;
    if (right.dueAt == null) return -1;
    return left.dueAt.localeCompare(right.dueAt);
  });
}

function revalidateWorkPaths(taskId?: number) {
  revalidatePath("/work");
  if (taskId != null) revalidatePath("/work");
}

export async function canAccessWorkspace(
  ctx: Pick<ActionContext, "supabase">,
): Promise<boolean> {
  const { data, error } = await ctx.supabase.rpc("can_access_workspace");
  if (error) return false;
  return data === true;
}

const includeDoneSchema = z.object({
  includeDone: z.boolean().optional().default(false),
});

export const listMyWorkTasks = withAction<typeof includeDoneSchema, { items: WorkTaskRow[] }>(
  {
    schema: includeDoneSchema,
    roles: WORK_ROUTE_ROLES,
  },
  async (data, ctx) => {
    const { data: rows, error } = await ctx.supabase.rpc("list_my_work_tasks", {
      p_include_done: data.includeDone ?? false,
    });
    if (error) {
      return mapRpcError(error, workRpcMappings, workRpcFallback);
    }
    const mapped = (rows ?? []).map(mapWorkTaskRow);
    const enriched = await enrichWorkTasks(mapped, ctx);
    return {
      success: true,
      data: { items: enriched },
    };
  },
);

const taskIdSchema = z.object({
  taskId: z.number().int().positive(),
});

export const getWorkTask = withAction<typeof taskIdSchema, WorkTaskRow>(
  {
    schema: taskIdSchema,
    roles: WORK_ROUTE_ROLES,
  },
  async (data, ctx) => {
    const { data: row, error } = await ctx.supabase.rpc("get_work_task", {
      p_task_id: data.taskId,
    });
    if (error) {
      return mapRpcError(error, workRpcMappings, workRpcFallback);
    }
    if (!row) {
      return { success: false, error: workCopy.taskNotFound };
    }
    const mapped = mapWorkTaskRow(row);
    const [enriched] = await enrichWorkTasks([mapped], ctx);
    return { success: true, data: enriched ?? mapped };
  },
);

const createWorkTaskSchema = z.object({
  departmentId: z.number().int().positive(),
  projectId: z.number().int().positive().optional(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(4000).optional(),
  priority: z.enum(WORK_TASK_PRIORITIES).optional(),
  assigneeId: z.string().uuid().optional(),
  assigneeIds: z.array(z.string().uuid()).optional(),
  supporterIds: z.array(z.string().uuid()).optional(),
  dueAt: z.string().datetime().optional(),
});

export const createWorkTask = withAction<typeof createWorkTaskSchema, WorkTaskRow>(
  {
    schema: createWorkTaskSchema,
    roles: WORK_ROUTE_ROLES,
  },
  async (data, ctx) => {
    const resolvedAssignees =
      data.assigneeIds ?? (data.assigneeId ? [data.assigneeId] : []);
    const primaryAssignee = resolvedAssignees[0] ?? null;

    const { data: row, error } = await ctx.supabase.rpc("create_work_task", {
      p_department_id: data.departmentId,
      p_project_id: data.projectId ?? null,
      p_title: data.title,
      p_description: data.description ?? null,
      p_priority: data.priority ?? null,
      p_assignee_id: primaryAssignee,
      p_due_at: data.dueAt ?? null,
      // Typegen marks nullable SQL args as required non-null; runtime accepts NULL.
    } as Database["public"]["Functions"]["create_work_task"]["Args"]);
    if (error) {
      return mapRpcError(error, workRpcMappings, {
        userMessage: workCopy.createFailed,
        errorCode: "work.create_failed",
      });
    }
    if (!row) {
      return { success: false, error: workCopy.createFailed };
    }

    if (
      resolvedAssignees.length > 0 ||
      (data.supporterIds && data.supporterIds.length > 0)
    ) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (ctx.supabase.rpc as any)("set_work_task_participants", {
        p_task_id: row.id,
        p_assignee_ids: resolvedAssignees,
        p_supporter_ids: data.supporterIds ?? [],
      });
    }

    revalidateWorkPaths(row.id);
    return { success: true, data: mapWorkTaskRow(row) };
  },
);

const updateWorkTaskSchema = z.object({
  taskId: z.number().int().positive(),
  expectedRevision: z.number().int().positive(),
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(4000).optional(),
  priority: z.enum(WORK_TASK_PRIORITIES).optional(),
  assigneeId: z.string().uuid().optional(),
  assigneeIds: z.array(z.string().uuid()).optional(),
  supporterIds: z.array(z.string().uuid()).optional(),
  dueAt: z.string().datetime().optional(),
  clearAssignee: z.boolean().optional(),
  clearDueAt: z.boolean().optional(),
});

export const updateWorkTask = withAction<typeof updateWorkTaskSchema, WorkTaskRow>(
  {
    schema: updateWorkTaskSchema,
    roles: WORK_ROUTE_ROLES,
  },
  async (data, ctx) => {
    const hasAssigneeIds = data.assigneeIds !== undefined;
    const hasSupporterIds = data.supporterIds !== undefined;
    const resolvedAssignees =
      data.assigneeIds ?? (data.assigneeId ? [data.assigneeId] : []);
    const primaryAssignee = hasAssigneeIds
      ? (resolvedAssignees[0] ?? null)
      : (data.assigneeId ?? null);
    const clearAssignee =
      data.clearAssignee ?? (hasAssigneeIds && resolvedAssignees.length === 0);

    const { data: row, error } = await ctx.supabase.rpc("update_work_task", {
      p_task_id: data.taskId,
      p_expected_revision: data.expectedRevision,
      p_title: data.title,
      p_description: data.description,
      p_priority: data.priority,
      p_assignee_id: primaryAssignee ?? undefined,
      p_due_at: data.dueAt,
      p_clear_assignee_id: clearAssignee,
      p_clear_due_at: data.clearDueAt ?? false,
    });
    if (error) {
      return mapRpcError(error, workRpcMappings, {
        userMessage: workCopy.saveFailed,
        errorCode: "work.save_failed",
      });
    }
    if (!row) {
      return { success: false, error: workCopy.saveFailed };
    }

    if (hasAssigneeIds || hasSupporterIds) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (ctx.supabase.rpc as any)("set_work_task_participants", {
        p_task_id: data.taskId,
        p_assignee_ids: resolvedAssignees,
        p_supporter_ids: data.supporterIds ?? [],
      });
    }

    revalidateWorkPaths(row.id);
    return { success: true, data: mapWorkTaskRow(row) };
  },
);

const setWorkTaskParticipantsSchema = z.object({
  taskId: z.number().int().positive(),
  assigneeIds: z.array(z.string().uuid()),
  supporterIds: z.array(z.string().uuid()),
});

export const setWorkTaskParticipants = withAction(
  {
    schema: setWorkTaskParticipantsSchema,
    roles: WORK_ROUTE_ROLES,
  },
  async (data, ctx) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (ctx.supabase.rpc as any)(
      "set_work_task_participants",
      {
        p_task_id: data.taskId,
        p_assignee_ids: data.assigneeIds,
        p_supporter_ids: data.supporterIds,
      },
    );
    if (error) {
      return mapRpcError(error, workRpcMappings, {
        userMessage: workCopy.saveFailed,
        errorCode: "work.set_participants_failed",
      });
    }
    revalidateWorkPaths(data.taskId);
    return { success: true, data: { success: true } };
  },
);

const setWorkTaskStatusSchema = z.object({
  taskId: z.number().int().positive(),
  expectedRevision: z.number().int().positive(),
  status: z.enum(WORK_TASK_STATUSES),
});

export const setWorkTaskStatus = withAction<typeof setWorkTaskStatusSchema, WorkTaskRow>(
  {
    schema: setWorkTaskStatusSchema,
    roles: WORK_ROUTE_ROLES,
  },
  async (data, ctx) => {
    const { data: row, error } = await ctx.supabase.rpc("set_work_task_status", {
      p_task_id: data.taskId,
      p_expected_revision: data.expectedRevision,
      p_status: data.status,
    });
    if (error) {
      return mapRpcError(error, workRpcMappings, {
        userMessage: workCopy.saveFailed,
        errorCode: "work.status_failed",
      });
    }
    if (!row) {
      return { success: false, error: workCopy.saveFailed };
    }
    revalidateWorkPaths(row.id);
    return { success: true, data: mapWorkTaskRow(row) };
  },
);

const setWorkTaskDepartmentSchema = z.object({
  taskId: z.number().int().positive(),
  expectedRevision: z.number().int().positive(),
  departmentId: z.number().int().positive(),
});

export const setWorkTaskDepartment = withAction<
  typeof setWorkTaskDepartmentSchema,
  WorkTaskRow
>(
  {
    schema: setWorkTaskDepartmentSchema,
    roles: WORK_ROUTE_ROLES,
  },
  async (data, ctx) => {
    const { data: canWrite, error: canWriteError } = await ctx.supabase.rpc(
      "can_write_work_task",
      { p_task_id: data.taskId },
    );
    if (canWriteError || !canWrite) {
      return { success: false, error: workCopy.forbidden };
    }

    const service = createServiceClient();
    const { data: dept, error: deptError } = await service
      .from("work_departments")
      .select("id")
      .eq("id", data.departmentId)
      .eq("tenant_id", ctx.claims.tenant_id)
      .eq("is_active", true)
      .maybeSingle();

    if (deptError || !dept) {
      return { success: false, error: workCopy.saveFailed };
    }

    const { data: updated, error: updateError } = await service
      .from("work_tasks")
      .update({
        department_id: data.departmentId,
        revision: data.expectedRevision + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.taskId)
      .eq("tenant_id", ctx.claims.tenant_id)
      .eq("revision", data.expectedRevision)
      .select(
        "id, tenant_id, department_id, project_id, title, description, status, priority, assignee_id, due_at, started_at, completed_at, revision, created_by, created_at, updated_at",
      )
      .maybeSingle();

    if (updateError || !updated) {
      const { data: current } = await service
        .from("work_tasks")
        .select("revision")
        .eq("id", data.taskId)
        .eq("tenant_id", ctx.claims.tenant_id)
        .maybeSingle();

      if (current && current.revision !== data.expectedRevision) {
        return { success: false, error: workCopy.revisionConflict };
      }
      return { success: false, error: workCopy.saveFailed };
    }

    await service.from("work_task_events").insert({
      tenant_id: ctx.claims.tenant_id,
      task_id: data.taskId,
      actor_id: ctx.userId,
      event_kind: "task.department_changed",
      payload: { department_id: data.departmentId },
    });

    revalidateWorkPaths(data.taskId);
    return { success: true, data: mapWorkTaskRow(updated) };
  },
);

const emptyWorkActionSchema = z.object({});

export const countMyWorkTasksDue = withAction<
  typeof emptyWorkActionSchema,
  { count: number }
>(
  {
    schema: emptyWorkActionSchema,
    roles: WORK_ROUTE_ROLES,
  },
  async (_data, ctx) => {
    const today = getVNDateString();
    const { endIso } = getVNDayUtcRange(today);
    const endMs = new Date(endIso).getTime() - 1;
    const pBefore = new Date(endMs).toISOString();

    const { data: count, error } = await ctx.supabase.rpc(
      "count_my_work_tasks_due",
      { p_before: pBefore },
    );
    if (error) {
      return mapRpcError(error, workRpcMappings, workRpcFallback);
    }
    return {
      success: true,
      data: { count: Number(count ?? 0) },
    };
  },
);

export const ensurePilotDepartment = withAction<
  typeof emptyWorkActionSchema,
  { departmentId: number }
>(
  {
    schema: emptyWorkActionSchema,
    roles: WORK_ROUTE_ROLES,
  },
  async (_data, ctx) => {
    const { data: departmentId, error } = await ctx.supabase.rpc(
      "ensure_pilot_work_department",
    );
    if (error) {
      return mapRpcError(error, workRpcMappings, {
        userMessage: workCopy.loadFailed,
        errorCode: "work.pilot_failed",
      });
    }
    return {
      success: true,
      data: { departmentId: Number(departmentId ?? 0) },
    };
  },
);

const scopedWorkTasksSchema = z.object({
  departmentId: z.number().int().positive().optional(),
  projectId: z.number().int().positive().optional(),
});

export const listScopedWorkTasks = withAction<typeof scopedWorkTasksSchema, { items: WorkTaskRow[] }>(
  {
    schema: scopedWorkTasksSchema,
    roles: WORK_ROUTE_ROLES,
  },
  async (data, ctx) => {
    let query = ctx.supabase
      .from("work_tasks")
      .select(
        "id, tenant_id, department_id, project_id, title, description, status, priority, assignee_id, due_at, started_at, completed_at, revision, created_by, created_at, updated_at",
      )
      .eq("tenant_id", ctx.claims.tenant_id);

    if (data.departmentId != null) {
      query = query.eq("department_id", data.departmentId);
    } else if (data.projectId != null) {
      query = query.eq("project_id", data.projectId);
    }

    const { data: rows, error } = await query;
    if (error) {
      return { success: false, error: workCopy.loadFailed };
    }

    const mapped = (rows ?? []).map(mapWorkTaskRow);
    const enriched = await enrichWorkTasks(mapped, ctx);

    return {
      success: true,
      data: { items: sortWorkTasks(enriched) },
    };
  },
);

const listWorkDepartmentsSchema = z.object({});

export const listWorkDepartments = withAction<
  typeof listWorkDepartmentsSchema,
  { items: WorkDepartmentOption[] }
>(
  {
    schema: listWorkDepartmentsSchema,
    roles: WORK_ROUTE_ROLES,
  },
  async (_data, ctx) => {
    const { data: rows, error } = await ctx.supabase
      .from("work_departments")
      .select("id, name")
      .eq("tenant_id", ctx.claims.tenant_id)
      .eq("is_active", true)
      .order("name");
    if (error) {
      return { success: false, error: workCopy.loadFailed };
    }
    const items: WorkDepartmentOption[] = (rows ?? []).map((row) => ({
      id: row.id,
      name: row.name,
    }));
    return { success: true, data: { items } };
  },
);

const listWorkProjectsSchema = z.object({
  departmentId: z.number().int().positive().optional(),
});

export const listWorkProjects = withAction<typeof listWorkProjectsSchema, { items: WorkProjectOption[] }>(
  {
    schema: listWorkProjectsSchema,
    roles: WORK_ROUTE_ROLES,
  },
  async (data, ctx) => {
    let query = ctx.supabase
      .from("work_projects")
      .select("id, name, department_id")
      .eq("tenant_id", ctx.claims.tenant_id)
      .order("name");
    if (data.departmentId != null) {
      query = query.eq("department_id", data.departmentId);
    }
    const { data: rows, error } = await query;
    if (error) {
      return { success: false, error: workCopy.loadFailed };
    }
    const items: WorkProjectOption[] = (rows ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      departmentId: row.department_id,
    }));
    return { success: true, data: { items } };
  },
);

export type WorkTaskCommentRow = {
  id: number;
  taskId: number;
  authorId: string;
  body: string;
  createdAt: string;
};

export type WorkChecklistItemRow = {
  id: number;
  taskId: number;
  title: string;
  isDone: boolean;
  sortOrder: number;
};

const addWorkTaskCommentSchema = z.object({
  taskId: z.number().int().positive(),
  body: z.string().trim().min(1).max(4000),
});

export const addWorkTaskComment = withAction<typeof addWorkTaskCommentSchema, WorkTaskCommentRow>(
  {
    schema: addWorkTaskCommentSchema,
    roles: WORK_ROUTE_ROLES,
  },
  async (data, ctx) => {
    const { data: row, error } = await ctx.supabase.rpc("add_work_task_comment", {
      p_task_id: data.taskId,
      p_body: data.body,
    });
    if (error) {
      return mapRpcError(error, workRpcMappings, {
        userMessage: workCopy.commentFailed,
        errorCode: "work.comment_failed",
      });
    }
    if (!row) {
      return { success: false, error: workCopy.commentFailed };
    }
    revalidateWorkPaths(data.taskId);
    return {
      success: true,
      data: {
        id: row.id,
        taskId: row.task_id,
        authorId: row.author_id,
        body: row.body,
        createdAt: row.created_at,
      } satisfies WorkTaskCommentRow,
    };
  },
);

const upsertWorkChecklistItemSchema = z.object({
  taskId: z.number().int().positive(),
  itemId: z.number().int().positive().optional(),
  title: z.string().trim().min(1).max(200),
  isDone: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export const upsertWorkChecklistItem = withAction<typeof upsertWorkChecklistItemSchema, WorkChecklistItemRow>(
  {
    schema: upsertWorkChecklistItemSchema,
    roles: WORK_ROUTE_ROLES,
  },
  async (data, ctx) => {
    const { data: row, error } = await ctx.supabase.rpc(
      "upsert_work_task_checklist_item",
      {
        p_task_id: data.taskId,
        p_item_id: data.itemId ?? null,
        p_title: data.title,
        p_is_done: data.isDone ?? false,
        p_sort_order: data.sortOrder ?? 0,
        // Typegen marks nullable insert-path args as required; runtime accepts NULL item id.
      } as Database["public"]["Functions"]["upsert_work_task_checklist_item"]["Args"],
    );
    if (error) {
      return mapRpcError(error, workRpcMappings, {
        userMessage: workCopy.checklistFailed,
        errorCode: "work.checklist_failed",
      });
    }
    if (!row) {
      return { success: false, error: workCopy.checklistFailed };
    }
    revalidateWorkPaths(data.taskId);
    return {
      success: true,
      data: {
        id: row.id,
        taskId: row.task_id,
        title: row.title,
        isDone: row.is_done,
        sortOrder: row.sort_order,
      } satisfies WorkChecklistItemRow,
    };
  },
);

export type WorkTaskAttachmentRow = {
  id: number;
  taskId: number;
  tenantId: number;
  storagePath: string;
  fileName: string;
  contentType: string | null;
  byteSize: number | null;
  uploadedBy: string;
  createdAt: string;
};

const addWorkTaskAttachmentSchema = z.object({
  taskId: z.number().int().positive(),
  storagePath: z.string().trim().min(1).max(1024),
  fileName: z.string().trim().min(1).max(255),
  contentType: z.string().trim().max(100).optional(),
  byteSize: z.number().int().nonnegative().optional(),
});

export const addWorkTaskAttachment = withAction<
  typeof addWorkTaskAttachmentSchema,
  WorkTaskAttachmentRow
>(
  {
    schema: addWorkTaskAttachmentSchema,
    roles: WORK_ROUTE_ROLES,
  },
  async (data, ctx) => {
    const { data: canWrite, error: checkError } = await ctx.supabase.rpc(
      "can_write_work_task",
      { p_task_id: data.taskId },
    );
    if (checkError || !canWrite) {
      return { success: false, error: workCopy.forbidden };
    }

    const service = createServiceClient();
    const { data: row, error } = await service
      .from("work_task_attachments")
      .insert({
        tenant_id: ctx.claims.tenant_id,
        task_id: data.taskId,
        storage_path: data.storagePath,
        file_name: data.fileName,
        content_type: data.contentType ?? null,
        byte_size: data.byteSize ?? null,
        uploaded_by: ctx.userId,
      })
      .select(
        "id, task_id, tenant_id, storage_path, file_name, content_type, byte_size, uploaded_by, created_at",
      )
      .single();

    if (error || !row) {
      return { success: false, error: workCopy.attachmentUploadFailed };
    }

    revalidateWorkPaths(data.taskId);
    return {
      success: true,
      data: {
        id: row.id,
        taskId: row.task_id,
        tenantId: row.tenant_id,
        storagePath: row.storage_path,
        fileName: row.file_name,
        contentType: row.content_type,
        byteSize: row.byte_size,
        uploadedBy: row.uploaded_by,
        createdAt: row.created_at,
      },
    };
  },
);

const deleteWorkTaskAttachmentSchema = z.object({
  taskId: z.number().int().positive(),
  attachmentId: z.number().int().positive(),
});

export const deleteWorkTaskAttachment = withAction(
  {
    schema: deleteWorkTaskAttachmentSchema,
    roles: WORK_ROUTE_ROLES,
  },
  async (data, ctx) => {
    const { data: canWrite, error: checkError } = await ctx.supabase.rpc(
      "can_write_work_task",
      { p_task_id: data.taskId },
    );
    if (checkError || !canWrite) {
      return { success: false, error: workCopy.forbidden };
    }

    const service = createServiceClient();
    const { data: existing } = await service
      .from("work_task_attachments")
      .select("id, storage_path")
      .eq("id", data.attachmentId)
      .eq("task_id", data.taskId)
      .eq("tenant_id", ctx.claims.tenant_id)
      .maybeSingle();

    if (!existing) {
      return { success: false, error: workCopy.attachmentDeleteFailed };
    }

    if (existing.storage_path) {
      await service.storage
        .from("inventory-attachments")
        .remove([existing.storage_path]);
    }

    const { error } = await service
      .from("work_task_attachments")
      .delete()
      .eq("id", data.attachmentId)
      .eq("task_id", data.taskId)
      .eq("tenant_id", ctx.claims.tenant_id);

    if (error) {
      return { success: false, error: workCopy.attachmentDeleteFailed };
    }

    revalidateWorkPaths(data.taskId);
    return { success: true };
  },
);

export async function uploadWorkTaskAttachmentFile(
  formData: FormData,
): Promise<ActionResult<WorkTaskAttachmentRow>> {
  const file = formData.get("file");
  const taskIdRaw = formData.get("taskId");
  if (!(file instanceof File) || !taskIdRaw) {
    return { success: false, error: "Tệp không hợp lệ" };
  }
  const taskId = Number(taskIdRaw);
  if (!Number.isInteger(taskId) || taskId <= 0) {
    return { success: false, error: "Mã công việc không hợp lệ" };
  }

  const { supabase, claims, userId } = await loadAuthState();
  if (!userId || !claims) {
    return { success: false, error: "Chưa đăng nhập" };
  }

  const { data: canWrite, error: checkErr } = await supabase.rpc(
    "can_write_work_task",
    { p_task_id: taskId },
  );
  if (checkErr || !canWrite) {
    return { success: false, error: workCopy.forbidden };
  }

  if (file.size > 10 * 1024 * 1024) {
    return { success: false, error: "Kích thước tệp vượt quá giới hạn 10MB" };
  }

  const service = createServiceClient();
  const ext = file.name.includes(".")
    ? file.name.slice(file.name.lastIndexOf("."))
    : ".jpg";
  const storagePath = `${claims.tenant_id}/work-tasks/${taskId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: upErr } = await service.storage
    .from("inventory-attachments")
    .upload(storagePath, buffer, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

  if (upErr) {
    return { success: false, error: workCopy.attachmentUploadFailed };
  }

  const { data: urlData } = service.storage
    .from("inventory-attachments")
    .getPublicUrl(storagePath);

  const publicUrl = urlData.publicUrl;

  const { data: row, error: dbErr } = await service
    .from("work_task_attachments")
    .insert({
      tenant_id: claims.tenant_id,
      task_id: taskId,
      storage_path: publicUrl,
      file_name: file.name,
      content_type: file.type || null,
      byte_size: file.size,
      uploaded_by: userId,
    })
    .select(
      "id, task_id, tenant_id, storage_path, file_name, content_type, byte_size, uploaded_by, created_at",
    )
    .single();

  if (dbErr || !row) {
    return { success: false, error: workCopy.attachmentUploadFailed };
  }

  revalidateWorkPaths(taskId);
  return {
    success: true,
    data: {
      id: row.id,
      taskId: row.task_id,
      tenantId: row.tenant_id,
      storagePath: row.storage_path,
      fileName: row.file_name,
      contentType: row.content_type,
      byteSize: row.byte_size,
      uploadedBy: row.uploaded_by,
      createdAt: row.created_at,
    },
  };
}

export type WorkMemberRole = "lead" | "member";

export type WorkDepartmentMemberRow = {
  id: number;
  departmentId: number;
  userId: string;
  fullName: string;
  role: WorkMemberRole;
  isActive: boolean;
};

export type WorkProfileOption = {
  id: string;
  fullName: string;
  branchId?: number | null;
  branchName?: string | null;
};

const workMemberRoleSchema = z.enum(["lead", "member"]);

const workDepartmentNameSchema = z.object({
  name: z.string().trim().min(1).max(120),
  departmentId: z.number().int().positive().optional(),
});

export const upsertWorkDepartment = withAction(
  {
    schema: workDepartmentNameSchema,
    customAuth: async () => {
      const { resolveWorkManageContext } = await import("./_lib/work-manage");
      return resolveWorkManageContext();
    },
  },
  async (data, ctx) => {
    const { data: row, error } = await ctx.supabase.rpc("upsert_work_department", {
      p_name: data.name,
      p_department_id: data.departmentId ?? null,
    } as Database["public"]["Functions"]["upsert_work_department"]["Args"]);
    if (error) {
      return mapRpcError(
        error,
        [
          ...workRpcMappings,
          {
            match: includesAny("duplicate", "unique", "23505"),
            errorCode: "work.department_duplicate",
            userMessage: workCopy.departmentDuplicate,
          },
        ],
        {
          userMessage: workCopy.departmentCreateFailed,
          errorCode: "work.department_upsert_failed",
        },
      );
    }
    if (!row) {
      return { success: false, error: workCopy.departmentCreateFailed };
    }
    revalidatePath("/work");
    revalidatePath("/work/team");
    return {
      success: true,
      data: { id: row.id, name: row.name } satisfies WorkDepartmentOption,
    };
  },
);

export const deactivateWorkDepartment = withAction(
  {
    schema: z.object({
      departmentId: z.number().int().positive(),
    }),
    customAuth: async () => {
      const { resolveWorkManageContext } = await import("./_lib/work-manage");
      return resolveWorkManageContext();
    },
  },
  async (data, ctx) => {
    const { error } = await ctx.supabase.rpc("deactivate_work_department", {
      p_department_id: data.departmentId,
    } as Database["public"]["Functions"]["deactivate_work_department"]["Args"]);
    if (error) {
      return mapRpcError(error, workRpcMappings, {
        userMessage: workCopy.departmentDeactivateFailed,
        errorCode: "work.department_deactivate_failed",
      });
    }
    revalidatePath("/work");
    revalidatePath("/work/team");
    return { success: true };
  },
);

function mapMemberRole(value: string): WorkMemberRole {
  return value === "lead" ? "lead" : "member";
}

export const listWorkDepartmentMembers = withAction(
  {
    schema: z.object({
      departmentId: z.number().int().positive(),
    }),
    roles: WORK_ROUTE_ROLES,
  },
  async (data, ctx) => {
    const { data: rows, error } = await ctx.supabase
      .from("work_department_members")
      .select("id, department_id, user_id, role, is_active, profiles!inner(full_name)")
      .eq("tenant_id", ctx.claims.tenant_id)
      .eq("department_id", data.departmentId)
      .eq("is_active", true)
      .order("role", { ascending: true });
    if (error) {
      return { success: false, error: workCopy.loadFailed };
    }
    const items: WorkDepartmentMemberRow[] = (rows ?? []).map((row) => {
      const profile = row.profiles as unknown as { full_name: string } | null;
      return {
        id: row.id,
        departmentId: row.department_id,
        userId: row.user_id,
        fullName: staffDisplayLabel(profile?.full_name),
        role: mapMemberRole(row.role),
        isActive: row.is_active,
      };
    });
    return { success: true, data: { items } };
  },
);

export const listWorkCandidateProfiles = withAction(
  {
    schema: z.object({
      departmentId: z.number().int().positive(),
    }),
    customAuth: async () => {
      const { resolveWorkManageContext } = await import("./_lib/work-manage");
      return resolveWorkManageContext();
    },
  },
  async (data, ctx) => {
    const [{ data: memberRows }, { data: profiles, error }, { data: branchRows }] = await Promise.all([
      ctx.supabase
        .from("work_department_members")
        .select("user_id")
        .eq("tenant_id", ctx.claims.tenant_id)
        .eq("department_id", data.departmentId)
        .eq("is_active", true),
      ctx.supabase
        .from("profiles")
        .select("id, full_name, branch_id")
        .eq("tenant_id", ctx.claims.tenant_id)
        .eq("is_active", true)
        .order("full_name"),
      ctx.supabase
        .from("branches")
        .select("id, name")
        .eq("tenant_id", ctx.claims.tenant_id)
        .eq("is_active", true)
        .order("name"),
    ]);
    if (error) {
      return { success: false, error: workCopy.loadFailed };
    }
    const branchNameById = new Map<number, string>(
      (branchRows ?? []).map((b) => [b.id, b.name]),
    );
    const taken = new Set((memberRows ?? []).map((row) => row.user_id));
    const items: WorkProfileOption[] = (profiles ?? [])
      .filter((row) => !taken.has(row.id))
      .map((row) => ({
        id: row.id,
        fullName: row.full_name,
        branchId: row.branch_id,
        branchName: row.branch_id != null ? (branchNameById.get(row.branch_id) ?? null) : null,
      }));
    return { success: true, data: { items } };
  },
);

const upsertMembersSchema = z.object({
  departmentId: z.number().int().positive(),
  userIds: z.array(z.string().uuid()).min(1),
  role: workMemberRoleSchema,
});

export const upsertWorkDepartmentMembers = withAction(
  {
    schema: upsertMembersSchema,
    customAuth: async () => {
      const { resolveWorkManageContext } = await import("./_lib/work-manage");
      return resolveWorkManageContext();
    },
  },
  async (data, ctx) => {
    const results = await Promise.all(
      data.userIds.map((userId) =>
        ctx.supabase.rpc("upsert_work_department_member", {
          p_department_id: data.departmentId,
          p_user_id: userId,
          p_role: data.role,
        }),
      ),
    );
    const firstError = results.find((r) => r.error)?.error;
    if (firstError) {
      return mapRpcError(firstError, workRpcMappings, {
        userMessage: workCopy.teamAddFailed,
        errorCode: "work.member_upsert_failed",
      });
    }
    revalidatePath("/work");
    revalidatePath("/work/team");
    return {
      success: true,
      data: {
        count: results.filter((r) => r.data != null).length,
      },
    };
  },
);

const upsertMemberSchema = z.object({
  departmentId: z.number().int().positive(),
  userId: z.string().uuid(),
  role: workMemberRoleSchema,
});

export const upsertWorkDepartmentMember = withAction(
  {
    schema: upsertMemberSchema,
    customAuth: async () => {
      const { resolveWorkManageContext } = await import("./_lib/work-manage");
      return resolveWorkManageContext();
    },
  },
  async (data, ctx) => {
    const { data: row, error } = await ctx.supabase.rpc(
      "upsert_work_department_member",
      {
        p_department_id: data.departmentId,
        p_user_id: data.userId,
        p_role: data.role,
      },
    );
    if (error) {
      return mapRpcError(error, workRpcMappings, {
        userMessage: workCopy.teamAddFailed,
        errorCode: "work.member_upsert_failed",
      });
    }
    if (!row) {
      return { success: false, error: workCopy.teamAddFailed };
    }
    revalidatePath("/work");
    revalidatePath("/work/team");
    return {
      success: true,
      data: {
        id: row.id,
        departmentId: row.department_id,
        userId: row.user_id,
        fullName: "",
        role: mapMemberRole(row.role),
        isActive: row.is_active,
      } satisfies WorkDepartmentMemberRow,
    };
  },
);

export const setWorkDepartmentMemberRole = withAction(
  {
    schema: upsertMemberSchema,
    customAuth: async () => {
      const { resolveWorkManageContext } = await import("./_lib/work-manage");
      return resolveWorkManageContext();
    },
  },
  async (data, ctx) => {
    const { data: row, error } = await ctx.supabase.rpc(
      "set_work_department_member_role",
      {
        p_department_id: data.departmentId,
        p_user_id: data.userId,
        p_role: data.role,
      },
    );
    if (error) {
      return mapRpcError(error, workRpcMappings, {
        userMessage: workCopy.teamSaveFailed,
        errorCode: "work.member_role_failed",
      });
    }
    if (!row) {
      return { success: false, error: workCopy.teamSaveFailed };
    }
    revalidatePath("/work/team");
    return {
      success: true,
      data: {
        id: row.id,
        departmentId: row.department_id,
        userId: row.user_id,
        fullName: "",
        role: mapMemberRole(row.role),
        isActive: row.is_active,
      } satisfies WorkDepartmentMemberRow,
    };
  },
);

export const deactivateWorkDepartmentMember = withAction(
  {
    schema: z.object({
      departmentId: z.number().int().positive(),
      userId: z.string().uuid(),
    }),
    customAuth: async () => {
      const { resolveWorkManageContext } = await import("./_lib/work-manage");
      return resolveWorkManageContext();
    },
  },
  async (data, ctx) => {
    const { data: row, error } = await ctx.supabase.rpc(
      "deactivate_work_department_member",
      {
        p_department_id: data.departmentId,
        p_user_id: data.userId,
      },
    );
    if (error) {
      return mapRpcError(error, workRpcMappings, {
        userMessage: workCopy.teamSaveFailed,
        errorCode: "work.member_deactivate_failed",
      });
    }
    if (!row) {
      return { success: false, error: workCopy.teamSaveFailed };
    }
    revalidatePath("/work");
    revalidatePath("/work/team");
    return { success: true };
  },
);
