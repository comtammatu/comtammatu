"use client";

import {
  cloneElement,
  isValidElement,
  useEffect,
  useMemo,
  useState,
  type MouseEventHandler,
  type ReactElement,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { X as IconX } from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Label } from "@comtammatu/ui/components/label";
import {
  AppFormGrid,
  AppFormRow,
  FormDialog,
  MultiSelectCombobox,
  SelectField,
  TextField,
  TextareaField,
} from "@/components/form";
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
  dueAt: z.string().optional(),
});

type CreateValues = z.infer<typeof createSchema>;

export function WorkCreateDialog({
  departments,
  membersByDepartment,
  defaultDepartmentId,
  params,
  trigger,
}: {
  departments: WorkDepartmentOption[];
  membersByDepartment: Record<number, WorkProfileOption[]>;
  defaultDepartmentId?: number | null;
  params: ParsedWorkParams;
  trigger?: ReactNode;
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
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [supporterIds, setSupporterIds] = useState<string[]>([]);

  const deptMembers = useMemo(() => {
    const dept = Number(departmentId);
    return membersByDepartment[dept] ?? [];
  }, [departmentId, membersByDepartment]);

  const memberMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of deptMembers) {
      map.set(m.id, m.fullName);
    }
    return map;
  }, [deptMembers]);

  const assigneeSet = useMemo(() => new Set(assigneeIds), [assigneeIds]);
  const supporterSet = useMemo(() => new Set(supporterIds), [supporterIds]);

  const assigneeCandidates = useMemo(() => {
    return deptMembers.filter((m) => !supporterSet.has(m.id));
  }, [deptMembers, supporterSet]);

  const supporterCandidates = useMemo(() => {
    return deptMembers.filter((m) => !assigneeSet.has(m.id));
  }, [deptMembers, assigneeSet]);

  if (departments.length === 0) return null;

  const triggerNode = trigger && isValidElement(trigger) ? (
    cloneElement(trigger as ReactElement<{ onClick?: MouseEventHandler }>, {
      onClick: (e: React.MouseEvent) => {
        (trigger.props as { onClick?: MouseEventHandler })?.onClick?.(e);
        setOpen(true);
      },
    })
  ) : trigger ? (
    <span onClick={() => setOpen(true)} className="contents">
      {trigger}
    </span>
  ) : (
    <Button size={controlSize} type="button" onClick={() => setOpen(true)}>
      {workCopy.createTask}
    </Button>
  );

  return (
    <>
      {triggerNode}
      <FormDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setAssigneeIds([]);
            setSupporterIds([]);
          }
        }}
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
            assigneeIds,
            supporterIds,
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
          setAssigneeIds([]);
          setSupporterIds([]);
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
          <AppFormGrid density="compact">
            <AppFormRow colSpan="full">
              <TextField
                control={form.control}
                name="title"
                label={workCopy.titleLabel}
              />
            </AppFormRow>
            <SelectField
              control={form.control}
              name="departmentId"
              label={workCopy.scopeDepartment}
              options={departments.map((department) => ({
                value: String(department.id),
                label: department.name,
              }))}
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

            {/* Multi-assignees */}
            <AppFormRow colSpan="full">
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground">
                  {workCopy.assignees}
                </Label>
                <div className="flex flex-wrap items-center gap-1.5 min-h-8">
                  {assigneeIds.length === 0 ? (
                    <span className="text-xs text-muted-foreground italic">
                      {workCopy.noAssignee}
                    </span>
                  ) : (
                    assigneeIds.map((id) => {
                      const name = memberMap.get(id) ?? id;
                      return (
                        <Badge key={id} variant="secondary" className="gap-1 pr-1 text-xs">
                          <span>{name}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            aria-label={`${workCopy.clearAssignee}: ${name}`}
                            className="-mr-1 ml-0.5 size-4"
                            onClick={() =>
                              setAssigneeIds((prev) =>
                                prev.filter((v) => v !== id),
                              )
                            }
                          >
                            <IconX className="size-3" />
                          </Button>
                        </Badge>
                      );
                    })
                  )}
                </div>
                <MultiSelectCombobox
                  options={assigneeCandidates.map((m) => ({
                    value: m.id,
                    label: m.fullName,
                    alreadySelected: assigneeSet.has(m.id),
                  }))}
                  triggerLabel={workCopy.addAssignee}
                  confirmLabel={(count) =>
                    count > 0
                      ? `${workCopy.addAssignee} (${count})`
                      : workCopy.addAssignee
                  }
                  searchPlaceholder={workCopy.teamAddSearchPlaceholder}
                  onConfirm={(values) =>
                    setAssigneeIds((prev) =>
                      Array.from(new Set([...prev, ...values])),
                    )
                  }
                />
              </div>
            </AppFormRow>

            {/* Multi-supporters */}
            <AppFormRow colSpan="full">
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground">
                  {workCopy.supporterLabel}
                </Label>
                <div className="flex flex-wrap items-center gap-1.5 min-h-8">
                  {supporterIds.length === 0 ? (
                    <span className="text-xs text-muted-foreground italic">
                      {workCopy.noSupporter}
                    </span>
                  ) : (
                    supporterIds.map((id) => {
                      const name = memberMap.get(id) ?? id;
                      return (
                        <Badge key={id} variant="secondary" className="gap-1 pr-1 text-xs">
                          <span>{name}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            aria-label={`${workCopy.clearSupporter}: ${name}`}
                            className="-mr-1 ml-0.5 size-4"
                            onClick={() =>
                              setSupporterIds((prev) =>
                                prev.filter((v) => v !== id),
                              )
                            }
                          >
                            <IconX className="size-3" />
                          </Button>
                        </Badge>
                      );
                    })
                  )}
                </div>
                <MultiSelectCombobox
                  options={supporterCandidates.map((m) => ({
                    value: m.id,
                    label: m.fullName,
                    alreadySelected: supporterSet.has(m.id),
                  }))}
                  triggerLabel={workCopy.addSupporter}
                  confirmLabel={(count) =>
                    count > 0
                      ? `${workCopy.addSupporter} (${count})`
                      : workCopy.addSupporter
                  }
                  searchPlaceholder={workCopy.teamAddSearchPlaceholder}
                  onConfirm={(values) =>
                    setSupporterIds((prev) =>
                      Array.from(new Set([...prev, ...values])),
                    )
                  }
                />
              </div>
            </AppFormRow>

            <TextField
              control={form.control}
              name="dueAt"
              label={workCopy.dueLabel}
              type="datetime-local"
            />
            <AppFormRow colSpan="full">
              <TextareaField
                control={form.control}
                name="description"
                label={workCopy.descriptionLabel}
                rows={3}
              />
            </AppFormRow>
            <DepartmentSync
              value={form.watch("departmentId")}
              onChange={(dept) => {
                setDepartmentId(dept);
                setAssigneeIds([]);
                setSupporterIds([]);
              }}
            />
          </AppFormGrid>
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
