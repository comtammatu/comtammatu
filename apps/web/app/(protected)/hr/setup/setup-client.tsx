"use client";

import { useState } from "react";
import { AppPageTabs, TabsContent } from "@/components/app-page-tabs";
import { AppSection } from "@/components/surface";
import { messages } from "@lib/messages";
import { PositionTasksClient } from "../position-tasks-client";
import type { PositionTasksData } from "../position-tasks-actions";
import { ShiftsTable } from "../shifts-table";
import type { ShiftRow } from "../_types";
import type { HrLeavePolicy } from "@lib/hr/leave-policy-model";
import { LeavePolicyForm } from "./leave-policy-form";

interface Props {
  initialShifts: ShiftRow[];
  positionTasksData: PositionTasksData;
  leavePolicy: HrLeavePolicy | null;
  leavePolicyPersisted: boolean;
  initialTab?: "leave" | "shifts" | "tasks";
  initialBranchFilter?: string;
}

export function HrSetupClient({
  initialShifts,
  positionTasksData,
  leavePolicy,
  leavePolicyPersisted,
  initialTab = "leave",
  initialBranchFilter,
}: Props) {
  const [shifts, setShifts] = useState(initialShifts);
  const copy = messages.hr.client;

  return (
    <AppPageTabs
      items={[
        { value: "leave", label: copy.setupTabs.leave },
        { value: "shifts", label: copy.setupTabs.shifts },
        { value: "tasks", label: copy.setupTabs.tasks },
      ]}
      defaultValue="leave"
      ariaLabel={copy.setupTabs.ariaLabel}
      queryKeysByValue={{
        leave: ["branch"],
        shifts: ["branch"],
        tasks: ["branch"],
      }}
    >
      {initialTab === "leave" ? (
        <TabsContent value="leave">
          <AppSection
            title={copy.setupSteps.leavePolicy.title}
            description={copy.setupSteps.leavePolicy.description}
            headerHint={copy.setupSteps.leavePolicy.hint}
          >
            {leavePolicy ? (
              <LeavePolicyForm
                policy={leavePolicy}
                initiallyPersisted={leavePolicyPersisted}
              />
            ) : (
              <p className="text-sm text-destructive" role="alert">
                {copy.leavePolicy.loadFailed}
              </p>
            )}
          </AppSection>
        </TabsContent>
      ) : null}
      {initialTab === "shifts" ? (
        <TabsContent value="shifts">
          <AppSection
            title={copy.setupSteps.shifts.title}
            description={copy.setupSteps.shifts.description}
            headerHint={copy.setupSteps.shifts.hint}
            contentFlush
            contentScroll
          >
            <ShiftsTable
              shifts={shifts}
              isPending={false}
              canManage
              onShiftSaved={(shift) =>
                setShifts((current) => {
                  const hasShift = current.some((item) => item.id === shift.id);
                  return hasShift
                    ? current.map((item) =>
                        item.id === shift.id ? { ...item, ...shift } : item,
                      )
                    : [...current, shift];
                })
              }
            />
          </AppSection>
        </TabsContent>
      ) : null}
      {initialTab === "tasks" ? (
        <TabsContent value="tasks">
          <AppSection
            title={copy.setupSteps.positionTasks.title}
            description={copy.setupSteps.positionTasks.description}
            headerHint={copy.setupSteps.positionTasks.hint}
          >
            <PositionTasksClient
              initialData={positionTasksData}
              initialBranchFilter={initialBranchFilter}
            />
          </AppSection>
        </TabsContent>
      ) : null}
    </AppPageTabs>
  );
}
