"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight as IconArrowRight,
  Pencil as IconPencil,
  Plus as IconPlus,
} from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Checkbox } from "@comtammatu/ui/components/checkbox";
import { Label } from "@comtammatu/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { toast } from "@comtammatu/ui/components/sonner";
import {
  ACTIONS_VI,
  FORM_VI,
  INVENTORY_VI,
  STAFF_VI,
} from "@comtammatu/shared/messages";
import { AppDialog } from "@/components/form";
import {
  AppEmptyState,
  AppPage,
  AppPageHeader,
  AppSection,
} from "@/components/surface";
import { setCountAssignments } from "./actions";

export interface EmployeeRow {
  id: number;
  name: string;
}

export interface IngredientOption {
  id: number;
  name: string;
  unit: string;
}

interface Props {
  selectedBranchId: number | null;
  selectedLocationId: number | null;
  employees: EmployeeRow[];
  ingredients: IngredientOption[];
  assignmentsByEmployee: Record<string, number[]>;
  basePath?: string;
  embedded?: boolean;
}

function seedSelections(
  employees: readonly EmployeeRow[],
  assignmentsByEmployee: Record<string, number[]>,
) {
  const seed: Record<string, number[]> = {};
  for (const emp of employees) {
    seed[String(emp.id)] = assignmentsByEmployee[String(emp.id)] ?? [];
  }
  return seed;
}

function buildBranchCountHref(
  branchId: number | null,
  locationId: number | null,
) {
  if (branchId === null) return null;
  const href = `/br/${branchId}/stock/count`;
  return locationId === null ? href : `${href}?location=${locationId}`;
}

export function CountAssignmentsClient({
  selectedBranchId,
  selectedLocationId,
  employees,
  ingredients,
  assignmentsByEmployee,
  embedded = false,
}: Props) {
  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const ingredientMap = useMemo(() => {
    const m = new Map<number, IngredientOption>();
    for (const i of ingredients) m.set(i.id, i);
    return m;
  }, [ingredients]);

  // Per-employee selected ingredient-id set, seeded from the active
  // assignments returned by the server for the current branch+location.
  const [selectionByEmployee, setSelectionByEmployee] = useState<
    Record<string, number[]>
  >(() => seedSelections(employees, assignmentsByEmployee));

  useEffect(() => {
    setSelectionByEmployee(seedSelections(employees, assignmentsByEmployee));
  }, [employees, assignmentsByEmployee]);

  const scopeReady = selectedBranchId !== null && selectedLocationId !== null;
  const countHref = buildBranchCountHref(selectedBranchId, selectedLocationId);
  const assignedEmployees = useMemo(
    () =>
      employees.filter(
        (emp) => (selectionByEmployee[String(emp.id)] ?? []).length > 0,
      ),
    [employees, selectionByEmployee],
  );
  const unassignedEmployees = useMemo(
    () =>
      employees.filter(
        (emp) => (selectionByEmployee[String(emp.id)] ?? []).length === 0,
      ),
    [employees, selectionByEmployee],
  );

  const assignmentActions = (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {countHref ? (
        <Button asChild variant="outline" size={embedded ? "touch" : "default"}>
          <Link href={countHref}>
            <IconArrowRight className="size-4" />
            {INVENTORY_VI.openCountScreen}
          </Link>
        </Button>
      ) : null}
      <Button
        type="button"
        size={embedded ? "touch" : "default"}
        onClick={() => setNewDialogOpen(true)}
        disabled={!scopeReady || unassignedEmployees.length === 0}
      >
        <IconPlus className="size-4" />
        {INVENTORY_VI.countAssignAddAction}
      </Button>
    </div>
  );

  const content = (
    <>
      {embedded ? (
        assignmentActions
      ) : (
        <AppPageHeader
          eyebrow={INVENTORY_VI.countAssignEyebrow}
          title={INVENTORY_VI.countAssignTitle}
          description={INVENTORY_VI.countAssignDescription}
          actions={assignmentActions}
        />
      )}

      {!scopeReady && (
        <AppEmptyState
          mode="no-data"
          title={INVENTORY_VI.countAssignNoWarehouseTitle}
          description={INVENTORY_VI.countAssignNoWarehouseDescription}
        />
      )}

      {scopeReady && employees.length === 0 && (
        <AppEmptyState
          mode="no-data"
          title={INVENTORY_VI.countAssignNoEmployeesTitle}
          description={INVENTORY_VI.countAssignNoEmployeesDescription}
        />
      )}

      {scopeReady && employees.length > 0 && assignedEmployees.length === 0 && (
        <AppEmptyState
          mode="no-data"
          title={INVENTORY_VI.countAssignEmptyTitle}
          description={INVENTORY_VI.countAssignEmptyDescription}
        />
      )}

      {scopeReady && assignedEmployees.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {assignedEmployees.map((emp) => (
            <EmployeeAssignmentCard
              key={emp.id}
              employee={emp}
              branchId={selectedBranchId}
              locationId={selectedLocationId}
              ingredients={ingredients}
              ingredientMap={ingredientMap}
              selectedIds={selectionByEmployee[String(emp.id)] ?? []}
              onSelectionChange={(ids) =>
                setSelectionByEmployee((prev) => ({
                  ...prev,
                  [String(emp.id)]: ids,
                }))
              }
              embedded={embedded}
            />
          ))}
        </div>
      )}

      {scopeReady ? (
        <NewAssignmentDialog
          open={newDialogOpen}
          onOpenChange={setNewDialogOpen}
          branchId={selectedBranchId}
          locationId={selectedLocationId}
          employees={unassignedEmployees}
          ingredients={ingredients}
          onSaved={(employeeId, ids) =>
            setSelectionByEmployee((prev) => ({
              ...prev,
              [String(employeeId)]: ids,
            }))
          }
        />
      ) : null}
    </>
  );

  if (embedded) {
    return <div className="flex w-full flex-col gap-3">{content}</div>;
  }

  return <AppPage scroll>{content}</AppPage>;
}

