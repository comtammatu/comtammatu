"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Plus as IconPlus, Trash2 as IconTrash, X as IconX } from "lucide-react";
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
import { toast } from "@comtammatu/ui/components/sonner";
import {
  Field,
  FieldLabel,
} from "@comtammatu/ui/components/field";
import { Input } from "@comtammatu/ui/components/input";
import { Textarea } from "@comtammatu/ui/components/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { MultiSelectCombobox } from "@/components/form";
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
            <p className="text-xs text-muted-foreground">{copy.ingredientsHint}</p>
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
                      <button
                        type="button"
                        aria-label={copy.removeIngredient}
                        className="ml-0.5"
                        onClick={() =>
                          field.onChange(selected.filter((x) => x !== id))
                        }
                      >
                        <IconX className="size-3" />
                      </button>
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
        <Controller
          control={control}
          name={`tasks.${index}.title`}
          render={({ field, fieldState }) => (
            <Field data-invalid={!!fieldState.error}>
              <FieldLabel htmlFor={`task-title-${index}`}>
                {copy.titleLabel}
              </FieldLabel>
              <Input
                id={`task-title-${index}`}
                className="h-10"
                placeholder={copy.titlePlaceholder}
                aria-invalid={!!fieldState.error}
                {...field}
                value={field.value ?? ""}
              />
            </Field>
          )}
        />

        <Controller
          control={control}
          name={`tasks.${index}.kind`}
          render={({ field }) => (
            <Field>
              <FieldLabel>{copy.kindLabel}</FieldLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger className="!h-10 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {POSITION_TASK_KINDS.map((kind) => (
                    <SelectItem key={kind} value={kind}>
                      {copy.kindLabels[kind]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
        />

        <Controller
          control={control}
          name={`tasks.${index}.applicability`}
          render={({ field }) => (
            <Field>
              <FieldLabel>{copy.applicabilityLabel}</FieldLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger className="!h-10 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {POSITION_TASK_APPLICABILITY.map((value) => (
                    <SelectItem key={value} value={value}>
                      {copy.applicabilityLabels[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
        />

        <Controller
          control={control}
          name={`tasks.${index}.phase`}
          render={({ field }) => (
            <Field>
              <FieldLabel>{copy.phaseLabel}</FieldLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger className="!h-10 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {POSITION_TASK_PHASES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {copy.phaseLabels[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
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
        <Controller
          control={control}
          name={`tasks.${index}.doneDefinition`}
          render={({ field }) => (
            <Field>
              <FieldLabel htmlFor={`task-done-${index}`}>
                {copy.doneDefinitionLabel}
              </FieldLabel>
              <Textarea
                id={`task-done-${index}`}
                className="min-h-16"
                placeholder={copy.doneDefinitionPlaceholder}
                {...field}
                value={field.value ?? ""}
              />
            </Field>
          )}
        />
        <Controller
          control={control}
          name={`tasks.${index}.isRequired`}
          render={({ field }) => (
            <label className="flex items-center gap-2 pb-2 text-sm">
              <Switch
                checked={field.value}
                onCheckedChange={(value) => field.onChange(value === true)}
              />
              {copy.requiredLabel}
            </label>
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
