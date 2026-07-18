/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: inventory management copy */
"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FileText as IconFileText,
  Pencil as IconPencil,
  Search as IconSearch,
  Trash2 as IconTrash,
} from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Checkbox } from "@comtammatu/ui/components/checkbox";
import { confirm } from "@comtammatu/ui/components/confirm-dialog";
import { Frame } from "@comtammatu/ui/components/frame";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@comtammatu/ui/components/input-group";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { Label } from "@comtammatu/ui/components/label";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { toast } from "@comtammatu/ui/components/sonner";
import { cn } from "@comtammatu/ui";
import { ACTIONS_VI, INVENTORY_VI } from "@comtammatu/shared/messages";
import { formatVNClockTime } from "@comtammatu/shared/time";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { AppDialog } from "@/components/form";
import { AppEmptyState, AppPage, AppPageHeader } from "@/components/surface";
import { matchesSearch } from "@lib/search";
import type {
  CountAssignmentEmployee,
  CountAssignmentIngredient,
  CountAssignmentLocation,
  CountAssignmentShift,
} from "@lib/inventory/count-assignment-model";
import { setCountAssignments } from "./actions";

type EmployeeRow = CountAssignmentEmployee;
type IngredientOption = CountAssignmentIngredient;
type LocationOption = CountAssignmentLocation;
type ShiftOption = CountAssignmentShift;

interface Props {
  selectedBranchId: number | null;
  selectedLocationId: number | null;
  selectedShiftId: number | null;
  locationOptions: LocationOption[];
  shiftOptions: ShiftOption[];
  employees: EmployeeRow[];
  ingredients: IngredientOption[];
  assignmentsByEmployee: Record<string, number[]>;
}

const ALL_SHIFTS_VALUE = "all";
type ShiftScopeValue = number | typeof ALL_SHIFTS_VALUE | null;

function seedSelections(
  employees: readonly EmployeeRow[],
  assignmentsByEmployee: Record<string, number[]>,
) {
  const seed: Record<string, number[]> = {};
  for (const employee of employees) {
    seed[String(employee.id)] =
      assignmentsByEmployee[String(employee.id)] ?? [];
  }
  return seed;
}

function buildShiftScopeHref({
  branchId,
  locationId,
  shiftId,
}: {
  branchId: number | null;
  locationId: number | null;
  shiftId: ShiftScopeValue;
}) {
  const params = new URLSearchParams();
  if (branchId !== null) params.set("branchId", String(branchId));
  if (locationId !== null) params.set("locationId", String(locationId));
  if (shiftId !== null) params.set("shiftId", String(shiftId));
  const query = params.toString();
  return query
    ? `/inventory/count-assignments?${query}`
    : "/inventory/count-assignments";
}

function AssignmentBadges({
  selectedIds,
  ingredientMap,
}: {
  selectedIds: readonly number[];
  ingredientMap: Map<number, IngredientOption>;
}) {
  if (selectedIds.length === 0) {
    return <span className="text-sm text-muted-foreground">Chưa gán</span>;
  }

  return (
    <div className="flex min-w-0 flex-wrap gap-1.5">
      {selectedIds.slice(0, 4).map((id) => (
        <Badge key={id} variant="secondary">
          {ingredientMap.get(id)?.name ?? `#${id}`}
        </Badge>
      ))}
      {selectedIds.length > 4 ? (
        <Badge variant="outline">+{selectedIds.length - 4}</Badge>
      ) : null}
    </div>
  );
}