function EmployeeAssignmentCard({
  employee,
  branchId,
  locationId,
  ingredients,
  ingredientMap,
  selectedIds,
  onSelectionChange,
  embedded = false,
}: {
  employee: EmployeeRow;
  branchId: number;
  locationId: number;
  ingredients: IngredientOption[];
  ingredientMap: Map<number, IngredientOption>;
  selectedIds: number[];
  onSelectionChange: (ids: number[]) => void;
  embedded?: boolean;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <>
      <AppSection size="sm">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              {FORM_VI.name}
            </span>
            <span className="font-medium text-foreground">{employee.name}</span>
          </div>
          <Button
            type="button"
            size={embedded ? "touch" : "sm"}
            variant="outline"
            onClick={() => setDialogOpen(true)}
          >
            <IconPencil className="size-3.5" />
            {INVENTORY_VI.countAssignEditAction}
          </Button>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            {INVENTORY_VI.countAssignAssignedBadge(selectedIds.length)}
          </span>
          <div className="flex flex-wrap gap-2">
            {selectedIds.map((id) => {
              const ing = ingredientMap.get(id);
              return (
                <Badge key={id} variant="secondary">
                  {ing?.name ?? `#${id}`}
                </Badge>
              );
            })}
          </div>
        </div>
      </AppSection>

      <AssignmentEditDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        employee={employee}
        branchId={branchId}
        locationId={locationId}
        ingredients={ingredients}
        selectedIds={selectedIds}
        onSaved={onSelectionChange}
      />
    </>
  );
}

