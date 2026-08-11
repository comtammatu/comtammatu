import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { loadAuthState } from "@/_lib/auth";
import { AppEmptyState, AppPage, AppPageHeader } from "@/components/surface";
import { workCopy } from "@lib/messages/work";
import {
  listMyWorkTasks,
  listScopedWorkTasks,
  listWorkDepartments,
  listWorkProjects,
} from "./actions";
import { parseWorkParams, type WorkSearchParams } from "./_lib/params";
import { WorkBoard } from "./_components/work-board";
import { WorkCalendar } from "./_components/work-calendar";
import { WorkInbox } from "./_components/work-inbox";
import { WorkScopePicker } from "./_components/work-scope-picker";
import { WorkTimeline } from "./_components/work-timeline";
import { WorkViewSwitcher } from "./_components/work-view-switcher";

export default async function WorkPage({
  searchParams,
}: {
  searchParams?: Promise<WorkSearchParams>;
}) {
  const params = parseWorkParams(searchParams ? await searchParams : undefined);
  const { supabase } = await loadAuthState();

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

  const needsBoardScope =
    params.view === "board" &&
    params.departmentId == null &&
    params.projectId == null;

  if (needsBoardScope) {
    const [departments, projects] = await Promise.all([
      listWorkDepartments({}),
      listWorkProjects({}),
    ]);
    return (
      <AppPage width="xwide" density="compact" scroll>
        <AppPageHeader title={workCopy.pageTitle} />
        <div className="mb-4">
          <WorkViewSwitcher params={params} />
        </div>
        <WorkScopePicker
          params={params}
          departments={
            departments.success && departments.data
              ? departments.data.items
              : []
          }
          projects={
            projects.success && projects.data ? projects.data.items : []
          }
        />
      </AppPage>
    );
  }

  let body: ReactNode;
  let loadError: string | null = null;

  if (params.view === "mine") {
    const result = await listMyWorkTasks({ includeDone: params.includeDone });
    if (!result.success || !result.data) {
      loadError = result.error ?? workCopy.loadFailed;
    } else {
      body = <WorkInbox tasks={result.data.items} />;
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

  return (
    <AppPage width="xwide" density="compact" scroll>
      <AppPageHeader title={workCopy.pageTitle} />
      <div className="mb-4">
        <WorkViewSwitcher params={params} />
      </div>
      {loadError ? (
        <AppEmptyState mode="error" description={loadError} />
      ) : (
        body
      )}
    </AppPage>
  );
}
