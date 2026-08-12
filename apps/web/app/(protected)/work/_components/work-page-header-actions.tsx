"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@comtammatu/ui/components/button";
import { useFormControlSize } from "@/components/form/control-size";
import { workCopy } from "@lib/messages/work";
import type {
  WorkDepartmentOption,
  WorkProjectOption,
} from "../actions";
import { WorkSettingsDialog } from "./work-settings-dialog";

export function WorkPageHeaderActions({
  canManage,
  departments,
  projects,
  children,
}: {
  canManage: boolean;
  departments: WorkDepartmentOption[];
  projects: WorkProjectOption[];
  children: ReactNode;
}) {
  const controlSize = useFormControlSize();
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {canManage ? (
          <Button
            type="button"
            variant="outline"
            size={controlSize}
            onClick={() => setSettingsOpen(true)}
          >
            {workCopy.settingsOpen}
          </Button>
        ) : null}
        {children}
      </div>
      {canManage ? (
        <WorkSettingsDialog
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          departments={departments}
          projects={projects}
        />
      ) : null}
    </>
  );
}
