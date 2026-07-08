/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: operator hub uses vietnamese */
"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight as IconArrowRight,
  FileText as IconFileText,
  Search as IconSearch,
  Trash2,
} from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Checkbox } from "@comtammatu/ui/components/checkbox";
import { Label } from "@comtammatu/ui/components/label";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { toast } from "@comtammatu/ui/components/sonner";
import {
  Item,
  ItemContent,
  ItemTitle,
  ItemGroup,
} from "@comtammatu/ui/components/item";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from "@comtammatu/ui/components/drawer";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@comtammatu/ui/components/input-group";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { cn } from "@comtammatu/ui";
import { ACTIONS_VI, INVENTORY_VI } from "@comtammatu/shared/messages";
import { AppEmptyState, AppPage, AppPageHeader } from "@/components/surface";
import { setCountAssignments } from "./actions";
import { useSwipeReveal, type SwipeReveal } from "@lib/hooks/use-swipe-reveal";
import { useLongPress } from "@lib/hooks/use-long-press";
import { matchesSearch } from "@lib/search";

export interface EmployeeRow {
  id: number;
  name: string;
}

export interface IngredientOption {
  id: number;
  name: string;
  unit: string;
}

export interface LocationOption {
  id: number;
  label: string;
  kind: string | null;
}

export interface ShiftOption {
  id: number;
  name: string;
  startTime: string;
  endTime: string;
}

interface Props {
  selectedBranchId: number | null;
  selectedLocationId: number | null;
  selectedShiftId: number | null;
  locationOptions: LocationOption[];
  shiftOptions: ShiftOption[];
  employees: EmployeeRow[];
  ingredients: IngredientOption[];
  assignmentsByEmployee: Record<string, number[]>;
  basePath?: string;
  embedded?: boolean;
}

const ALL_SHIFTS_VALUE = "all";

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

function formatShiftTime(value: string) {
  return value.slice(0, 5);
}

