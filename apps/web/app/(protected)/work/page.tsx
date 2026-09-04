import type { ReactNode } from "react";
import { loadAuthState } from "@/_lib/auth";
import {
  AppEmptyState,
  AppPage,
  AppPageHeader,
} from "@/components/surface";
import { workCopy } from "@lib/messages/work";
import {
  listMyWorkTasks,
  listScopedWorkTasks,
  listWorkDepartmentMembers,
  listWorkDepartments,
  type WorkProfileOption,
} from "./actions";
import { loadWorkTaskDetail } from "./_lib/load-work-task-detail";
import { parseWorkParams, type WorkSearchParams } from "./_lib/params";
import { canManageWorkTeam } from "./_lib/work-manage";
import { WorkBoard } from "./_components/work-board";
import { WorkCalendar } from "./_components/work-calendar";
import type { WorkComposeArchetype } from "./_components/compose/work-compose-shell";
import { WorkCreateDialog } from "./_components/work-create-dialog";
import { WorkInboxFiltered } from "./_components/work-inbox-filtered";
import { WorkPageHeaderActions } from "./_components/work-page-header-actions";
import { WorkPageShell } from "./_components/work-page-shell";
import {
  WorkTaskDetailDialogHost,
  type WorkTaskDetailPayload,
} from "./_components/work-task-detail-dialog-host";
import { WorkTimeline } from "./_components/work-timeline";

export default async function WorkPage({
  searchParams,
}: {
  searchParams?: Promise<WorkSearchParams>;
}) {
  const params = parseWorkParams(searchParams ? await searchParams : undefined);
  const { supabase, claims } = await loadAuthState();

  const { data: canAccess, error: accessError } = await supabase.rpc(
    "can_access_workspace",
  );
  if (accessError || canAccess !== true) {
    return (
      <AppPage width="xwide">
        <AppPageHeader title={workCopy.pageTitle} />
        <AppEmptyState mode="no-data" description={workCopy.noAccess} />
      </AppPage>
    );
  }

  const canManage = await canManageWorkTeam({ supabase, claims });
  const departmentsResult = await listWorkDepartments({});
  const departments =
    departmentsResult.success && departmentsResult.data
      ? departmentsResult.data.items
      : [];

  const membersByDepartment: Record<number, WorkProfileOption[]> = {};
  await Promise.all(
    departments.map(async (department) => {
      const members = await listWorkDepartmentMembers({
        departmentId: department.id,
      });
      membersByDepartment[department.id] =
        members.success && members.data
          ? members.data.items.map((member) => ({
              id: member.userId,
              fullName: member.fullName,
            }))
          : [];
    }),
  );

  const assigneeNames: Record<string, string> = {};
  for (const members of Object.values(membersByDepartment)) {
    for (const member of members) {
      if (member.id && member.fullName) {
        assigneeNames[member.id] = member.fullName;
      }
    }
  }

  let taskDetail: WorkTaskDetailPayload | null = null;
  let taskDetailError: string | null = null;
  if (params.taskId != null) {
    const detailResult = await loadWorkTaskDetail(supabase, params.taskId);
    if (!detailResult.success) {
      taskDetailError = workCopy.taskNotFound;
    } else {
      taskDetail = detailResult.data;
    }
  }

  const headerActions = (
    <WorkPageHeaderActions canManage={canManage} departments={departments}>
      {departments.length > 0 ? (
        <WorkCreateDialog
          departments={departments}
          membersByDepartment={membersByDepartment}
          defaultDepartmentId={params.departmentId}
          params={params}
        />
      ) : null}
    </WorkPageHeaderActions>
  );

  let body: ReactNode;
  let loadError: string | null = null;

  if (params.view === "mine") {
    const result = await listMyWorkTasks({ includeDone: params.includeDone });
    if (!result.success || !result.data) {
      loadError = result.error ?? workCopy.loadFailed;
    } else {
      body = (
        <WorkInboxFiltered
          tasks={result.data.items}
          params={params}
          status={params.status}
          q={params.q}
        />
      );
    }
  } else {
    const scoped =
      params.departmentId != null
        ? await listScopedWorkTasks({ departmentId: params.departmentId })
        : params.view === "board" || params.view === "timeline"
          ? await listScopedWorkTasks({})
          : await listMyWorkTasks({ includeDone: params.includeDone });

    if (!scoped.success || !scoped.data) {
      loadError = scoped.error ?? workCopy.loadFailed;
    } else if (params.view === "board") {
      body = (
        <WorkBoard
          tasks={scoped.data.items}
          params={params}
          assigneeNames={assigneeNames}
          departments={departments}
          membersByDepartment={membersByDepartment}
        />
      );
    } else if (params.view === "calendar") {
      body = <WorkCalendar tasks={scoped.data.items} params={params} />;
    } else {
      body = (
        <WorkTimeline
          tasks={scoped.data.items}
          params={params}
          departments={departments}
          assigneeNames={assigneeNames}
        />
      );
    }
  }

  const composeArchetype: WorkComposeArchetype | null =
    params.view === "board"
      ? "TASK_BOARD"
      : params.view === "calendar"
        ? "TASK_CALENDAR"
        : params.view === "timeline"
          ? "TASK_TIMELINE"
          : null;

  return (
    <AppPage width="full" density="compact" scroll>
      <AppPageHeader title={workCopy.pageTitle} actions={headerActions} />
      <WorkPageShell
        params={params}
        departments={departments}
        composeArchetype={composeArchetype}
        loadError={loadError}
      >
        {body}
      </WorkPageShell>
      <WorkTaskDetailDialogHost
        params={params}
        detail={taskDetail}
        loadError={taskDetailError}
      />
    </AppPage>
  );
}
