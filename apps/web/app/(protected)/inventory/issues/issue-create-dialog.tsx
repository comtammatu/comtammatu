"use client";

import { useMemo } from "react";
import { FormDialog, SelectField, TextareaField } from "@/components/form";
import {
  ACTIONS_VI,
  BRANCH_VI,
  FORM_VI,
  INVENTORY_VI,
} from "@comtammatu/shared/messages";
import type { IssueBranchOption } from "./issue-list-types";
import {
  createIssueSchema,
  issueTypeLabel,
  labelBranchExportPrefix,
  labelBranchExportSuffix,
  type CreateIssueValues,
} from "./issue-list-helpers";

type IssueTypeOption = {
  value: string;
  label: string;
};

export function IssueCreateDialog({
  open,
  onOpenChange,
  branches,
  defaultBranchId,
  defaultIssueType,
  onSubmit,
  allowedCreateIssueTypes,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branches: IssueBranchOption[];
  defaultBranchId: number | null;
  defaultIssueType: string;
  onSubmit: (values: CreateIssueValues) => Promise<{ success: boolean }>;
  allowedCreateIssueTypes: readonly IssueTypeOption[];
}) {
  const defaultValues = useMemo<CreateIssueValues>(
    () => ({
      branchId: defaultBranchId ? String(defaultBranchId) : "",
      issueType: defaultIssueType as CreateIssueValues["issueType"],
      notes: "",
    }),
    [defaultBranchId, defaultIssueType],
  );

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={INVENTORY_VI.manualConsumptionCreateAction}
      description={INVENTORY_VI.manualConsumptionCreateDescription}
      schema={createIssueSchema}
      defaultValues={defaultValues}
      entityKey={defaultBranchId ?? "new-issue"}
      onSubmit={onSubmit}
      successMessage={INVENTORY_VI.issueCreated}
      submitLabel={INVENTORY_VI.manualConsumptionCreateAction}
      cancelLabel={ACTIONS_VI.cancel}
    >
      {(form) => {
        const selectedBranchId = form.watch("branchId");
        const selectedBranch =
          branches.find((branch) => branch.id === Number(selectedBranchId)) ??
          null;
        const selectedKind = selectedBranch?.branchKind ?? null;
        return (
          <>
            <SelectField
              control={form.control}
              name="branchId"
              label={`${BRANCH_VI.long}${labelBranchExportSuffix}`}
              placeholder={BRANCH_VI.select}
              options={branches.map((branch) => ({
                value: String(branch.id),
                label: branch.name,
              }))}
              required
            />
            {selectedBranch ? (
              <p className="text-xs text-muted-foreground">
                {`${BRANCH_VI.long}${labelBranchExportPrefix}`}
                <span className="font-medium text-foreground">
                  {selectedBranch.name}
                </span>
              </p>
            ) : null}
            <SelectField
              control={form.control}
              name="issueType"
              label={INVENTORY_VI.issueTypeLabel}
              options={allowedCreateIssueTypes.map((option) => ({
                value: option.value,
                label:
                  option.value === "consumption"
                    ? issueTypeLabel("consumption", selectedKind)
                    : option.label,
              }))}
              required
            />
            <TextareaField
              control={form.control}
              name="notes"
              label={FORM_VI.notes}
              rows={3}
              placeholder={INVENTORY_VI.issueNotesPlaceholder}
            />
          </>
        );
      }}
    </FormDialog>
  );
}
