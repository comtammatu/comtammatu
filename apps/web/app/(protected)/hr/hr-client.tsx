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
import type { BranchOption, EmployeeRow } from "./_types";
import { AddStaffButton } from "./staff/add-staff-button";
import { StaffHeaderOverflow } from "./staff/staff-header-actions";
import { StaffFilters } from "./staff/staff-filters";
import {
  StaffTable,
  type PositionOption,
  type StaffRow,
} from "./staff/staff-table";

type PeopleView = "profile" | "accounts";

interface HrClientProps {
  employees: EmployeeRow[];
  branches: BranchOption[];
  positionOptions: Array<{ value: string; label: string }>;
  attention: HrAttentionSummary;
  initialSalaryFilter?: "all" | "missing" | "recorded";
  initialView?: PeopleView;
  canManageAccounts?: boolean;
  staff?: StaffRow[];
  staffBranches?: BranchOption[];
  staffPositionOptions?: PositionOption[];
  staffHasActiveFilters?: boolean;
}

export function HrClient({
  employees,
  branches,
  positionOptions,
  attention,
  initialSalaryFilter = "all",
  initialView = "profile",
  canManageAccounts = false,
  staff = [],
  staffBranches = [],
  staffPositionOptions = [],
  staffHasActiveFilters = false,
}: HrClientProps) {
  const [addOpen, setAddOpen] = useState(false);
  const searchParams = useSearchParams();
  const copy = messages.hr.client;
  const workspaceCopy = messages.hr.workspace;
  const staffCopy = messages.owner.staffPage;
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
        title={workspaceCopy.ownerTitle}
        description={
          view === "accounts"
            ? staffCopy.description
            : workspaceCopy.ownerDescription
        }
        actions={
          view === "accounts" && canManageAccounts ? (
            <div className="flex flex-wrap gap-2">
              <AddStaffButton
                branches={staffBranches}
                positionOptions={staffPositionOptions}
              />
              <StaffHeaderOverflow />
            </div>
          ) : (
            <Button size="touch" onClick={() => setAddOpen(true)}>
              <IconUserPlus data-icon="inline-start" />
              {copy.addEmployee}
            </Button>
          )
        }
      />
      <AppPageTabs
        items={tabItems}
        defaultValue="profile"
        paramKey="view"
        ariaLabel={copy.peopleTabs.ariaLabel}
      >
        <TabsContent value="profile">
          <HrAttentionStrip summary={attention} />
          <EmployeeTable
            employees={employees}
            branches={branches}
            positionOptions={positionOptions}
            canManage
            initialSalaryFilter={initialSalaryFilter}
          />
        </TabsContent>
        {canManageAccounts ? (
          <TabsContent value="accounts">
            <AppListFrame
              contentScroll
              toolbar={
                <Suspense>
                  <StaffFilters
                    branches={staffBranches}
                    positionOptions={staffPositionOptions}
                  />
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
      <EmployeeFormDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        branches={branches}
        positionOptions={positionOptions}
      />
    </AppPage>
  );
}
