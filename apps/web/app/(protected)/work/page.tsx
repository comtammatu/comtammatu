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
  listWorkProjects,
  type WorkProfileOption,
} from "./actions";
import { parseWorkParams, type WorkSearchParams } from "./_lib/params";
import { canManageWorkTeam } from "./_lib/work-manage";
import { WorkBoard } from "./_components/work-board";
import { WorkCalendar } from "./_components/work-calendar";
import type { WorkComposeArchetype } from "./_components/compose/work-compose-shell";
import type { WorkScopeDialogMode } from "./_components/compose/work-scope-dialog";
import { WorkCreateDialog } from "./_components/work-create-dialog";
import { WorkInboxFiltered } from "./_components/work-inbox-filtered";
import { WorkPageHeaderActions } from "./_components/work-page-header-actions";
import { WorkPageShell } from "./_components/work-page-shell";
import { WorkTimeline } from "./_components/work-timeline";

function resolveScopeNames(
  params: ReturnType<typeof parseWorkParams>,
  departments: Array<{ id: number; name: string }>,
  projects: Array<{ id: number; name: string }>,
): { departmentName: string | null; projectName: string | null } {
  return {
    departmentName:
      params.departmentId != null
        ? (departments.find((row) => row.id === params.departmentId)?.name ??
          null)
        : null,
    projectName:
      params.projectId != null
        ? (projects.find((row) => row.id === params.projectId)?.name ?? null)
        : null,
  };
}

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
  const [departmentsResult, projectsResult] = await Promise.all([
    listWorkDepartments({}),
    listWorkProjects({}),
  ]);
  const departments =
    departmentsResult.success && departmentsResult.data
      ? departmentsResult.data.items
      : [];
  const projects =
    projectsResult.success && projectsResult.data
      ? projectsResult.data.items
      : [];

  const { departmentName, projectName } = resolveScopeNames(
    params,
    departments,
    projects,
  );

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

  const headerActions = (
    <WorkPageHeaderActions
      canManage={canManage}
      departments={departments}
      projects={projects}
    >
      {departments.length > 0 ? (
        <WorkCreateDialog
          departments={departments}
          projects={projects}
          membersByDepartment={membersByDepartment}
          defaultDepartmentId={params.departmentId}
          defaultProjectId={params.projectId}
        />
      ) : null}
    </WorkPageHeaderActions>
  );

  const needsBoardScope =
    params.view === "board" &&
    params.departmentId == null &&
    params.projectId == null;

  const needsTimelineScope =
    params.view === "timeline" && params.projectId == null;

  const needsScope = needsBoardScope || needsTimelineScope;

  const scopeMode: WorkScopeDialogMode =
    params.view === "timeline"
      ? "project-only"
      : params.view === "calendar"
        ? "optional"
        : "board-or-project";

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
          status={params.status}
          q={params.q}
        />
      );
    }
  } else if (params.view === "board") {
    if (needsBoardScope) {
      body = null;
    } else {
      const scoped = await listScopedWorkTasks(
        params.departmentId != null
          ? { departmentId: params.departmentId }
          : { projectId: params.projectId! },
      );
      if (!scoped.success || !scoped.data) {
        loadError = scoped.error ?? workCopy.loadFailed;
      } else {
        body = <WorkBoard tasks={scoped.data.items} />;
      }
    }
  } else if (params.view === "calendar") {
    const hasScope =
      params.departmentId != null || params.projectId != null;
    const result = hasScope
      ? await listScopedWorkTasks(
          params.departmentId != null
            ? { departmentId: params.departmentId }
            : { projectId: params.projectId! },
        )
      : await listMyWorkTasks({ includeDone: params.includeDone });
    if (!result.success || !result.data) {
      loadError = result.error ?? workCopy.loadFailed;
    } else {
      body = <WorkCalendar tasks={result.data.items} params={params} />;
    }
  } else if (needsTimelineScope) {
    body = null;
  } else {
    const scoped = await listScopedWorkTasks({
      projectId: params.projectId!,
    });
    if (!scoped.success || !scoped.data) {
      loadError = scoped.error ?? workCopy.loadFailed;
    } else {
      body = <WorkTimeline tasks={scoped.data.items} />;
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

  const scopeEmptyDescription = needsBoardScope
    ? workCopy.scopeEmptyBoard
    : needsTimelineScope
      ? workCopy.scopeEmptyTimeline
      : null;

  return (
    <AppPage width="xwide" density="compact" scroll>
      <AppPageHeader title={workCopy.pageTitle} actions={headerActions} />
      <WorkPageShell
        params={params}
        departments={departments}
        projects={projects}
        departmentName={departmentName}
        projectName={projectName}
        needsScope={needsScope}
        scopeMode={scopeMode}
        composeArchetype={composeArchetype}
        loadError={loadError}
        scopeEmptyDescription={scopeEmptyDescription}
      >
        {body}
      </WorkPageShell>
    </AppPage>
  );
}
