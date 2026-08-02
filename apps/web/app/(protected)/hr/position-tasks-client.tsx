"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  ChevronRight as IconChevronRight,
  ClipboardList as IconClipboardList,
  Plus as IconPlus,
  Trash2 as IconTrash,
  X as IconX,
} from "lucide-react";
import {
  Controller,
  useFieldArray,
  type Control,
  type UseFormReturn,
} from "react-hook-form";
import { z } from "zod";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Frame } from "@comtammatu/ui/components/frame";
import { Label } from "@comtammatu/ui/components/label";
import { Switch } from "@comtammatu/ui/components/switch";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { InteractiveCard } from "@/components/data-table/interactive-card";
import {
  FormDialog,
  AppDialog,
  MultiSelectCombobox,
  SelectField,
  TextareaField,
  TextField,
} from "@/components/form";
import { matchesSearch } from "@lib/search";
import { messages } from "@lib/messages";
import { toast } from "@comtammatu/ui/components/sonner";
import {
  clearEmployeeShiftTaskOverride,
  fetchPositionTasksData,
  saveEmployeeShiftTaskOverride,
  savePositionTasks,
  type PositionTasksData,
} from "./position-tasks-actions";
import {
  POSITION_TASK_KINDS,
  POSITION_TASK_PHASES,
  type PositionOption,
  type PositionTaskIngredientOption,
  type PositionTaskRow,
  type ShiftTaskTemplateSummary,
} from "./position-task-types";
import { matchesHrBranchScope, resolveHrBranchScope } from "@/lib/hr-scope";

const copy = messages.hr.client.positionTasks;

const taskRowSchema = z.object({
  title: z.string().trim().min(1, { error: copy.needTitle }).max(120),
  kind: z.enum(POSITION_TASK_KINDS),
  applicability: z.literal("every_shift"),
  phase: z.enum(POSITION_TASK_PHASES),
  isRequired: z.boolean(),
  doneDefinition: z.string().max(240),
  ingredientIds: z.array(z.number().int().positive()),
});

const formSchema = z.object({
  employeeId: z.string().optional(),
  tasks: z.array(taskRowSchema).max(40),
});

type FormValues = z.infer<typeof formSchema>;
type TaskRowValues = z.infer<typeof taskRowSchema>;
type PositionTasksForm = UseFormReturn<FormValues, unknown, FormValues>;

const EMPTY_TASK: TaskRowValues = {
  title: "",
  kind: "standard",
  applicability: "every_shift",
  phase: "start_of_shift",
  isRequired: true,
  doneDefinition: "",
  ingredientIds: [],
};

function toFormValues(tasks: PositionTaskRow[], employeeId = ""): FormValues {
  return {
    employeeId,
    tasks: tasks.map((task) => ({
      title: task.title,
      kind: task.kind,
      applicability: "every_shift",
      phase: task.phase,
      isRequired: task.isRequired,
      doneDefinition: task.doneDefinition,
      ingredientIds: task.ingredientIds,
    })),
  };
}

function IngredientPicker({
  control,
  index,
  ingredients,
}: {
  control: Control<FormValues>;
  index: number;
  ingredients: PositionTaskIngredientOption[];
}) {
  const ingredientById = useMemo(
    () => new Map(ingredients.map((ingredient) => [ingredient.id, ingredient])),
    [ingredients],
  );

  return (
    <Controller
      control={control}
      name={`tasks.${index}.ingredientIds`}
      render={({ field }) => {
        const selected = field.value ?? [];
        const selectedSet = new Set(selected);
        return (
          <Frame className="flex flex-col gap-2 bg-muted/30 p-3">
            <p className="text-sm font-medium">{copy.ingredientsLabel}</p>
            <p className="text-xs text-muted-foreground">
              {copy.ingredientsHint}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {selected.length === 0 ? (
                <span className="text-xs text-muted-foreground">
                  {copy.empty}
                </span>
              ) : (
                selected.map((id) => {
                  const ingredient = ingredientById.get(id);
                  return (
                    <Badge key={id} variant="secondary" className="gap-1">
                      {ingredient?.name ?? id}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label={copy.removeIngredient}
                        className="-mr-1 ml-0.5 size-5"
                        onClick={() =>
                          field.onChange(
                            selected.filter((value) => value !== id),
                          )
                        }
                      >
                        <IconX />
                      </Button>
                    </Badge>
                  );
                })
              )}
            </div>
            <MultiSelectCombobox
              options={ingredients.map((ingredient) => ({
                value: String(ingredient.id),
                label: ingredient.name,
                hint: ingredient.unit,
                alreadySelected: selectedSet.has(ingredient.id),
              }))}
              onConfirm={(values) =>
                field.onChange(
                  Array.from(
                    new Set([
                      ...selected,
                      ...values.map((value) => Number(value)),
                    ]),
                  ),
                )
              }
              triggerLabel={copy.addIngredients}
              confirmLabel={copy.addIngredientsConfirm}
              searchPlaceholder={copy.ingredientSearch}
              triggerClassName="w-full"
            />
          </Frame>
        );
      }}
    />
  );
}

