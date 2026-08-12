import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@comtammatu/ui/components/button";
import { loadAuthState } from "@/_lib/auth";
import {
  AppBackLink,
  AppEmptyState,
  AppPage,
  AppPageHeader,
} from "@/components/surface";
import { workCopy } from "@lib/messages/work";
import {
  listWorkCandidateProfiles,
  listWorkDepartmentMembers,
  listWorkDepartments,
} from "../actions";
import { canManageWorkTeam } from "../_lib/work-manage";
import { WorkTeamClient } from "../_components/work-team-client";

export default async function WorkTeamPage({
  searchParams,
}: {
  searchParams?: Promise<{ department?: string | string[] }>;
}) {
  const raw = searchParams ? await searchParams : undefined;
  const rawDepartment = Array.isArray(raw?.department)
    ? raw?.department[0]
    : raw?.department;
  const requestedDepartmentId =
    rawDepartment && /^\d+$/.test(rawDepartment) ? Number(rawDepartment) : null;

  const { supabase, claims } = await loadAuthState();
  const { data: canAccess, error: accessError } = await supabase.rpc(
    "can_access_workspace",
  );
  if (accessError || canAccess !== true) {
    return (
      <AppPage width="xwide">
        <AppPageHeader title={workCopy.teamTitle} />
        <AppEmptyState mode="no-data" description={workCopy.noAccess} />
      </AppPage>
    );
  }

  const canManage = await canManageWorkTeam({ supabase, claims });
  if (!canManage) {
    return (
      <AppPage width="xwide">
        <AppPageHeader
          title={workCopy.teamTitle}
          actions={
            <AppBackLink href="/work">{workCopy.pageTitle}</AppBackLink>
          }
        />
        <AppEmptyState
          mode="no-data"
          description={workCopy.teamManageForbidden}
        />
      </AppPage>
    );
  }

  let departmentsResult = await listWorkDepartments({});
  const departments =
    departmentsResult.success && departmentsResult.data
      ? departmentsResult.data.items
      : [];

  const departmentId =
    departments.length === 0
      ? null
      : requestedDepartmentId != null &&
          departments.some((department) => department.id === requestedDepartmentId)
        ? requestedDepartmentId
        : departments[0]!.id;

  if (
    departments.length > 0 &&
    requestedDepartmentId !== departmentId
  ) {
    redirect(`/work/team?department=${departmentId}`);
  }

  const [membersResult, candidatesResult] =
    departmentId == null
      ? [
          { success: true as const, data: { items: [] } },
          { success: true as const, data: { items: [] } },
        ]
      : await Promise.all([
          listWorkDepartmentMembers({ departmentId }),
          listWorkCandidateProfiles({ departmentId }),
        ]);

  return (
    <AppPage width="xwide" density="compact" scroll>
      <AppPageHeader
        title={workCopy.teamTitle}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              render={<Link href="/work" />}
            >
              {workCopy.pageTitle}
            </Button>
          </div>
        }
      />
      <WorkTeamClient
        departmentId={departmentId}
        departments={departments}
        members={
          membersResult.success && membersResult.data
            ? membersResult.data.items
            : []
        }
        candidates={
          candidatesResult.success && candidatesResult.data
            ? candidatesResult.data.items
            : []
        }
        canManage={canManage}
      />
    </AppPage>
  );
}
