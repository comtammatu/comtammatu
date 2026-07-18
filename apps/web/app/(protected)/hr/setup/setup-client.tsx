"use client";

import { useState } from "react";
import { AppSection } from "@/components/surface";
import { messages } from "@lib/messages";
import { PositionTasksClient } from "../position-tasks-client";
import type { PositionTasksData } from "../position-tasks-actions";
import { ShiftsTable } from "../shifts-table";
import type { ShiftRow } from "../_types";

interface Props {
  initialShifts: ShiftRow[];
  positionTasksData: PositionTasksData;
}

export function HrSetupClient({ initialShifts, positionTasksData }: Props) {
  const [shifts, setShifts] = useState(initialShifts);
  const copy = messages.hr.client;

  return (
    <>
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
        title={copy.positionTasks.title}
        description={copy.positionTasks.description}
        headerHint={copy.positionTasks.hint}
      >
        <PositionTasksClient initialData={positionTasksData} />
      </AppSection>
    </>
  );
}
