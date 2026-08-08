"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "@comtammatu/ui/components/sonner";
import { Button } from "@comtammatu/ui/components/button";
import { AppDialog } from "@/components/form";
import { messages } from "@lib/messages";
import { EmployeeTaskOverrideDialog } from "@/(protected)/hr/position-tasks-client";
import type { PositionTasksData } from "@/(protected)/hr/position-tasks-actions";
import {
  clearBranchEmployeeShiftTaskOverride,
  loadBranchEmployeeShiftTasks,
  saveBranchEmployeeShiftTaskOverride,
} from "./employee-tasks-actions";

const copy = messages.hr.client.positionTasks;
const detailCopy = messages.operator.teamBoard.memberDetail;

export function BranchEmployeeTasksSheet({
  branchId,
  employeeId,
  open,
  onOpenChange,
  onSaved,
}: {
  branchId: number;
  employeeId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}) {
  const [data, setData] = useState<PositionTasksData | null>(null);
  const [hasOverride, setHasOverride] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [clearOpen, setClearOpen] = useState(false);
  const [isLoading, startLoading] = useTransition();
  const [isClearing, startClearing] = useTransition();

  useEffect(() => {
    if (!open || employeeId == null) {
      setData(null);
      setHasOverride(false);
      setLoadError(null);
      setClearOpen(false);
      return;
    }

    startLoading(async () => {
      const result = await loadBranchEmployeeShiftTasks({
        branchId,
        employeeId,
      });
      if (!result.success || !result.data) {
        setData(null);
        setHasOverride(false);
        setLoadError(result.error ?? copy.loadFailed);
        return;
      }
      const { hasOverride: overrideFlag, ...payload } = result.data;
      setData(payload);
      setHasOverride(overrideFlag);
      setLoadError(null);
    });
  }, [branchId, employeeId, open]);

  const showEditor = open && data != null && employeeId != null && !clearOpen;
  const showLoading = open && data == null && loadError == null;
  const showError = open && data == null && loadError != null;

  return (
    <>
      {showEditor ? (
        <EmployeeTaskOverrideDialog
          employeeId={employeeId}
          open={showEditor}
          onOpenChange={(next) => {
            if (!next) onOpenChange(false);
          }}
          data={data}
          onSaved={() => {
            onSaved?.();
            onOpenChange(false);
          }}
          onClear={hasOverride ? () => setClearOpen(true) : undefined}
          saveOverride={async ({ employeeId: id, tasks }) =>
            saveBranchEmployeeShiftTaskOverride({
              branchId,
              employeeId: id,
              tasks,
            })
          }
        />
      ) : null}

      <AppDialog
        open={showLoading || showError}
        onOpenChange={(next) => {
          if (!next) onOpenChange(false);
        }}
        title={copy.title}
        description={
          showError
            ? loadError
            : isLoading
              ? detailCopy.shiftTasksLoading
              : copy.loadFailed
        }
        footer={
          showError ? (
            <div className="flex justify-end">
              <Button
                type="button"
                variant="outline"
                size="touch"
                onClick={() => onOpenChange(false)}
              >
                {copy.cancel}
              </Button>
            </div>
          ) : null
        }
      />

      <AppDialog
        open={clearOpen}
        onOpenChange={(next) => {
          setClearOpen(next);
          if (!next && open) {
            // Return to editor after dismissing clear confirm without deleting.
          }
        }}
        title={copy.clearEmployeeTemplateTitle}
        description={copy.clearEmployeeTemplateDescription}
        footer={
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="touch"
              disabled={isClearing}
              onClick={() => setClearOpen(false)}
            >
              {copy.cancel}
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="touch"
              disabled={isClearing || employeeId == null}
              onClick={() => {
                if (employeeId == null) return;
                startClearing(async () => {
                  const result = await clearBranchEmployeeShiftTaskOverride({
                    branchId,
                    employeeId,
                  });
                  if (!result.success) {
                    toast.error(result.error ?? copy.saveFailed);
                    return;
                  }
                  toast.success(copy.clearEmployeeTemplateSuccess);
                  setClearOpen(false);
                  onSaved?.();
                  onOpenChange(false);
                });
              }}
            >
              {copy.clearEmployeeTemplate}
            </Button>
          </div>
        }
      />
    </>
  );
}
