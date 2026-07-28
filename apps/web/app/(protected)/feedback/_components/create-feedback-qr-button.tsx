"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import type { UseFormReturn } from "react-hook-form";
import { BRANCH_VI } from "@comtammatu/shared/messages";
import { Button } from "@comtammatu/ui/components/button";
import { FormDialog, SelectField, TextField } from "@/components/form";
import { createFeedbackQr } from "../actions";
import { feedbackCopy } from "@lib/messages/feedback";
import type { FeedbackQrTableOption } from "./qr-management";

const BRANCH_WIDE_TABLE = "branch";

const createQrFormSchema = z.object({
  branchId: z.string().regex(/^\d+$/),
  tableKey: z.string().min(1),
  label: z.string().trim().min(1).max(200),
});

type CreateQrFormValues = z.infer<typeof createQrFormSchema>;

export function CreateFeedbackQrButton({
  branchId,
  tables,
  lockBranch,
  branches = [],
}: {
  branchId: number;
  tables: FeedbackQrTableOption[];
  lockBranch: boolean;
  branches?: { id: number; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const defaultValues = useMemo<CreateQrFormValues>(
    () => ({
      branchId: String(branchId),
      tableKey: BRANCH_WIDE_TABLE,
      label: "",
    }),
    [branchId],
  );

  return (
    <>
      <Button type="button" size="touch" onClick={() => setOpen(true)}>
        {feedbackCopy.qrCreate}
      </Button>
      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title={feedbackCopy.qrCreate}
        schema={createQrFormSchema}
        defaultValues={defaultValues}
        entityKey={defaultValues.branchId}
        submitLabel={feedbackCopy.qrCreate}
        successMessage={feedbackCopy.toastCreateOk}
        onSuccess={() => router.refresh()}
        onSubmit={async (values) => {
          const parsedBranchId = Number(values.branchId);
          const tableId =
            values.tableKey === BRANCH_WIDE_TABLE
              ? null
              : Number(values.tableKey);
          return createFeedbackQr({
            branchId: parsedBranchId,
            tableId,
            label: values.label,
          });
        }}
      >
        {(form) => (
          <CreateFeedbackQrFields
            form={form}
            lockBranch={lockBranch}
            branches={branches}
            tables={tables}
          />
        )}
      </FormDialog>
    </>
  );
}

function CreateFeedbackQrFields({
  form,
  lockBranch,
  branches,
  tables,
}: {
  form: UseFormReturn<CreateQrFormValues>;
  lockBranch: boolean;
  branches: { id: number; name: string }[];
  tables: FeedbackQrTableOption[];
}) {
  const watchedBranchId = form.watch("branchId");
  const previousBranchIdRef = useRef(watchedBranchId);

  useEffect(() => {
    if (previousBranchIdRef.current === watchedBranchId) return;
    previousBranchIdRef.current = watchedBranchId;
    form.setValue("tableKey", BRANCH_WIDE_TABLE);
  }, [watchedBranchId, form]);

  const tableOptions = tables
    .filter((table) => String(table.branchId) === watchedBranchId)
    .map((table) => ({
      value: String(table.id),
      label: feedbackCopy.tableLabel.replace(
        "{number}",
        String(table.number),
      ),
    }));

  return (
    <div className="flex flex-col gap-4">
      {!lockBranch ? (
        <SelectField
          control={form.control}
          name="branchId"
          label={BRANCH_VI.long}
          required
          options={branches.map((branch) => ({
            value: String(branch.id),
            label: branch.name,
          }))}
        />
      ) : null}
      <TextField
        control={form.control}
        name="label"
        label={feedbackCopy.qrLabel}
        required
        placeholder={
          lockBranch
            ? feedbackCopy.placeholderBranchWide
            : feedbackCopy.placeholderWithTable
        }
      />
      <SelectField
        control={form.control}
        name="tableKey"
        label={feedbackCopy.qrTable}
        options={[
          {
            value: BRANCH_WIDE_TABLE,
            label: feedbackCopy.qrBranchWide,
          },
          ...tableOptions,
        ]}
      />
    </div>
  );
}