function buildShiftScopeHref({
  basePath,
  embedded,
  branchId,
  locationId,
  shiftId,
}: {
  basePath: string;
  embedded: boolean;
  branchId: number | null;
  locationId: number | null;
  shiftId: number | null;
}) {
  const params = new URLSearchParams();
  if (!embedded && branchId !== null) params.set("branchId", String(branchId));
  if (locationId !== null) params.set("locationId", String(locationId));
  if (shiftId !== null) params.set("shiftId", String(shiftId));
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

function EmployeeAssignmentRow({
  emp,
  selectedIds,
  isPending,
  ingredientMap,
  onClear,
  onOpenDrawer,
  swipe,
}: {
  emp: EmployeeRow;
  selectedIds: number[];
  isPending: boolean;
  ingredientMap: Map<number, IngredientOption>;
  onClear: (empId: number) => void;
  onOpenDrawer: () => void;
  swipe: SwipeReveal;
}) {
  const isRevealed = swipe.isRevealed(String(emp.id));
  const swipeBindings = swipe.bindings(String(emp.id));

  const longPress = useLongPress({
    onLongPress: onOpenDrawer,
    onClick: () => {
      if (swipe.consumeSuppression(String(emp.id))) {
        swipe.clearReveal();
        return;
      }
      if (isRevealed) {
        swipe.clearReveal();
        return;
      }
      onOpenDrawer();
    },
  });

  const handlers = {
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      swipeBindings.onPointerDown(e);
      longPress.onPointerDown(e);
    },
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
      swipeBindings.onPointerMove(e);
      longPress.onPointerMove(e);
    },
    onPointerUp: (e: ReactPointerEvent<HTMLElement>) => {
      swipeBindings.onPointerUp(e);
      longPress.onPointerUp();
    },
    onPointerCancel: (e: ReactPointerEvent<HTMLElement>) => {
      swipeBindings.onPointerCancel(e);
      longPress.onPointerCancel();
    },
    onContextMenu: longPress.onContextMenu,
  };

  const hasAssignments = selectedIds.length > 0;

  return (
    <div className="relative overflow-hidden rounded-md bg-transparent">
      <div className="absolute inset-y-0 right-0 flex w-20 items-center justify-end">
        <Button
          variant="destructive"
          className="h-full w-full rounded-none"
          disabled={isPending || !hasAssignments}
          onClick={() => {
            swipe.clearReveal();
            onClear(emp.id);
          }}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>

      <div
        className={cn(
          "h-full cursor-pointer rounded-md border bg-card transition-transform duration-300 ease-out",
          isRevealed ? "-translate-x-20" : "translate-x-0",
        )}
        {...handlers}
      >
        <Item
          variant="outline"
          className="flex h-full select-none flex-col border-none p-3 pointer-events-none"
        >
          <ItemContent className="min-w-0 w-full">
            <div className="flex items-start justify-between gap-3 w-full">
              <ItemTitle className="text-base font-semibold">
                {emp.name}
              </ItemTitle>
              <Badge variant={hasAssignments ? "success" : "outline"}>
                {hasAssignments ? `${selectedIds.length} mặt hàng` : "Chưa gán"}
              </Badge>
            </div>
            {hasAssignments && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {selectedIds.slice(0, 5).map((id) => (
                  <Badge key={id} variant="secondary" className="px-1.5 py-0">
                    {ingredientMap.get(id)?.name ?? `#${id}`}
                  </Badge>
                ))}
                {selectedIds.length > 5 && (
                  <Badge variant="secondary" className="px-1.5 py-0">
                    +{selectedIds.length - 5}
                  </Badge>
                )}
              </div>
            )}
          </ItemContent>
        </Item>
      </div>
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
  basePath = "/inventory/count-assignments",
  embedded = false,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [activeEmpId, setActiveEmpId] = useState<number | null>(null);
  const swipe = useSwipeReveal({ revealWidth: 80 });

  const ingredientMap = useMemo(() => {
    const m = new Map<number, IngredientOption>();
    for (const i of ingredients) m.set(i.id, i);
    return m;
  }, [ingredients]);

  const [selectionByEmployee, setSelectionByEmployee] = useState<
    Record<string, number[]>
  >(() => seedSelections(employees, assignmentsByEmployee));

  useEffect(() => {
    setSelectionByEmployee(seedSelections(employees, assignmentsByEmployee));
  }, [employees, assignmentsByEmployee]);

  const scopeReady = selectedBranchId !== null && selectedLocationId !== null;
  const countHref = buildBranchCountHref(selectedBranchId, selectedLocationId);
  const slipsHref = basePath.replace("count-assignments", "count-slips");
  const shiftSelectValue =
    selectedShiftId === null ? ALL_SHIFTS_VALUE : String(selectedShiftId);
  const assignedEmployeeCount = Object.values(selectionByEmployee).filter(
    (ids) => ids.length > 0,
  ).length;

  // Drawer state
  const activeEmp = activeEmpId
    ? employees.find((e) => e.id === activeEmpId)
    : null;
  const [draftIds, setDraftIds] = useState<number[]>([]);
  const [drawerSearch, setDrawerSearch] = useState("");

  useEffect(() => {
    if (activeEmpId !== null) {
      setDraftIds(selectionByEmployee[String(activeEmpId)] ?? []);
    } else {
      setDraftIds([]);
    }
  }, [activeEmpId, selectionByEmployee]);

  useEffect(() => {
    setDrawerSearch("");
  }, [activeEmpId]);

  const visibleIngredients = useMemo(() => {
    const query = drawerSearch.trim();
    if (!query) return ingredients;
    return ingredients.filter((ingredient) =>
      matchesSearch([ingredient.name, ingredient.unit], query),
    );
  }, [drawerSearch, ingredients]);

  function handleSave() {
    if (!activeEmp || selectedBranchId === null || selectedLocationId === null)
      return;
    const nextIds = [...draftIds];

    startTransition(async () => {
      const result = await setCountAssignments({
        branchId: selectedBranchId,
        locationId: selectedLocationId,
        employeeId: activeEmp.id,
        shiftId: selectedShiftId,
        ingredientIds: nextIds,
      });
      if (!result.success) {
        toast.error(result.error ?? INVENTORY_VI.countAssignSaveFailed);
        return;
      }
      setSelectionByEmployee((prev) => ({
        ...prev,
        [String(activeEmp.id)]: nextIds,
      }));
      toast.success(
        nextIds.length === 0
          ? INVENTORY_VI.countAssignRemoved(activeEmp.name)
          : INVENTORY_VI.countAssignSaved(activeEmp.name, nextIds.length),
      );
      setActiveEmpId(null);
      router.refresh();
    });
  }

  function handleClear(empId: number) {
    if (selectedBranchId === null || selectedLocationId === null) return;

    startTransition(async () => {
      const result = await setCountAssignments({
        branchId: selectedBranchId,
        locationId: selectedLocationId,
        employeeId: empId,
        shiftId: selectedShiftId,
        ingredientIds: [],
      });
      if (!result.success) {
        toast.error(result.error ?? INVENTORY_VI.countAssignSaveFailed);
        return;
      }
      setSelectionByEmployee((prev) => ({
        ...prev,
        [String(empId)]: [],
      }));
      toast.success(
        INVENTORY_VI.countAssignRemoved(
          employees.find((e) => e.id === empId)?.name ?? "Nhân viên",
        ),
      );
      router.refresh();
    });
  }

  function toggleIngredient(id: number) {
    setDraftIds((current) =>
      current.includes(id)
        ? current.filter((currentId) => currentId !== id)
        : [...current, id],
    );
  }

  function changeShiftScope(value: string) {
    const parsedShiftId =
      value === ALL_SHIFTS_VALUE ? null : Number.parseInt(value, 10);
    const nextShiftId =
      parsedShiftId !== null && Number.isFinite(parsedShiftId)
        ? parsedShiftId
        : null;
    router.replace(
      buildShiftScopeHref({
        basePath,
        embedded,
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
        basePath,
        embedded,
        branchId: selectedBranchId,
        locationId: nextLocationId,
        shiftId: selectedShiftId,
      }),
    );
  }

  const showLocationPicker = scopeReady && locationOptions.length > 1;
  const showShiftPicker = scopeReady && shiftOptions.length > 0;

  const assignmentActions = (
    <div
      className={cn(
        embedded
          ? "grid grid-cols-2 gap-2"
          : "flex flex-wrap items-center justify-end gap-2",
      )}
    >
      <Button
        asChild
        variant="outline"
        size={embedded ? "touch" : "default"}
        className={
          embedded
            ? "min-w-0 justify-center whitespace-normal px-2 text-center leading-tight"
            : undefined
        }
      >
        <Link href={slipsHref}>
          <IconFileText className="size-4" />
          {INVENTORY_VI.countSlipTitle}
        </Link>
      </Button>
      {countHref ? (
        <Button
          asChild
          variant="outline"
          size={embedded ? "touch" : "default"}
          className={
            embedded
              ? "min-w-0 justify-center whitespace-normal px-2 text-center leading-tight"
              : undefined
          }
        >
          <Link href={countHref}>
            <IconArrowRight className="size-4" />
            {INVENTORY_VI.openCountScreen}
          </Link>
        </Button>
      ) : null}
    </div>
  );

  const content = (
    <>
      {embedded ? (
        <section
          className="flex flex-col gap-2"
          aria-labelledby="count-assignments-embedded-title"
        >
          <div className="flex min-w-0 items-center justify-between gap-2">
            <h3
              id="count-assignments-embedded-title"
              className="min-w-0 flex-1 font-heading text-base font-semibold leading-tight"
            >
              {INVENTORY_VI.countAssignTitle}
            </h3>
            {scopeReady ? (
              <Badge variant="secondary">
                {assignedEmployeeCount}/{employees.length} đã giao
              </Badge>
            ) : null}
          </div>
          <p className="hidden text-sm leading-5 text-muted-foreground sm:block">
            {INVENTORY_VI.countAssignDescription}
          </p>
          {assignmentActions}
        </section>
      ) : (
        <AppPageHeader
          eyebrow={INVENTORY_VI.countAssignEyebrow}
          title={INVENTORY_VI.countAssignTitle}
          description={INVENTORY_VI.countAssignDescription}
          actions={assignmentActions}
        />
      )}

      {showLocationPicker || showShiftPicker ? (
        <div className="grid gap-3 sm:max-w-xl sm:grid-cols-2">
          {showLocationPicker ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="count-assignment-location">
                {INVENTORY_VI.warehouseShort}
              </Label>
              <Select
                value={String(selectedLocationId)}
                onValueChange={changeLocationScope}
              >
                <SelectTrigger id="count-assignment-location" className="w-full">
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
              <Label htmlFor="count-assignment-shift">Ca làm</Label>
              <Select value={shiftSelectValue} onValueChange={changeShiftScope}>
                <SelectTrigger id="count-assignment-shift" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_SHIFTS_VALUE}>Mỗi ca</SelectItem>
                  {shiftOptions.map((shift) => (
                    <SelectItem key={shift.id} value={String(shift.id)}>
                      {shift.name} · {formatShiftTime(shift.startTime)}-
                      {formatShiftTime(shift.endTime)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </div>
      ) : null}

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

      {scopeReady && employees.length > 0 && (
        <ItemGroup className="gap-2 overflow-hidden sm:overflow-visible">
          {employees.map((emp) => (
            <EmployeeAssignmentRow
              key={emp.id}
              emp={emp}
              ingredientMap={ingredientMap}
              selectedIds={selectionByEmployee[String(emp.id)] ?? []}
              isPending={isPending}
              onClear={handleClear}
              onOpenDrawer={() => setActiveEmpId(emp.id)}
              swipe={swipe}
            />
          ))}
          {isPending ? (
            <div className="flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground">
              <Spinner className="size-4" />
              <span>Đang cập nhật…</span>
            </div>
          ) : null}
        </ItemGroup>
      )}

      <Drawer
        open={activeEmpId !== null}
        onOpenChange={(o) => !o && setActiveEmpId(null)}
      >
        <DrawerContent className="flex h-dvh max-h-dvh-80 flex-col overflow-hidden">
          <DrawerHeader className="shrink-0">
            <DrawerTitle>Phân công đếm tồn: {activeEmp?.name}</DrawerTitle>
            <DrawerDescription>
              {INVENTORY_VI.countAssignEditDescription(activeEmp?.name ?? "")}
            </DrawerDescription>
          </DrawerHeader>
          <div className="shrink-0 px-4 pb-3">
            <InputGroup className="h-12">
              <InputGroupAddon>
                <IconSearch />
              </InputGroupAddon>
              <InputGroupInput
                value={drawerSearch}
                onChange={(event) => setDrawerSearch(event.target.value)}
                placeholder={INVENTORY_VI.countAssignSearchPlaceholder}
                inputMode="search"
              />
            </InputGroup>
          </div>
          <ScrollArea className="min-h-0 flex-1 px-4">
            <div className="flex flex-col gap-1 pb-4 pr-2" data-vaul-no-drag>
              {ingredients.length === 0 ? (
                <p className="rounded-md border bg-muted px-3 py-2 text-sm text-muted-foreground">
                  {INVENTORY_VI.countAssignNoFinishedGoods}
                </p>
              ) : visibleIngredients.length === 0 ? (
                <p className="px-3 py-2 text-sm text-muted-foreground">
                  {INVENTORY_VI.countAssignNoIngredientMatches}
                </p>
              ) : (
                visibleIngredients.map((ingredient) => {
                  const checked = draftIds.includes(ingredient.id);
                  const checkboxId = `count-assignment-${activeEmp?.id}-${ingredient.id}`;
                  return (
                    <div
                      key={ingredient.id}
                      className={cn(
                        "flex items-start gap-2 rounded-md border px-2 py-2 transition-colors",
                        checked
                          ? "border-primary/20 bg-primary/10"
                          : "border-transparent bg-card hover:bg-muted",
                      )}
                      onClick={() => toggleIngredient(ingredient.id)}
                    >
                      <Checkbox
                        id={checkboxId}
                        size="touch"
                        checked={checked}
                        onClick={(event) => event.stopPropagation()}
                        onCheckedChange={() => toggleIngredient(ingredient.id)}
                        disabled={isPending}
                      />
                      <Label
                        htmlFor={checkboxId}
                        className="flex min-w-0 flex-1 cursor-pointer items-start justify-between gap-3 pointer-events-none"
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
                })
              )}
            </div>
          </ScrollArea>
          <DrawerFooter className="shrink-0 flex-row gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              disabled={isPending}
              onClick={() => setActiveEmpId(null)}
            >
              Hủy
            </Button>
            <Button
              type="button"
              className="flex-1"
              disabled={isPending || ingredients.length === 0}
              onClick={handleSave}
            >
              {isPending && <Spinner />}
              {ACTIONS_VI.save}
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </>
  );

  if (embedded) {
    return content;
  }

  return <AppPage scroll>{content}</AppPage>;
}