function TaskRow({
  control,
  index,
  ingredients,
  onRemove,
  watchedKind,
}: {
  control: Control<FormValues>;
  index: number;
  ingredients: PositionTaskIngredientOption[];
  onRemove: () => void;
  watchedKind: string;
}) {
  return (
    <Frame className="flex flex-col gap-3 p-3">
      <div className="grid gap-3 lg:grid-cols-[1fr_170px_150px_auto]">
        <TextField
          control={control}
          name={`tasks.${index}.title`}
          label={copy.titleLabel}
          id={`task-title-${index}`}
          placeholder={copy.titlePlaceholder}
        />
        <SelectField
          control={control}
          name={`tasks.${index}.kind`}
          label={copy.kindLabel}
          id={`task-kind-${index}`}
          options={POSITION_TASK_KINDS.map((kind) => ({
            value: kind,
            label: copy.kindLabels[kind],
          }))}
        />
        <SelectField
          control={control}
          name={`tasks.${index}.phase`}
          label={copy.phaseLabel}
          id={`task-phase-${index}`}
          options={POSITION_TASK_PHASES.map((value) => ({
            value,
            label: copy.phaseLabels[value],
          }))}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="self-end"
          onClick={onRemove}
          aria-label={copy.removeTask}
        >
          <IconTrash />
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <TextareaField
          control={control}
          name={`tasks.${index}.doneDefinition`}
          label={copy.doneDefinitionLabel}
          id={`task-done-${index}`}
          placeholder={copy.doneDefinitionPlaceholder}
          className="min-h-16"
        />
        <Controller
          control={control}
          name={`tasks.${index}.isRequired`}
          render={({ field }) => (
            <div className="flex items-center gap-2 pb-2">
              <Switch
                id={`task-required-${index}`}
                checked={field.value}
                onCheckedChange={(value) => field.onChange(value === true)}
              />
              <Label
                htmlFor={`task-required-${index}`}
                className="text-sm font-normal"
              >
                {copy.requiredLabel}
              </Label>
            </div>
          )}
        />
      </div>
      {watchedKind === "consumption_report" ? (
        <IngredientPicker
          control={control}
          index={index}
          ingredients={ingredients}
        />
      ) : null}
    </Frame>
  );
}

function PositionTaskFields({
  form,
  ingredients,
}: {
  form: PositionTasksForm;
  ingredients: PositionTaskIngredientOption[];
}) {
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "tasks",
  });
  const watchedTasks = form.watch("tasks");

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">{copy.taskListLabel}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => append(EMPTY_TASK)}
        >
          <IconPlus data-icon="inline-start" />
          {copy.addTask}
        </Button>
      </div>
      {fields.length === 0 ? (
        <p className="text-sm text-muted-foreground">{copy.empty}</p>
      ) : (
        fields.map((row, index) => (
          <TaskRow
            key={row.id}
            control={form.control}
            index={index}
            ingredients={ingredients}
            watchedKind={watchedTasks[index]?.kind ?? "standard"}
            onRemove={() => remove(index)}
          />
        ))
      )}
    </div>
  );
}

