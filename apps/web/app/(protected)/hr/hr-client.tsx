"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { UserPlus as IconUserPlus } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { AppPage, AppPageHeader, AppListFrame } from "@/components/surface";
import { AppPageTabs, TabsContent } from "@/components/app-page-tabs";
import { messages } from "@lib/messages";
import { EmployeeFormDialog } from "./employee-form-dialog";
import { EmployeeTable } from "./employee-table";
import { HrAttentionStrip } from "./hr-attention-strip";
import type { HrAttentionSummary } from "./hr-attention";
import type {
  BranchOption,
  EmployeeRow,
  EmployeeShiftOption,
  EmployeeTodayShiftAssignment,
} from "./_types";
import type { PositionTasksData } from "./position-tasks-actions";
import { AddStaffButton } from "./staff/add-staff-button";
import { GrantEmployeeAccessButton } from "./staff/grant-employee-access-button";
import { StaffHeaderOverflow } from "./staff/staff-header-actions";
import { StaffFilters } from "./staff/staff-filters";
import {
  StaffTable,
  type PositionOption,
  type StaffRow,
} from "./staff/staff-table";
import { HrScopeSelector } from "./hr-scope-selector";
import { resolveHrBranchScope, type HrBranchScope } from "@/lib/hr-scope";

type PeopleView = "profile" | "accounts";

interface HrClientProps {
  employees: EmployeeRow[];
  branches: BranchOption[];
  positionOptions: Array<{ value: string; label: string }>;
  attention: HrAttentionSummary;
  initialSalaryFilter?: "all" | "missing" | "recorded";
  initialView?: PeopleView;
  canManageAccounts?: boolean;
  canManageEmployees?: boolean;
  canAssignShift?: boolean;
  canManageTasks?: boolean;
  shifts?: EmployeeShiftOption[];
  todayAssignments?: EmployeeTodayShiftAssignment[];
  positionTasksData?: PositionTasksData | null;
  staff?: StaffRow[];
  staffBranches?: BranchOption[];
  staffPositionOptions?: PositionOption[];
  staffHasActiveFilters?: boolean;
  initialScope?: HrBranchScope;
}

export function HrClient({
  employees,
  branches,
  positionOptions,
  attention,
  initialSalaryFilter = "all",
  initialView = "profile",
  canManageAccounts = false,
  canManageEmployees = false,
  canAssignShift = false,
  canManageTasks = false,
  shifts = [],
  todayAssignments = [],
  positionTasksData = null,
  staff = [],
  staffBranches = [],
  staffPositionOptions = [],
  staffHasActiveFilters = false,
  initialScope,
}: HrClientProps) {
  const [addOpen, setAddOpen] = useState(false);
  const searchParams = useSearchParams();
  const copy = messages.hr.client;
  const workspaceCopy = messages.hr.workspace;
  const staffCopy = messages.owner.staffPage;
  const branchScope = resolveHrBranchScope(initialScope, branches);
  const requestedView = searchParams.get("view");
  const view: PeopleView =
    canManageAccounts &&
    (requestedView === "accounts" ||
      (requestedView == null && initialView === "accounts"))
      ? "accounts"
      : "profile";

  const tabItems = [
    { value: "profile", label: copy.peopleTabs.profile },
    ...(canManageAccounts
      ? [{ value: "accounts", label: copy.peopleTabs.accounts }]
      : []),
  ];

  return (
    <AppPage width="xwide">
      <AppPageHeader
        title={
          view === "accounts" ? staffCopy.title : workspaceCopy.ownerTitle
        }
        description={
          view === "accounts"
            ? staffCopy.description
            : workspaceCopy.ownerDescription
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <HrScopeSelector branches={branches} value={branchScope} />
            {view === "accounts" && canManageAccounts ? (
              <>
                <GrantEmployeeAccessButton
                  employees={employees}
                  staff={staff}
                />
                <AddStaffButton
                  branches={staffBranches}
                  positionOptions={staffPositionOptions}
                />
                <StaffHeaderOverflow />
              </>
            ) : canManageEmployees ? (
              <Button size="touch" onClick={() => setAddOpen(true)}>
                <IconUserPlus data-icon="inline-start" />
                {copy.addEmployee}
              </Button>
            ) : null}
          </div>
        }
      />
      <AppPageTabs
        items={tabItems}
        defaultValue="profile"
        paramKey="view"
        ariaLabel={copy.peopleTabs.ariaLabel}
        queryKeysByValue={{
          profile: ["q", "branch", "position", "contract", "salary", "status"],
          accounts: ["q", "branch", "position", "status"],
        }}
      >
        {view === "profile" ? (
          <TabsContent value="profile">
            <HrAttentionStrip summary={attention} branchScope={branchScope} />
            <EmployeeTable
              employees={employees}
              branches={branches}
              positionOptions={positionOptions}
              canManage={canManageEmployees}
              canAssignShift={canAssignShift}
              canManageTasks={canManageTasks}
              shifts={shifts}
              todayAssignments={todayAssignments}
              positionTasksData={positionTasksData}
              initialSalaryFilter={initialSalaryFilter}
            />
          </TabsContent>
        ) : null}
        {view === "accounts" && canManageAccounts ? (
          <TabsContent value="accounts">
            <AppListFrame
              contentScroll
              toolbar={
                <Suspense>
                  <StaffFilters positionOptions={staffPositionOptions} />
                </Suspense>
              }
            >
              <StaffTable
                staff={staff}
                branches={staffBranches}
                positionOptions={staffPositionOptions}
                hasActiveFilters={staffHasActiveFilters}
              />
            </AppListFrame>
          </TabsContent>
        ) : null}
      </AppPageTabs>
      {canManageEmployees ? (
        <EmployeeFormDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          branches={branches}
          positionOptions={positionOptions}
        />
      ) : null}
    </AppPage>
  );
}
