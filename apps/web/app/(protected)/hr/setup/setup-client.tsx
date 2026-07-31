"use client";

import { useState } from "react";
import { AppEmptyState, AppSection } from "@/components/surface";
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
}

export function HrSetupClient({
  initialShifts,
  positionTasksData,
  leavePolicy,
}: Props) {
  const [shifts, setShifts] = useState(initialShifts);
  const copy = messages.hr.client;

  return (
    <>
      <AppSection
        title={copy.setupSteps.leavePolicy.title}
        description={copy.setupSteps.leavePolicy.description}
        headerHint={copy.setupSteps.leavePolicy.hint}
      >
        {leavePolicy ? (
          <LeavePolicyForm policy={leavePolicy} />
        ) : (
          <p className="text-sm text-destructive" role="alert">
            {copy.leavePolicy.loadFailed}
          </p>
        )}
      </AppSection>
      <AppSection
        title={copy.setupSteps.shifts.title}
        description={copy.setupSteps.shifts.description}
        headerHint={copy.setupSteps.shifts.hint}
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
      <AppSection
        title={copy.setupSteps.templates.title}
        description={copy.setupSteps.templates.description}
        headerHint={copy.setupSteps.templates.hint}
      >
        <AppEmptyState
          title={copy.templatesPlaceholderTitle}
          description={copy.templatesPlaceholderDescription}
        />
      </AppSection>
      <AppSection
        title={copy.setupSteps.positionTasks.title}
        description={copy.setupSteps.positionTasks.description}
        headerHint={copy.setupSteps.positionTasks.hint}
      >
        <PositionTasksClient initialData={positionTasksData} />
      </AppSection>
      <AppSection
        title={copy.setupSteps.roster.title}
        description={copy.setupSteps.roster.description}
        headerHint={copy.setupSteps.roster.hint}
      >
        <AppEmptyState
          title={copy.rosterPlaceholderTitle}
          description={copy.rosterPlaceholderDescription}
        />
      </AppSection>
    </>
  );
}