function AssigneeSummary({ position }: { position: PositionOption }) {
  const visible = position.assignees.slice(0, 2);
  const remaining = position.assignees.length - visible.length;

  return (
    <div className="flex flex-col gap-1">
      <span className="font-medium">{position.label}</span>
      <span className="text-muted-foreground">
        {visible.length > 0
          ? `${visible.map((assignee) => assignee.name).join(", ")}${
              remaining > 0 ? ` +${remaining}` : ""
            }`
          : copy.noAssignees}
      </span>
    </div>
  );
}

type TemplateRow = ShiftTaskTemplateSummary & { key: string };

export function EmployeeTaskOverrideDialog({
  employeeId,
  open,
  onOpenChange,
  data,
  onSaved,
}: {
  employeeId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: PositionTasksData;
  onSaved?: () => void;
}) {
  const employee =
    data.employees.find((item) => item.id === employeeId) ?? null;
  const template =
    data.employeeTemplates.find((item) => item.employeeId === employeeId) ??
    null;
  const inheritedTasks =
    employee?.positionId == null
      ? []
      : (data.tasksByPosition[employee.positionId] ?? []);
  const defaultValues = useMemo(
    () => toFormValues(template?.tasks ?? inheritedTasks),
    [inheritedTasks, template?.tasks],
  );

  async function handleSubmit(values: FormValues) {
    if (!employee) return { success: false, error: copy.employeePlaceholder };
    const result = await saveEmployeeShiftTaskOverride({
      employeeId: employee.id,
      tasks: values.tasks.map((task) => ({
        ...task,
        title: task.title.trim(),
        doneDefinition: task.doneDefinition.trim(),
        ingredientIds:
          task.kind === "consumption_report" ? task.ingredientIds : [],
      })),
    });
    if (result.success) onSaved?.();
    return result;
  }

  return (
    <FormDialog
      open={open && employee != null}
      onOpenChange={onOpenChange}
      title={
        employee ? copy.templateName(employee.name) : copy.employeeTemplate
      }
      description={`${template ? copy.employeeTemplate : copy.positionTemplate} · ${employee?.positionLabel ?? copy.noAssignees}`}
      schema={formSchema}
      defaultValues={defaultValues}
      entityKey={`${employeeId ?? "none"}:${template?.templateId ?? "inherited"}`}
      onSubmit={handleSubmit}
      successMessage={copy.saved}
      submitLabel={template ? copy.save : copy.createEmployeeTemplate}
      contentClassName="sm:max-w-4xl"
    >
      {(form) => (
        <PositionTaskFields form={form} ingredients={data.ingredients} />
      )}
    </FormDialog>
  );
}

function EmployeeOverrideFields({
  form,
  data,
}: {
  form: PositionTasksForm;
  data: PositionTasksData;
}) {
  const employeeId = form.watch("employeeId");
  const previousEmployeeId = useRef(employeeId);

  useEffect(() => {
    if (!employeeId || employeeId === previousEmployeeId.current) return;
    previousEmployeeId.current = employeeId;
    const employee = data.employees.find(
      (candidate) => candidate.id === Number(employeeId),
    );
    form.setValue(
      "tasks",
      employee?.positionId == null
        ? []
        : toFormValues(data.tasksByPosition[employee.positionId] ?? []).tasks,
    );
  }, [data.employees, data.tasksByPosition, employeeId, form]);

  const overriddenIds = new Set(
    data.employeeTemplates.map((template) => template.employeeId),
  );
  return (
    <>
      <SelectField
        control={form.control}
        name="employeeId"
        label={copy.employeeLabel}
        placeholder={copy.employeePlaceholder}
        options={data.employees
          .filter((employee) => !overriddenIds.has(employee.id))
          .map((employee) => ({
            value: String(employee.id),
            label: employee.name,
            hint: [employee.positionLabel, employee.branchName]
              .filter(Boolean)
              .join(" · "),
          }))}
        required
      />
      <PositionTaskFields form={form} ingredients={data.ingredients} />
    </>
  );
}

interface PositionTasksClientProps {
  initialData: PositionTasksData;
  initialBranchFilter?: string;
}

