"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { Button } from "@comtammatu/ui/components/button";
import { FormDialog, SelectField, TextField, TextareaField } from "@/components/form";
import { useFormControlSize } from "@/components/form/control-size";
import {
  WORK_TASK_PRIORITIES,
  workCopy,
} from "@lib/messages/work";
import {
  createWorkTask,
  type WorkDepartmentOption,
  type WorkProfileOption,
} from "../actions";
import { workHref, type ParsedWorkParams } from "../_lib/params";

const createSchema = z.object({
  departmentId: z.string().min(1),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(4000).optional(),
  priority: z.enum(WORK_TASK_PRIORITIES),
  assigneeId: z.string().optional(),
  dueAt: z.string().optional(),
});

type CreateValues = z.infer<typeof createSchema>;

export function WorkCreateDialog({
  departments,
  membersByDepartment,
  defaultDepartmentId,
  params,
}: {
  departments: WorkDepartmentOption[];
  membersByDepartment: Record<number, WorkProfileOption[]>;
  defaultDepartmentId?: number | null;
  params: ParsedWorkParams;
}) {
  const router = useRouter();
  const controlSize = useFormControlSize();
  const [open, setOpen] = useState(false);
  const [departmentId, setDepartmentId] = useState(
    defaultDepartmentId != null
      ? String(defaultDepartmentId)
      : departments[0]
        ? String(departments[0].id)
        : "",
  );

  const assigneeOptions = useMemo(() => {
    const dept = Number(departmentId);
    return (membersByDepartment[dept] ?? []).map((member) => ({
      value: member.id,
      label: member.fullName,
    }));
  }, [departmentId, membersByDepartment]);

  if (departments.length === 0) return null;

  return (
    <>
      <Button size={controlSize} type="button" onClick={() => setOpen(true)}>
        {workCopy.createTask}
      </Button>
      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title={workCopy.createTitle}
        schema={createSchema}
        defaultValues={{
          departmentId:
            defaultDepartmentId != null
              ? String(defaultDepartmentId)
              : String(departments[0]!.id),
          title: "",
          description: "",
          priority: "normal",
          assigneeId: "__none__",
          dueAt: "",
        }}
        entityKey={`${defaultDepartmentId ?? "d"}`}
        submitLabel={workCopy.createSubmit}
        successMessage={workCopy.createTask}
        onSubmit={async (values: CreateValues) => {
          const dueRaw = values.dueAt?.trim();
          const dueAt =
            dueRaw && dueRaw.length > 0
              ? new Date(dueRaw).toISOString()
              : undefined;
          const result = await createWorkTask({
            departmentId: Number(values.departmentId),
            title: values.title,
            description: values.description || undefined,
            priority: values.priority,
            assigneeId:
              values.assigneeId &&
              values.assigneeId.length > 0 &&
              values.assigneeId !== "__none__"
                ? values.assigneeId
                : undefined,
            dueAt,
          });
          if (!result.success || !result.data) {
            return {
              success: false,
              error: result.error ?? workCopy.createFailed,
            };
          }
          return { success: true, data: result.data };
        }}
        onSuccess={(result) => {
          setOpen(false);
          if (!result.success || result.data == null) {
            router.refresh();
            return;
          }
          const id = Number((result.data as { id?: unknown }).id);
          if (Number.isFinite(id) && id > 0) {
            router.push(workHref(params, { taskId: id }));
            return;
          }
          router.refresh();
        }}
      >
        {(form) => (
          <>
            <SelectField
              control={form.control}
              name="departmentId"
              label={workCopy.scopeDepartment}
              options={departments.map((department) => ({
                value: String(department.id),
                label: department.name,
              }))}
            />
            <TextField
              control={form.control}
              name="title"
              label={workCopy.titleLabel}
            />
            <TextareaField
              control={form.control}
              name="description"
              label={workCopy.descriptionLabel}
            />
            <SelectField
              control={form.control}
              name="priority"
              label={workCopy.priorityLabel}
              options={WORK_TASK_PRIORITIES.map((priority) => ({
                value: priority,
                label: workCopy.priorityLabels[priority],
              }))}
            />
            <SelectField
              control={form.control}
              name="assigneeId"
              label={workCopy.assignee}
              options={[
                { value: "__none__", label: workCopy.clearAssignee },
                ...assigneeOptions,
              ]}
            />
            <TextField
              control={form.control}
              name="dueAt"
              label={workCopy.dueLabel}
              type="datetime-local"
            />
            <DepartmentSync
              value={form.watch("departmentId")}
              onChange={setDepartmentId}
            />
          </>
        )}
      </FormDialog>
    </>
  );
}

function DepartmentSync({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  useEffect(() => {
    onChange(value);
  }, [value, onChange]);
  return null;
}
