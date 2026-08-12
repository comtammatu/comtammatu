import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { Button } from "@comtammatu/ui/components/button";
import { loadAuthState } from "@/_lib/auth";
import {
  AppEmptyState,
  AppListFrame,
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
import { WorkCreateDialog } from "./_components/work-create-dialog";
import { WorkInboxFiltered } from "./_components/work-inbox-filtered";
import { WorkListToolbar } from "./_components/work-list-toolbar";
import { WorkScopePicker } from "./_components/work-scope-picker";
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

  if (params.view === "timeline" && params.projectId == null) {
    redirect("/work?view=mine");
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

  const createAction =
    departments.length > 0 ? (
      <WorkCreateDialog
        departments={departments}
        projects={projects}
        membersByDepartment={membersByDepartment}
        defaultDepartmentId={params.departmentId}
        defaultProjectId={params.projectId}
      />
    ) : null;

  const headerActions = (
    <div className="flex flex-wrap items-center gap-2">
      {canManage ? (
        <Button
          variant="outline"
          size="sm"
          render={<Link href="/work/team" />}
        >
          {workCopy.teamNav}
        </Button>
      ) : null}
      {createAction}
    </div>
  );

  const needsBoardScope =
    params.view === "board" &&
    params.departmentId == null &&
    params.projectId == null;

  if (needsBoardScope) {
    return (
      <AppPage width="xwide" density="compact" scroll>
        <AppPageHeader title={workCopy.pageTitle} actions={headerActions} />
        <AppListFrame
          contentScroll
          toolbar={<WorkListToolbar params={params} />}
        >
          <WorkScopePicker
            params={params}
            departments={departments}
            projects={projects}
          />
        </AppListFrame>
      </AppPage>
    );
  }

  let body: ReactNode;
  let loadError: string | null = null;
  const showInboxFilters = params.view === "mine";

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

  const toolbar = (
    <WorkListToolbar
      params={params}
      showFilters={showInboxFilters}
      trailing={
        params.view === "board" &&
        (params.departmentId != null || params.projectId != null) ? (
          <Button
            variant="outline"
            size="sm"
            render={<Link href="/work?view=board" />}
          >
            {workCopy.pickScope}
          </Button>
        ) : null
      }
    />
  );

  return (
    <AppPage width="xwide" density="compact" scroll>
      <AppPageHeader title={workCopy.pageTitle} actions={headerActions} />
      {loadError ? (
        <>
          <div className="mb-4">{toolbar}</div>
          <AppEmptyState mode="error" description={loadError} />
        </>
      ) : params.view === "mine" ? (
        <AppListFrame contentScroll toolbar={toolbar}>
          {body}
        </AppListFrame>
      ) : (
        <>
          <div className="mb-4">{toolbar}</div>
          {body}
        </>
      )}
    </AppPage>
  );
}
