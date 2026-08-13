"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Plus as IconPlus, Trash2 as IconTrash, X as IconX } from "lucide-react";
import { ACTIONS_VI } from "@comtammatu/shared/messages";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Field, FieldLabel } from "@comtammatu/ui/components/field";
import {
  Item,
  ItemContent,
  ItemGroup,
} from "@comtammatu/ui/components/item";
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { Switch } from "@comtammatu/ui/components/switch";
import { toast } from "@comtammatu/ui/components/sonner";
import { AppDialog, MultiSelectCombobox } from "@/components/form";
import { AppEmptyState, AppSheet } from "@/components/surface";
import { messages } from "@lib/messages";
import {
  POSITION_TASK_PHASES,
  type PositionTaskIngredientOption,
  type PositionTaskKind,
  type PositionTaskPhase,
  type PositionTaskRow,
} from "@/(protected)/hr/position-task-types";
import {
  clearBranchEmployeeShiftTaskOverride,
  loadBranchEmployeeShiftTasks,
  saveBranchEmployeeShiftTaskOverride,
} from "./employee-tasks-actions";

const copy = messages.hr.client.positionTasks;
const detailCopy = messages.operator.teamBoard.memberDetail;

type DraftTask = {
  key: string;
  title: string;
  kind: PositionTaskKind;
  applicability: "every_shift";
  phase: PositionTaskPhase;
  isRequired: boolean;
  allowsPhoto: boolean;
  doneDefinition: string;
  ingredientIds: number[];
};

let draftKeySeq = 0;

function nextDraftKey(): string {
  draftKeySeq += 1;
  return `task-${draftKeySeq}`;
}

function toDraftTasks(tasks: PositionTaskRow[]): DraftTask[] {
  return tasks.map((task) => ({
    key: nextDraftKey(),
    title: task.title,
    kind: task.kind,
    applicability: "every_shift",
    phase: task.phase,
    isRequired: task.isRequired,
    allowsPhoto: task.allowsPhoto,
    doneDefinition: task.doneDefinition,
    ingredientIds: [...task.ingredientIds],
  }));
}

function emptyTask(): DraftTask {
  return {
    key: nextDraftKey(),
    title: "",
    kind: "standard",
    applicability: "every_shift",
    phase: "start_of_shift",
    isRequired: true,
    allowsPhoto: false,
    doneDefinition: "",
    ingredientIds: [],
  };
}

