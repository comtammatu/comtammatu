import Link from "next/link";
import { Button } from "@comtammatu/ui/components/button";
import { AppPage, AppPageHeader } from "@/components/surface";
import { messages } from "@lib/messages";
import { fetchShifts } from "../actions";
import {
  fetchPositionTasksData,
  type PositionTasksData,
} from "../position-tasks-actions";
import type { ShiftRow } from "../_types";
import { HrSetupClient } from "./setup-client";

const EMPTY_POSITION_TASKS_DATA: PositionTasksData = {
  positions: [],
  ingredients: [],
  tasksByPosition: {},
};

export default async function HrSetupPage() {
  const [shiftsResult, positionTasksResult] = await Promise.all([
    fetchShifts(),
    fetchPositionTasksData(),
  ]);
  const shifts = shiftsResult.success
    ? ((shiftsResult.data as ShiftRow[]) ?? [])
    : [];
  const positionTasksData =
    (positionTasksResult.success ? positionTasksResult.data : null) ??
    EMPTY_POSITION_TASKS_DATA;
  const copy = messages.hr.client;

  return (
    <AppPage width="xwide">
      <AppPageHeader
        eyebrow={messages.hr.workspace.eyebrow}
        title={copy.tabs.setup}
        description={copy.setupDescription}
        actions={
          <Button variant="outline" size="sm" render={<Link href="/hr" />}>
            {messages.hr.payroll.backToHr}
          </Button>
        }
      />
      <HrSetupClient
        initialShifts={shifts}
        positionTasksData={positionTasksData}
      />
    </AppPage>
  );
}