export function PositionTasksClient({
  initialData,
  initialBranchFilter,
}: PositionTasksClientProps) {
  const [data, setData] = useState(initialData);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({
    type: "",
    status: "",
  });
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [clearingRow, setClearingRow] = useState<TemplateRow | null>(null);
  const [isClearing, startClearing] = useTransition();
  const branchScope = resolveHrBranchScope(initialBranchFilter);
  const scopedEmployees = data.employees.filter((employee) =>
    matchesHrBranchScope(employee.branchId, branchScope),
  );
  const scopedPositions = data.positions.map((position) => ({
    ...position,
    assignees: position.assignees.filter((employee) =>
      matchesHrBranchScope(employee.branchId, branchScope),
    ),
  }));
  const employeeById = new Map(
    scopedEmployees.map((employee) => [employee.id, employee]),
  );
  const rows: TemplateRow[] = [
    ...scopedPositions.map((position) => ({
      kind: "position" as const,
      key: `position:${position.id}`,
      positionId: position.id,
      assignees: position.assignees,
    })),
    ...data.employeeTemplates.flatMap((template): TemplateRow[] => {
      const employee = employeeById.get(template.employeeId);
      return employee
        ? [
            {
              kind: "employee",
              key: `employee:${employee.id}`,
              templateId: template.templateId,
              employee,
            },
          ]
        : [];
    }),
  ];
  const editingRow = rows.find((row) => row.key === editingKey) ?? null;
  const editingPosition =
    editingRow?.kind === "position"
      ? (scopedPositions.find(
          (position) => position.id === editingRow.positionId,
        ) ?? null)
      : null;
  const editingEmployee =
    editingRow?.kind === "employee" ? editingRow.employee : null;
  const editingTasks = editingPosition
    ? (data.tasksByPosition[editingPosition.id] ?? [])
    : editingEmployee
      ? (data.employeeTemplates.find(
          (template) => template.employeeId === editingEmployee.id,
        )?.tasks ?? [])
      : [];
  const defaultValues = useMemo(
    () => toFormValues(editingTasks),
    [editingTasks],
  );
  const visibleRows = rows.filter((row) => {
    const position =
      row.kind === "position"
        ? scopedPositions.find((item) => item.id === row.positionId)
        : null;
    const tasks =
      row.kind === "position"
        ? (data.tasksByPosition[row.positionId] ?? [])
        : (data.employeeTemplates.find(
            (template) => template.templateId === row.templateId,
          )?.tasks ?? []);
    const employees = row.kind === "position" ? row.assignees : [row.employee];
    const configured = row.kind === "employee" || tasks.length > 0;
    return (
      (!filters.type || filters.type === row.kind) &&
      (!filters.status ||
        (filters.status === "configured" ? configured : !configured)) &&
      matchesSearch(
        [
          position?.label,
          ...employees.map((employee) => employee.name),
          ...tasks.map((task) => task.title),
        ],
        search,
      )
    );
  });

  async function refreshData() {
    const refreshed = await fetchPositionTasksData();
    if (refreshed.success && refreshed.data) setData(refreshed.data);
  }

  async function handleSubmit(values: FormValues) {
    if (!editingRow) return { success: false, error: copy.emptyPosition };
    const tasks = values.tasks.map((task) => ({
      title: task.title.trim(),
      kind: task.kind,
      applicability: task.applicability,
      phase: task.phase,
      isRequired: task.isRequired,
      doneDefinition: task.doneDefinition.trim(),
      ingredientIds:
        task.kind === "consumption_report" ? task.ingredientIds : [],
    }));
    const result =
      editingRow.kind === "position"
        ? await savePositionTasks({ positionId: editingRow.positionId, tasks })
        : await saveEmployeeShiftTaskOverride({
            employeeId: editingRow.employee.id,
            tasks,
          });
    if (!result.success) return result;
    await refreshData();
    return result;
  }

  async function handleCreate(values: FormValues) {
    const employeeId = Number(values.employeeId);
    if (!Number.isInteger(employeeId) || employeeId <= 0) {
      return { success: false, error: copy.employeePlaceholder };
    }
    const result = await saveEmployeeShiftTaskOverride({
      employeeId,
      tasks: values.tasks.map((task) => ({
        ...task,
        title: task.title.trim(),
        doneDefinition: task.doneDefinition.trim(),
        ingredientIds:
          task.kind === "consumption_report" ? task.ingredientIds : [],
      })),
    });
    if (result.success) await refreshData();
    return result;
  }

  function handleClear() {
    if (clearingRow?.kind !== "employee") return;
    startClearing(async () => {
      const result = await clearEmployeeShiftTaskOverride({
        employeeId: clearingRow.employee.id,
      });
      if (!result.success) {
        toast.error(result.error ?? copy.saveFailed);
        return;
      }
      setClearingRow(null);
      await refreshData();
      toast.success(copy.clearEmployeeTemplateSuccess);
    });
  }

  const columns: DataTableColumn<TemplateRow>[] = [
    {
      key: "name",
      header: copy.templateHeader,
      render: (row) => {
        const name =
          row.kind === "position"
            ? scopedPositions.find((position) => position.id === row.positionId)
                ?.label
            : row.employee.name;
        return (
          <span className="font-medium">{copy.templateName(name ?? "—")}</span>
        );
      },
    },
    {
      key: "type",
      header: copy.templateTypeHeader,
      render: (row) => (
        <Badge variant="secondary">
          {row.kind === "position"
            ? copy.positionTemplate
            : copy.employeeTemplate}
        </Badge>
      ),
    },
    {
      key: "tasks",
      header: copy.taskCountHeader,
      render: (row) =>
        copy.taskSummary(
          row.kind === "position"
            ? (data.tasksByPosition[row.positionId]?.length ?? 0)
            : (data.employeeTemplates.find(
                (template) => template.templateId === row.templateId,
              )?.tasks.length ?? 0),
        ),
    },
    {
      key: "assignees",
      header: copy.assigneesHeader,
      render: (row) =>
        row.kind === "position" ? (
          <AssigneeSummary
            position={scopedPositions.find(
              (position) => position.id === row.positionId,
            )!}
          />
        ) : (
          <div className="flex flex-col gap-1">
            <span className="font-medium">{row.employee.name}</span>
            <span className="text-muted-foreground">
              {[row.employee.positionLabel, row.employee.branchName]
                .filter(Boolean)
                .join(" · ") || copy.noAssignees}
            </span>
          </div>
        ),
    },
    {
      key: "status",
      header: copy.statusHeader,
      render: (row) => {
        const configured =
          row.kind === "employee" ||
          (data.tasksByPosition[row.positionId]?.length ?? 0) > 0;
        return (
          <Badge variant={configured ? "success" : "outline"}>
            {configured ? copy.configured : copy.notConfigured}
          </Badge>
        );
      },
    },
    {
      key: "actions",
      header: <span className="sr-only">{copy.editTemplate}</span>,
      className: "w-24",
      render: (row) => (
        <div className="flex justify-end gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={(event) => {
              event.stopPropagation();
              setEditingKey(row.key);
            }}
          >
            {copy.editTemplate}
          </Button>
          {row.kind === "employee" ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={copy.clearEmployeeTemplate}
              onClick={(event) => {
                event.stopPropagation();
                setClearingRow(row);
              }}
            >
              <IconTrash />
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  const availableEmployees = scopedEmployees.filter(
    (employee) =>
      !data.employeeTemplates.some(
        (template) => template.employeeId === employee.id,
      ),
  );
  const firstEmployee = availableEmployees[0];
  const createDefaultValues = toFormValues(
    firstEmployee?.positionId == null
      ? []
      : (data.tasksByPosition[firstEmployee.positionId] ?? []),
    firstEmployee ? String(firstEmployee.id) : "",
  );

  return (
    <>
      <p className="text-sm text-muted-foreground">
        {copy.templatesSummary(rows.length)}
      </p>
      <DataTable
        columns={columns}
        data={visibleRows}
        getRowKey={(row) => row.key}
        searchable
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder={copy.searchPlaceholder}
        filters={[
          {
            key: "type",
            placeholder: copy.allTemplateTypes,
            options: [
              { value: "position", label: copy.positionTemplate },
              { value: "employee", label: copy.employeeTemplate },
            ],
          },
          {
            key: "status",
            placeholder: copy.allTemplateStatuses,
            options: [
              { value: "configured", label: copy.configured },
              { value: "not-configured", label: copy.notConfigured },
            ],
          },
        ]}
        filterValues={filters}
        onFilterChange={(key, value) =>
          setFilters((current) => ({ ...current, [key]: value }))
        }
        actions={
          <Button
            type="button"
            size="touch"
            disabled={availableEmployees.length === 0}
            onClick={() => setCreateOpen(true)}
          >
            <IconPlus data-icon="inline-start" />
            {copy.createEmployeeTemplate}
          </Button>
        }
        emptyMode={rows.length === 0 ? "no-data" : "no-results"}
        emptyTitle={
          rows.length === 0 ? copy.emptyTemplatesTitle : copy.noResultsTitle
        }
        emptyDescription={copy.emptyTemplatesDescription}
        emptyIcon={<IconClipboardList />}
        onRowClick={(row) => setEditingKey(row.key)}
        getRowAriaLabel={() => copy.editTemplate}
        mobileCardRender={(row) => {
          const position =
            row.kind === "position"
              ? scopedPositions.find((item) => item.id === row.positionId)
              : null;
          const name =
            position?.label ??
            (row.kind === "employee" ? row.employee.name : "—");
          const taskCount =
            row.kind === "position"
              ? (data.tasksByPosition[row.positionId]?.length ?? 0)
              : (data.employeeTemplates.find(
                  (template) => template.templateId === row.templateId,
                )?.tasks.length ?? 0);
          const assigneeCount =
            row.kind === "position" ? row.assignees.length : 1;
          return (
            <InteractiveCard
              render={
                <button type="button" aria-label={copy.openTemplate(name)} />
              }
              minHeight="mobile"
              onClick={() => setEditingKey(row.key)}
            >
              <div className="flex min-w-0 flex-1 flex-col gap-2 text-left">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{copy.templateName(name)}</span>
                  <Badge variant="secondary">
                    {row.kind === "position"
                      ? copy.positionTemplate
                      : copy.employeeTemplate}
                  </Badge>
                </div>
                <span className="text-xs text-muted-foreground">
                  {copy.taskSummary(taskCount)} ·{" "}
                  {copy.assigneeSummary(assigneeCount)}
                </span>
              </div>
              <IconChevronRight className="size-4 shrink-0" aria-hidden />
            </InteractiveCard>
          );
        }}
      />

      <FormDialog
        open={editingRow != null}
        onOpenChange={(open) => {
          if (!open) setEditingKey(null);
        }}
        title={
          editingRow
            ? copy.templateName(
                editingPosition?.label ?? editingEmployee?.name ?? "—",
              )
            : copy.title
        }
        description={
          editingPosition
            ? copy.templateDescription(
                editingPosition.label,
                editingPosition.assignees.length,
              )
            : editingEmployee
              ? `${copy.employeeTemplate} · ${editingEmployee.positionLabel ?? copy.noAssignees}`
              : undefined
        }
        schema={formSchema}
        defaultValues={defaultValues}
        entityKey={editingRow?.key}
        onSubmit={handleSubmit}
        successMessage={copy.saved}
        submitLabel={copy.save}
        contentClassName="sm:max-w-4xl"
      >
        {(form) => (
          <PositionTaskFields form={form} ingredients={data.ingredients} />
        )}
      </FormDialog>

      <FormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title={copy.createEmployeeTemplate}
        description={copy.createEmployeeTemplateDescription}
        schema={formSchema}
        defaultValues={createDefaultValues}
        entityKey={firstEmployee?.id}
        onSubmit={handleCreate}
        successMessage={copy.saved}
        submitLabel={copy.createEmployeeTemplate}
        contentClassName="sm:max-w-4xl"
      >
        {(form) => (
          <EmployeeOverrideFields
            form={form}
            data={{
              ...data,
              employees: scopedEmployees,
              positions: scopedPositions,
            }}
          />
        )}
      </FormDialog>

      <AppDialog
        open={clearingRow != null}
        onOpenChange={(open) => {
          if (!open) setClearingRow(null);
        }}
        title={copy.clearEmployeeTemplateTitle}
        description={copy.clearEmployeeTemplateDescription}
        footer={
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setClearingRow(null)}
            >
              {copy.cancel}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isClearing}
              onClick={handleClear}
            >
              {copy.clearEmployeeTemplate}
            </Button>
          </div>
        }
      />
    </>
  );
}