function IngredientChips({
  ingredients,
  selectedIds,
  onChange,
}: {
  ingredients: PositionTaskIngredientOption[];
  selectedIds: number[];
  onChange: (ids: number[]) => void;
}) {
  const ingredientById = useMemo(
    () => new Map(ingredients.map((ingredient) => [ingredient.id, ingredient])),
    [ingredients],
  );
  const selectedSet = new Set(selectedIds);

  return (
    <Field>
      <FieldLabel>{copy.ingredientsLabel}</FieldLabel>
      <div className="flex flex-wrap gap-1.5">
        {selectedIds.length === 0 ? (
          <span className="text-xs text-muted-foreground">{copy.empty}</span>
        ) : (
          selectedIds.map((id) => (
            <Badge key={id} variant="secondary" className="gap-1">
              {ingredientById.get(id)?.name ?? id}
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={copy.removeIngredient}
                className="-mr-1 ml-0.5 size-5"
                onClick={() =>
                  onChange(selectedIds.filter((value) => value !== id))
                }
              >
                <IconX />
              </Button>
            </Badge>
          ))
        )}
      </div>
      <MultiSelectCombobox
        options={ingredients.map((ingredient) => ({
          value: String(ingredient.id),
          label: ingredient.name,
          hint: ingredient.unit,
          alreadySelected: selectedSet.has(ingredient.id),
        }))}
        triggerLabel={copy.addIngredients}
        confirmLabel={copy.addIngredientsConfirm}
        searchPlaceholder={copy.ingredientSearch}
        onConfirm={(values) =>
          onChange(
            Array.from(
              new Set([
                ...selectedIds,
                ...values.map((value) => Number(value)),
              ]),
            ),
          )
        }
      />
    </Field>
  );
}

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
  const [employeeName, setEmployeeName] = useState("");
  const [positionLabel, setPositionLabel] = useState<string | null>(null);
  const [hasOverride, setHasOverride] = useState(false);
  const [ingredients, setIngredients] = useState<PositionTaskIngredientOption[]>(
    [],
  );
  const [tasks, setTasks] = useState<DraftTask[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [clearOpen, setClearOpen] = useState(false);
  const [isLoading, startLoading] = useTransition();
  const [isSaving, startSaving] = useTransition();
  const [isClearing, startClearing] = useTransition();

  useEffect(() => {
    if (!open || employeeId == null) {
      setEmployeeName("");
      setPositionLabel(null);
      setHasOverride(false);
      setIngredients([]);
      setTasks([]);
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
        setEmployeeName("");
        setPositionLabel(null);
        setHasOverride(false);
        setIngredients([]);
        setTasks([]);
        setLoadError(result.error ?? copy.loadFailed);
        return;
      }

      const payload = result.data;
      const employee =
        payload.employees.find((item) => item.id === employeeId) ?? null;
      const template =
        payload.employeeTemplates.find((item) => item.employeeId === employeeId) ??
        null;
      const inherited =
        employee?.positionId == null
          ? []
          : (payload.tasksByPosition[employee.positionId] ?? []);

      setEmployeeName(employee?.name ?? "");
      setPositionLabel(employee?.positionLabel ?? null);
      setHasOverride(payload.hasOverride);
      setIngredients(payload.ingredients);
      setTasks(toDraftTasks(template?.tasks ?? inherited));
      setLoadError(null);
    });
  }, [branchId, employeeId, open]);

  const showIngredients = tasks.some((task) => task.kind === "consumption_report");

  function updateTask(key: string, patch: Partial<DraftTask>) {
    setTasks((current) =>
      current.map((task) => (task.key === key ? { ...task, ...patch } : task)),
    );
  }

  function saveTasks() {
    if (employeeId == null) return;
    const trimmed = tasks.map((task) => ({
      ...task,
      title: task.title.trim(),
      doneDefinition: task.doneDefinition.trim(),
      ingredientIds:
        task.kind === "consumption_report" ? task.ingredientIds : [],
    }));
    if (trimmed.some((task) => task.title.length === 0)) {
      toast.error(copy.needTitle);
      return;
    }

    startSaving(async () => {
      const result = await saveBranchEmployeeShiftTaskOverride({
        branchId,
        employeeId,
        tasks: trimmed.map((task) => ({
          title: task.title,
          kind: task.kind,
          applicability: task.applicability,
          phase: task.phase,
          isRequired: task.isRequired,
          allowsPhoto: task.allowsPhoto,
          doneDefinition: task.doneDefinition,
          ingredientIds: task.ingredientIds,
        })),
      });
      if (!result.success) {
        toast.error(result.error ?? copy.saveFailed);
        return;
      }
      toast.success(copy.saved);
      onSaved?.();
      onOpenChange(false);
    });
  }

  function clearOverride() {
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
  }

  const pending = isLoading || isSaving || isClearing;

  return (
    <>
      <AppSheet
        open={open && !clearOpen}
        onOpenChange={(next) => {
          if (!next) onOpenChange(false);
        }}
        title={employeeName ? copy.templateName(employeeName) : copy.title}
        description={
          loadError
            ? loadError
            : isLoading
              ? detailCopy.shiftTasksLoading
              : `${hasOverride ? copy.employeeTemplate : copy.positionTemplate}${
                  positionLabel ? ` · ${positionLabel}` : ""
                }`
        }
        side="bottom"
        contentClassName="max-h-dvh-95 bg-background"
        footerClassName="sticky bottom-0 border-t bg-background/95 backdrop-blur"
        footer={
          loadError || isLoading ? (
            <Button
              type="button"
              variant="outline"
              size="touch"
              className="w-full"
              onClick={() => onOpenChange(false)}
            >
              {ACTIONS_VI.close}
            </Button>
          ) : (
            <div className="flex w-full flex-col gap-2">
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="touch"
                  className="flex-1"
                  disabled={pending}
                  onClick={() => onOpenChange(false)}
                >
                  {copy.cancel}
                </Button>
                <Button
                  type="button"
                  size="touch-lg"
                  className="flex-1"
                  disabled={pending}
                  onClick={saveTasks}
                >
                  {isSaving ? <Spinner className="size-5" /> : null}
                  {hasOverride ? copy.save : copy.createEmployeeTemplate}
                </Button>
              </div>
              {hasOverride ? (
                <Button
                  type="button"
                  variant="destructive"
                  size="touch"
                  disabled={pending}
                  onClick={() => setClearOpen(true)}
                >
                  {copy.clearEmployeeTemplate}
                </Button>
              ) : null}
            </div>
          )
        }
      >
        {isLoading ? (
          <div className="flex justify-center py-4">
            <Spinner />
          </div>
        ) : loadError ? (
          <AppEmptyState compact mode="error" title={loadError} />
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <Badge variant={hasOverride ? "info" : "secondary"}>
                {hasOverride ? copy.employeeTemplate : copy.positionTemplate}
              </Badge>
              <Button
                type="button"
                variant="outline"
                size="touch"
                onClick={() => setTasks((current) => [...current, emptyTask()])}
              >
                <IconPlus data-icon="inline-start" />
                {copy.addTask}
              </Button>
            </div>

            {tasks.length === 0 ? (
              <p className="text-sm text-muted-foreground">{copy.empty}</p>
            ) : (
              <ItemGroup className="gap-3">
              {tasks.map((task) => (
                <Item
                  key={task.key}
                  variant="outline"
                  className="flex-col items-stretch"
                >
                  <ItemContent className="w-full min-w-0 gap-3">
                  <Field>
                    <FieldLabel htmlFor={`branch-task-title-${task.key}`}>
                      {copy.titleLabel}
                    </FieldLabel>
                    <Input
                      id={`branch-task-title-${task.key}`}
                      controlSize="touch"
                      value={task.title}
                      onChange={(event) =>
                        updateTask(task.key, { title: event.target.value })
                      }
                      placeholder={copy.titlePlaceholder}
                    />
                  </Field>
                  <Field>
                    <FieldLabel>{copy.phaseLabel}</FieldLabel>
                    <Select
                      value={task.phase}
                      onValueChange={(value) => {
                        if (
                          value === "start_of_shift" ||
                          value === "end_of_shift"
                        ) {
                          updateTask(task.key, { phase: value });
                        }
                      }}
                    >
                      <SelectTrigger size="touch">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {POSITION_TASK_PHASES.map((phase) => (
                          <SelectItem key={phase} value={phase} size="touch">
                            {copy.phaseLabels[phase]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <div className="flex flex-wrap gap-4">
                    <div className="flex items-center gap-2">
                      <Switch
                        id={`branch-task-required-${task.key}`}
                        checked={task.isRequired}
                        onCheckedChange={(value) =>
                          updateTask(task.key, { isRequired: value === true })
                        }
                      />
                      <Label
                        htmlFor={`branch-task-required-${task.key}`}
                        className="text-sm font-normal"
                      >
                        {copy.requiredLabel}
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        id={`branch-task-photo-${task.key}`}
                        checked={task.allowsPhoto}
                        onCheckedChange={(value) =>
                          updateTask(task.key, { allowsPhoto: value === true })
                        }
                      />
                      <Label
                        htmlFor={`branch-task-photo-${task.key}`}
                        className="text-sm font-normal"
                      >
                        {copy.allowsPhotoLabel}
                      </Label>
                    </div>
                  </div>
                  {showIngredients && task.kind === "consumption_report" ? (
                    <IngredientChips
                      ingredients={ingredients}
                      selectedIds={task.ingredientIds}
                      onChange={(ingredientIds) =>
                        updateTask(task.key, { ingredientIds })
                      }
                    />
                  ) : null}
                  <Button
                    type="button"
                    variant="ghost"
                    size="touch"
                    className="self-start text-destructive"
                    aria-label={copy.removeTask}
                    onClick={() =>
                      setTasks((current) =>
                        current.filter((row) => row.key !== task.key),
                      )
                    }
                  >
                    <IconTrash data-icon="inline-start" />
                    {copy.removeTask}
                  </Button>
                  </ItemContent>
                </Item>
              ))}
              </ItemGroup>
            )}
          </div>
        )}
      </AppSheet>

      <AppDialog
        open={clearOpen}
        onOpenChange={(next) => {
          setClearOpen(next);
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
              disabled={isClearing}
              onClick={clearOverride}
            >
              {isClearing ? <Spinner className="size-5" /> : null}
              {copy.clearEmployeeTemplate}
            </Button>
          </div>
        }
      />
    </>
  );
}
