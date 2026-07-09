"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  Plus as IconPlus,
  Trash2 as IconTrash,
  X as IconX,
} from "lucide-react";
import {
  Controller,
  useFieldArray,
  useForm,
  type Control,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@comtammatu/ui/components/button";
import { Badge } from "@comtammatu/ui/components/badge";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { Switch } from "@comtammatu/ui/components/switch";
import { Label } from "@comtammatu/ui/components/label";
import { toast } from "@comtammatu/ui/components/sonner";
import { FieldLabel } from "@comtammatu/ui/components/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import {
  TextField,
  SelectField,
  TextareaField,
  MultiSelectCombobox,
} from "@/components/form";
import {
  fetchPositionTasksData,
  savePositionTasks,
  type PositionTasksData,
} from "./position-tasks-actions";
import {
  POSITION_TASK_APPLICABILITY,
  POSITION_TASK_KINDS,
  POSITION_TASK_PHASES,
  type PositionOption,
  type PositionTaskIngredientOption,
  type PositionTaskRow,
} from "./position-task-types";
import { messages } from "@lib/messages";

const copy = messages.hr.client.positionTasks;

const taskRowSchema = z.object({
  title: z.string().trim().min(1, { error: copy.needTitle }).max(120),
  kind: z.enum(POSITION_TASK_KINDS),
  applicability: z.enum(POSITION_TASK_APPLICABILITY),
  phase: z.enum(POSITION_TASK_PHASES),
  isRequired: z.boolean(),
  doneDefinition: z.string().max(240),
  ingredientIds: z.array(z.number().int().positive()),
});

const formSchema = z.object({ tasks: z.array(taskRowSchema).max(40) });

type FormValues = z.infer<typeof formSchema>;
type TaskRowValues = z.infer<typeof taskRowSchema>;

const EMPTY_TASK: TaskRowValues = {
  title: "",
  kind: "standard",
  applicability: "every_shift",
  phase: "start_of_shift",
  isRequired: true,
  doneDefinition: "",
  ingredientIds: [],
};

function toFormValues(tasks: PositionTaskRow[]): FormValues {
  return {
    tasks: tasks.map((task) => ({
      title: task.title,
      kind: task.kind,
      applicability: task.applicability,
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
  const ingredientById = useMemo(() => {
    const map = new Map<number, PositionTaskIngredientOption>();
    for (const ingredient of ingredients) map.set(ingredient.id, ingredient);
    return map;
  }, [ingredients]);

  return (
    <Controller
      control={control}
      name={`tasks.${index}.ingredientIds`}
      render={({ field }) => {
        const selected = field.value ?? [];
        const selectedSet = new Set(selected);
        return (
          <div className="flex flex-col gap-2 rounded-md border bg-muted/20 p-3">
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
                          field.onChange(selected.filter((x) => x !== id))
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
              options={ingredients.map((ingredient) => ({
                value: String(ingredient.id),
                label: ingredient.name,
                hint: ingredient.unit,
                alreadySelected: selectedSet.has(ingredient.id),
              }))}
              onConfirm={(values) =>
                field.onChange(
                  Array.from(
                    new Set([...selected, ...values.map((v) => Number(v))]),
                  ),
                )
              }
              triggerLabel={copy.addIngredients}
              confirmLabel={copy.addIngredientsConfirm}
              searchPlaceholder={copy.ingredientSearch}
              triggerClassName="w-full"
            />
          </div>
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
    <div className="flex flex-col gap-3 rounded-md border p-3">
      <div className="grid gap-3 lg:grid-cols-[1fr_170px_150px_150px_auto]">
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
          name={`tasks.${index}.applicability`}
          label={copy.applicabilityLabel}
          id={`task-applicability-${index}`}
          options={POSITION_TASK_APPLICABILITY.map((value) => ({
            value,
            label: copy.applicabilityLabels[value],
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
    </div>
  );
}

interface PositionTasksClientProps {
  initialData: PositionTasksData;
}

export function PositionTasksClient({ initialData }: PositionTasksClientProps) {
  const [data, setData] = useState(initialData);
  const [positionId, setPositionId] = useState<number | null>(
    initialData.positions[0]?.id ?? null,
  );
  const [isPending, startTransition] = useTransition();

  const form = useForm<FormValues, unknown, FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { tasks: [] },
  });
  const { fields, append, remove, replace } = useFieldArray({
    control: form.control,
    name: "tasks",
  });
  const watchedTasks = form.watch("tasks");

  useEffect(() => {
    if (positionId == null) {
      replace([]);
      return;
    }
    replace(toFormValues(data.tasksByPosition[positionId] ?? []).tasks);
  }, [positionId, data, replace]);

  function onValid(values: FormValues) {
    if (positionId == null) return;
    startTransition(async () => {
      const result = await savePositionTasks({
        positionId,
        tasks: values.tasks.map((task) => ({
          title: task.title.trim(),
          kind: task.kind,
          applicability: task.applicability,
          phase: task.phase,
          isRequired: task.isRequired,
          doneDefinition: task.doneDefinition.trim(),
          ingredientIds:
            task.kind === "consumption_report" ? task.ingredientIds : [],
        })),
      });
      if (!result.success) {
        toast.error(result.error ?? copy.saveFailed);
        return;
      }
      toast.success(copy.saved);
      const refreshed = await fetchPositionTasksData();
      if (refreshed.success && refreshed.data) setData(refreshed.data);
    });
  }

  const positionOptions: PositionOption[] = data.positions;

  return (
    <form
      onSubmit={form.handleSubmit(onValid)}
      noValidate
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-2 sm:max-w-sm">
        <FieldLabel htmlFor="position-task-position">
          {copy.positionLabel}
        </FieldLabel>
        <Select
          value={positionId?.toString() ?? ""}
          onValueChange={(value) => setPositionId(Number(value))}
        >
          <SelectTrigger id="position-task-position" className="!h-10 w-full">
            <SelectValue placeholder={copy.positionPlaceholder} />
          </SelectTrigger>
          <SelectContent>
            {positionOptions.map((position) => (
              <SelectItem key={position.id} value={position.id.toString()}>
                {position.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {positionId == null ? (
        <p className="text-sm text-muted-foreground">{copy.emptyPosition}</p>
      ) : (
        <>
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
            <div className="flex flex-col gap-3">
              {fields.map((row, index) => (
                <TaskRow
                  key={row.id}
                  control={form.control}
                  index={index}
                  ingredients={data.ingredients}
                  watchedKind={watchedTasks[index]?.kind ?? "standard"}
                  onRemove={() => remove(index)}
                />
              ))}
            </div>
          )}

          <div className="flex justify-end">
            <Button type="submit" disabled={isPending}>
              {isPending ? <Spinner data-icon="inline-start" /> : null}
              {copy.save}
            </Button>
          </div>
        </>
      )}
    </form>
  );
}