export function CountAssignmentsClient({
  selectedBranchId,
  selectedLocationId,
  selectedShiftId,
  locationOptions,
  shiftOptions,
  employees,
  ingredients,
  assignmentsByEmployee,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [activeEmployeeId, setActiveEmployeeId] = useState<number | null>(null);
  const [ingredientSearch, setIngredientSearch] = useState("");
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [draftIds, setDraftIds] = useState<number[]>([]);
  const [selectionByEmployee, setSelectionByEmployee] = useState<
    Record<string, number[]>
  >(() => seedSelections(employees, assignmentsByEmployee));

  useEffect(() => {
    setSelectionByEmployee(seedSelections(employees, assignmentsByEmployee));
  }, [employees, assignmentsByEmployee]);

  const ingredientMap = useMemo(
    () => new Map(ingredients.map((ingredient) => [ingredient.id, ingredient])),
    [ingredients],
  );
  const activeEmployee =
    activeEmployeeId === null
      ? null
      : (employees.find((employee) => employee.id === activeEmployeeId) ??
        null);
  const scopeReady = selectedBranchId !== null && selectedLocationId !== null;
  const showLocationPicker = scopeReady && locationOptions.length > 1;
  const showShiftPicker = scopeReady && shiftOptions.length > 0;
  const shiftSelectValue =
    selectedShiftId === null ? ALL_SHIFTS_VALUE : String(selectedShiftId);
  const assignedEmployeeCount = Object.values(selectionByEmployee).filter(
    (ids) => ids.length > 0,
  ).length;
  const visibleEmployees = useMemo(() => {
    const query = employeeSearch.trim();
    if (!query) return employees;
    return employees.filter((employee) =>
      matchesSearch([employee.name], query),
    );
  }, [employeeSearch, employees]);
  const visibleIngredients = useMemo(() => {
    const query = ingredientSearch.trim();
    if (!query) return ingredients;
    return ingredients.filter((ingredient) =>
      matchesSearch([ingredient.name, ingredient.unit], query),
    );
  }, [ingredientSearch, ingredients]);

  function openEditor(employee: EmployeeRow) {
    setDraftIds(selectionByEmployee[String(employee.id)] ?? []);
    setIngredientSearch("");
    setActiveEmployeeId(employee.id);
  }

  function closeEditor() {
    if (isPending) return;
    setActiveEmployeeId(null);
    setIngredientSearch("");
  }

  function toggleIngredient(id: number) {
    setDraftIds((current) =>
      current.includes(id)
        ? current.filter((currentId) => currentId !== id)
        : [...current, id],
    );
  }

  function handleSave() {
    if (
      activeEmployee === null ||
      selectedBranchId === null ||
      selectedLocationId === null
    ) {
      return;
    }
    const nextIds = [...draftIds];

    startTransition(async () => {
      const result = await setCountAssignments({
        branchId: selectedBranchId,
        locationId: selectedLocationId,
        employeeId: activeEmployee.id,
        shiftId: selectedShiftId,
        ingredientIds: nextIds,
      });
      if (!result.success) {
        toast.error(result.error ?? INVENTORY_VI.countAssignSaveFailed);
        return;
      }
      setSelectionByEmployee((current) => ({
        ...current,
        [String(activeEmployee.id)]: nextIds,
      }));
      toast.success(
        nextIds.length === 0
          ? INVENTORY_VI.countAssignRemoved(activeEmployee.name)
          : INVENTORY_VI.countAssignSaved(activeEmployee.name, nextIds.length),
      );
      setActiveEmployeeId(null);
      router.refresh();
    });
  }

  async function handleClear(employee: EmployeeRow) {
    if (
      selectedBranchId === null ||
      selectedLocationId === null ||
      (selectionByEmployee[String(employee.id)] ?? []).length === 0
    ) {
      return;
    }
    const accepted = await confirm({
      title: "Xóa phân công đếm tồn?",
      description: `Toàn bộ mặt hàng đang giao cho ${employee.name} sẽ được gỡ.`,
      confirmText: ACTIONS_VI.delete,
      variant: "destructive",
    });
    if (!accepted) return;

    startTransition(async () => {
      const result = await setCountAssignments({
        branchId: selectedBranchId,
        locationId: selectedLocationId,
        employeeId: employee.id,
        shiftId: selectedShiftId,
        ingredientIds: [],
      });
      if (!result.success) {
        toast.error(result.error ?? INVENTORY_VI.countAssignSaveFailed);
        return;
      }
      setSelectionByEmployee((current) => ({
        ...current,
        [String(employee.id)]: [],
      }));
      toast.success(INVENTORY_VI.countAssignRemoved(employee.name));
      router.refresh();
    });
  }

  function changeShiftScope(value: string) {
    const parsedShiftId =
      value === ALL_SHIFTS_VALUE ? null : Number.parseInt(value, 10);
    const nextShiftId =
      value === ALL_SHIFTS_VALUE
        ? ALL_SHIFTS_VALUE
        : parsedShiftId !== null && Number.isFinite(parsedShiftId)
          ? parsedShiftId
          : null;
    router.replace(
      buildShiftScopeHref({
        branchId: selectedBranchId,
        locationId: selectedLocationId,
        shiftId: nextShiftId,
      }),
    );
  }

  function changeLocationScope(value: string) {
    const nextLocationId = Number.parseInt(value, 10);
    if (!Number.isFinite(nextLocationId)) return;
    router.replace(
      buildShiftScopeHref({
        branchId: selectedBranchId,
        locationId: nextLocationId,
        shiftId:
          showShiftPicker && selectedShiftId === null
            ? ALL_SHIFTS_VALUE
            : selectedShiftId,
      }),
    );
  }

  const columns: DataTableColumn<EmployeeRow>[] = [
    {
      key: "employee",
      header: "Nhân viên",
      className: "min-w-52",
      render: (employee) => <div className="font-medium">{employee.name}</div>,
    },
    {
      key: "assignments",
      header: "Mặt hàng được giao",
      className: "min-w-96",
      render: (employee) => (
        <AssignmentBadges
          selectedIds={selectionByEmployee[String(employee.id)] ?? []}
          ingredientMap={ingredientMap}
        />
      ),
    },
    {
      key: "count",
      header: "Số lượng",
      className: "w-28 text-right",
      render: (employee) => (
        <span className="block font-mono tabular-nums text-right">
          {(selectionByEmployee[String(employee.id)] ?? []).length}
        </span>
      ),
    },
    {
      key: "actions",
      header: "Thao tác",
      className: "w-52 text-right",
      render: (employee) => {
        const hasAssignments =
          (selectionByEmployee[String(employee.id)] ?? []).length > 0;
        return (
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isPending}
              onClick={() => openEditor(employee)}
            >
              <IconPencil aria-hidden="true" />
              {ACTIONS_VI.edit}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isPending || !hasAssignments}
              onClick={() => void handleClear(employee)}
            >
              <IconTrash aria-hidden="true" />
              {ACTIONS_VI.delete}
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <AppPage width="xwide" density="compact" scroll>
      <AppPageHeader
        eyebrow={INVENTORY_VI.countAssignEyebrow}
        title={INVENTORY_VI.countAssignTitle}
        description={INVENTORY_VI.countAssignDescription}
        actions={
          <Button
            variant="outline"
            render={<Link href="/inventory/count-slips" />}
          >
            <IconFileText aria-hidden="true" />
            {INVENTORY_VI.countSlipTitle}
          </Button>
        }
        badge={
          scopeReady
            ? {
                children: `${assignedEmployeeCount}/${employees.length} đã giao`,
              }
            : undefined
        }
      />

      {showLocationPicker || showShiftPicker ? (
        <div className="grid max-w-3xl gap-3 sm:grid-cols-2">
          {showLocationPicker ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="count-assignment-location">
                {INVENTORY_VI.warehouseShort}
              </Label>
              <Select
                value={String(selectedLocationId)}
                onValueChange={changeLocationScope}
              >
                <SelectTrigger id="count-assignment-location">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {locationOptions.map((location) => (
                    <SelectItem key={location.id} value={String(location.id)}>
                      {location.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {showShiftPicker ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="count-assignment-shift">Ca đếm tồn</Label>
              <Select value={shiftSelectValue} onValueChange={changeShiftScope}>
                <SelectTrigger id="count-assignment-shift">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_SHIFTS_VALUE}>
                    Áp dụng mọi ca
                  </SelectItem>
                  {shiftOptions.map((shift) => (
                    <SelectItem key={shift.id} value={String(shift.id)}>
                      {shift.name} · {formatVNClockTime(shift.startTime)}-
                      {formatVNClockTime(shift.endTime)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </div>
      ) : null}

      {!scopeReady ? (
        <AppEmptyState
          mode="no-data"
          title={INVENTORY_VI.countAssignNoWarehouseTitle}
          description={INVENTORY_VI.countAssignNoWarehouseDescription}
          symbol="riceGrain"
        />
      ) : (
        <DataTable
          columns={columns}
          data={visibleEmployees}
          getRowKey={(employee) => employee.id}
          searchable
          searchValue={employeeSearch}
          onSearchChange={setEmployeeSearch}
          searchPlaceholder="Tìm nhân viên…"
          emptyMode={employeeSearch.trim() ? "no-results" : "no-data"}
          emptyTitle={INVENTORY_VI.countAssignNoEmployeesTitle}
          emptyDescription={INVENTORY_VI.countAssignNoEmployeesDescription}
          mobileCardRender={(employee) => {
            const selectedIds = selectionByEmployee[String(employee.id)] ?? [];
            return (
              <Item variant="outline" className="items-start">
                <ItemContent className="min-w-0">
                  <ItemTitle>{employee.name}</ItemTitle>
                  <ItemDescription>
                    {selectedIds.length > 0
                      ? `${selectedIds.length} mặt hàng`
                      : "Chưa gán mặt hàng"}
                  </ItemDescription>
                  <AssignmentBadges
                    selectedIds={selectedIds}
                    ingredientMap={ingredientMap}
                  />
                </ItemContent>
                <ItemActions className="flex-col">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isPending}
                    onClick={() => openEditor(employee)}
                  >
                    <IconPencil aria-hidden="true" />
                    {ACTIONS_VI.edit}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={isPending || selectedIds.length === 0}
                    onClick={() => void handleClear(employee)}
                  >
                    <IconTrash aria-hidden="true" />
                    {ACTIONS_VI.delete}
                  </Button>
                </ItemActions>
              </Item>
            );
          }}
        />
      )}

      <AppDialog
        open={activeEmployee !== null}
        onOpenChange={(open) => {
          if (!open) closeEditor();
        }}
        title={`Phân công đếm tồn: ${activeEmployee?.name ?? ""}`}
        description={INVENTORY_VI.countAssignEditDescription(
          activeEmployee?.name ?? "",
        )}
        contentClassName="max-h-dvh-95 overflow-hidden sm:max-w-3xl"
        bodyClassName="min-h-0 overflow-hidden"
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={closeEditor}
            >
              {ACTIONS_VI.cancel}
            </Button>
            <Button type="button" disabled={isPending} onClick={handleSave}>
              {isPending ? <Spinner data-icon="inline-start" /> : null}
              {ACTIONS_VI.save}
            </Button>
          </>
        }
      >
        <InputGroup>
          <InputGroupAddon>
            <IconSearch aria-hidden="true" />
          </InputGroupAddon>
          <InputGroupInput
            name="count-assignment-ingredient-search"
            autoComplete="off"
            value={ingredientSearch}
            onChange={(event) => setIngredientSearch(event.target.value)}
            placeholder={INVENTORY_VI.countAssignSearchPlaceholder}
            inputMode="search"
          />
        </InputGroup>

        <Frame className="h-96 min-h-0 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="grid gap-1 p-2 sm:grid-cols-2">
              {ingredients.length === 0 ? (
                <p className="col-span-full px-3 py-2 text-sm text-muted-foreground">
                  {INVENTORY_VI.countAssignNoFinishedGoods}
                </p>
              ) : visibleIngredients.length === 0 ? (
                <p className="col-span-full px-3 py-2 text-sm text-muted-foreground">
                  {INVENTORY_VI.countAssignNoIngredientMatches}
                </p>
              ) : (
                visibleIngredients.map((ingredient) => {
                  const checked = draftIds.includes(ingredient.id);
                  const checkboxId = `count-assignment-${activeEmployee?.id}-${ingredient.id}`;
                  return (
                    <Item
                      key={ingredient.id}
                      render={<Label htmlFor={checkboxId} />}
                      variant="outline"
                      className={cn(
                        "min-w-0 cursor-pointer items-center gap-3",
                        checked
                          ? "border-primary/20 bg-primary/10"
                          : "border-transparent hover:bg-muted",
                      )}
                    >
                      <Checkbox
                        id={checkboxId}
                        checked={checked}
                        onCheckedChange={() => toggleIngredient(ingredient.id)}
                        disabled={isPending}
                      />
                      <span className="min-w-0 flex-1 truncate">
                        {ingredient.name}
                      </span>
                      {ingredient.unit ? (
                        <Badge variant="outline">{ingredient.unit}</Badge>
                      ) : null}
                    </Item>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </Frame>
      </AppDialog>
    </AppPage>
  );
}