function NewAssignmentDialog({
  open,
  onOpenChange,
  branchId,
  locationId,
  employees,
  ingredients,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branchId: number;
  locationId: number;
  employees: EmployeeRow[];
  ingredients: IngredientOption[];
  onSaved: (employeeId: number, ids: number[]) => void;
}) {
  const router = useRouter();
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [draftIds, setDraftIds] = useState<number[]>([]);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    const firstEmployee = employees[0];
    setSelectedEmployeeId(firstEmployee ? String(firstEmployee.id) : "");
    setDraftIds([]);
  }, [open, employees]);

  const draftSet = useMemo(() => new Set(draftIds), [draftIds]);
  const selectedEmployee =
    employees.find((employee) => String(employee.id) === selectedEmployeeId) ??
    null;

  function toggleIngredient(id: number) {
    setDraftIds((current) =>
      current.includes(id)
        ? current.filter((currentId) => currentId !== id)
        : [...current, id],
    );
  }

  function persist() {
    if (!selectedEmployee) return;
    startTransition(async () => {
      const result = await setCountAssignments({
        branchId,
        locationId,
        employeeId: selectedEmployee.id,
        ingredientIds: draftIds,
      });
      if (!result.success) {
        toast.error(result.error ?? INVENTORY_VI.countAssignSaveFailed);
        return;
      }
      onSaved(selectedEmployee.id, draftIds);
      toast.success(
        INVENTORY_VI.countAssignSaved(selectedEmployee.name, draftIds.length),
      );
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      title={INVENTORY_VI.countAssignAddAction}
      description={INVENTORY_VI.countAssignAddDescription}
      footer={
        <Button
          type="button"
          onClick={persist}
          disabled={
            isPending ||
            !selectedEmployee ||
            ingredients.length === 0 ||
            draftIds.length === 0
          }
        >
          {isPending && <Spinner />}
          {ACTIONS_VI.save}
        </Button>
      }
    >
      {employees.length === 0 ? (
        <p className="rounded-md border bg-muted px-3 py-2 text-sm text-muted-foreground">
          {INVENTORY_VI.countAssignAllAssigned}
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="count-assignment-new-employee">
              {STAFF_VI.long}
            </Label>
            <Select
              value={selectedEmployeeId}
              onValueChange={setSelectedEmployeeId}
              disabled={isPending}
            >
              <SelectTrigger id="count-assignment-new-employee">
                <SelectValue placeholder={INVENTORY_VI.selectEmployeePlaceholder} />
              </SelectTrigger>
              <SelectContent>
                {employees.map((employee) => (
                  <SelectItem key={employee.id} value={String(employee.id)}>
                    {employee.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <AssignmentChecklist
            employeeId={selectedEmployeeId || "new"}
            ingredients={ingredients}
            draftSet={draftSet}
            disabled={isPending}
            onToggle={toggleIngredient}
          />
        </>
      )}
    </AppDialog>
  );
}

function AssignmentChecklist({
  employeeId,
  ingredients,
  draftSet,
  disabled,
  onToggle,
}: {
  employeeId: number | string;
  ingredients: IngredientOption[];
  draftSet: Set<number>;
  disabled: boolean;
  onToggle: (id: number) => void;
}) {
  const selectedCount = draftSet.size;

  if (ingredients.length === 0) {
    return (
      <p className="rounded-md border bg-muted px-3 py-2 text-sm text-muted-foreground">
        {INVENTORY_VI.countAssignNoFinishedGoods}
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border bg-muted/30">
      <div className="flex items-center justify-between gap-3 border-b bg-card px-3 py-2">
        <span className="text-sm font-medium">
          {INVENTORY_VI.countAssignChecklistTitle}
        </span>
        <Badge variant={selectedCount > 0 ? "success" : "outline"}>
          {INVENTORY_VI.selectedRatio(selectedCount, ingredients.length)}
        </Badge>
      </div>
      <div className="flex max-h-72 flex-col gap-1 overflow-y-auto p-2">
        {ingredients.map((ingredient) => {
          const checked = draftSet.has(ingredient.id);
          const checkboxId = `count-assignment-${employeeId}-${ingredient.id}`;
          return (
            <div
              key={ingredient.id}
              className={`flex items-start gap-2 rounded-md border px-2 py-2 transition-colors ${
                checked
                  ? "border-primary/30 bg-primary/5"
                  : "border-transparent bg-card hover:bg-muted"
              }`}
            >
              <Checkbox
                id={checkboxId}
                size="touch"
                checked={checked}
                onCheckedChange={() => onToggle(ingredient.id)}
                disabled={disabled}
              />
              <Label
                htmlFor={checkboxId}
                className="flex min-w-0 flex-1 cursor-pointer items-start justify-between gap-3"
              >
                <span className="min-w-0 truncate text-sm font-medium">
                  {ingredient.name}
                </span>
                {ingredient.unit ? (
                  <Badge variant="outline">{ingredient.unit}</Badge>
                ) : null}
              </Label>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AssignmentEditDialog({
  open,
  onOpenChange,
  employee,
  branchId,
  locationId,
  ingredients,
  selectedIds,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: EmployeeRow;
  branchId: number;
  locationId: number;
  ingredients: IngredientOption[];
  selectedIds: number[];
  onSaved: (ids: number[]) => void;
}) {
  const router = useRouter();
  const [draftIds, setDraftIds] = useState<number[]>(selectedIds);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (open) setDraftIds(selectedIds);
  }, [open, selectedIds]);

  const draftSet = useMemo(() => new Set(draftIds), [draftIds]);

  function toggleIngredient(id: number) {
    setDraftIds((current) =>
      current.includes(id)
        ? current.filter((currentId) => currentId !== id)
        : [...current, id],
    );
  }

  function persist(nextIds: number[]) {
    startTransition(async () => {
      const result = await setCountAssignments({
        branchId,
        locationId,
        employeeId: employee.id,
        ingredientIds: nextIds,
      });
      if (!result.success) {
        toast.error(result.error ?? INVENTORY_VI.countAssignSaveFailed);
        return;
      }
      onSaved(nextIds);
      toast.success(
        nextIds.length === 0
          ? INVENTORY_VI.countAssignRemoved(employee.name)
          : INVENTORY_VI.countAssignSaved(employee.name, nextIds.length),
      );
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      title={INVENTORY_VI.countAssignEditTitle}
      description={INVENTORY_VI.countAssignEditDescription(employee.name)}
      footerClassName="sm:justify-between"
      footer={
        <>
          <Button
            type="button"
            variant="destructive"
            onClick={() => persist([])}
            disabled={isPending}
          >
            {INVENTORY_VI.countAssignRemoveAction}
          </Button>
          <Button
            type="button"
            onClick={() => persist(draftIds)}
            disabled={isPending || ingredients.length === 0}
          >
            {isPending && <Spinner />}
            {ACTIONS_VI.save}
          </Button>
        </>
      }
    >
      <AssignmentChecklist
        employeeId={employee.id}
        ingredients={ingredients}
        draftSet={draftSet}
        disabled={isPending}
        onToggle={toggleIngredient}
      />
    </AppDialog>
  );
}
