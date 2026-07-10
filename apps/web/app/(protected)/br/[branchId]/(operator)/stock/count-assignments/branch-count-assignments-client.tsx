"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronRight as IconChevronRight,
  ClipboardCheck as IconClipboardCheck,
  FileText as IconFileText,
  Search as IconSearch,
} from "lucide-react";
import { ACTIONS_VI, INVENTORY_VI } from "@comtammatu/shared/messages";
import { formatVNClockTime } from "@comtammatu/shared/time";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Checkbox } from "@comtammatu/ui/components/checkbox";
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
  ItemGroup,
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
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@comtammatu/ui/components/sheet";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { toast } from "@comtammatu/ui/components/sonner";
import { AppEmptyState } from "@/components/surface";
import {
  BranchOperatorPage,
  BranchOperatorPanel,
} from "@lib/branch-operator/components/branch-operator-page";
import { setCountAssignments } from "@/(protected)/inventory/count-assignments/actions";
import type {
  BranchCountAssignmentData,
  CountAssignmentEmployee,
} from "@lib/inventory/count-assignment-model";
import { matchesSearch } from "@lib/search";

const ALL_SHIFTS_VALUE = "all";

function seedSelections(data: BranchCountAssignmentData) {
  const seeded: Record<string, number[]> = {};
  for (const employee of data.employees) {
    seeded[String(employee.id)] =
      data.assignmentsByEmployee[String(employee.id)] ?? [];
  }
  return seeded;
}

export function BranchCountAssignmentsClient({
  data,
  embeddedInTeam = false,
}: {
  data: BranchCountAssignmentData;
  embeddedInTeam?: boolean;
}) {
  const router = useRouter();
  const basePath = `/br/${data.branchId}/stock/count-assignments`;
  const [isPending, startTransition] = useTransition();
  const [selectionByEmployee, setSelectionByEmployee] = useState<
    Record<string, number[]>
  >(() => seedSelections(data));
  const [activeEmployeeId, setActiveEmployeeId] = useState<number | null>(null);
  const [draftIds, setDraftIds] = useState<number[]>([]);
  const [query, setQuery] = useState("");
  const activeEmployee = data.employees.find(
    (employee) => employee.id === activeEmployeeId,
  );
  const ingredientById = useMemo(
    () =>
      new Map(
        data.ingredients.map((ingredient) => [ingredient.id, ingredient]),
      ),
    [data.ingredients],
  );
  const visibleIngredients = useMemo(() => {
    const normalized = query.trim();
    if (!normalized) return data.ingredients;
    return data.ingredients.filter((ingredient) =>
      matchesSearch([ingredient.name, ingredient.unit], normalized),
    );
  }, [data.ingredients, query]);
  const assignedEmployeeCount = Object.values(selectionByEmployee).filter(
    (ids) => ids.length > 0,
  ).length;
  const orderedEmployees = [...data.employees].sort((left, right) => {
    const leftAssigned =
      (selectionByEmployee[String(left.id)]?.length ?? 0) > 0;
    const rightAssigned =
      (selectionByEmployee[String(right.id)]?.length ?? 0) > 0;
    return (
      Number(rightAssigned) - Number(leftAssigned) ||
      left.name.localeCompare(right.name, "vi")
    );
  });

  useEffect(() => {
    setSelectionByEmployee(seedSelections(data));
  }, [data]);

  function openEmployee(employee: CountAssignmentEmployee) {
    setActiveEmployeeId(employee.id);
    setDraftIds(selectionByEmployee[String(employee.id)] ?? []);
    setQuery("");
  }

  function closeEditor() {
    setActiveEmployeeId(null);
    setDraftIds([]);
    setQuery("");
  }

  function toggleIngredient(ingredientId: number) {
    setDraftIds((current) =>
      current.includes(ingredientId)
        ? current.filter((id) => id !== ingredientId)
        : [...current, ingredientId],
    );
  }

  function saveAssignment() {
    if (!activeEmployee || data.selectedLocationId == null) {
      return;
    }
    const nextIds = [...draftIds];
    startTransition(async () => {
      const result = await setCountAssignments({
        branchId: data.branchId,
        locationId: data.selectedLocationId as number,
        employeeId: activeEmployee.id,
        shiftId: data.selectedShiftId,
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
      closeEditor();
      router.refresh();
    });
  }

  function replaceScope(locationId: number | null, shiftId: number | null) {
    const params = new URLSearchParams();
    if (locationId != null) params.set("locationId", String(locationId));
    params.set("shiftId", shiftId == null ? ALL_SHIFTS_VALUE : String(shiftId));
    router.replace(`${basePath}?${params.toString()}`);
  }

  const content = (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="grid gap-2 sm:grid-cols-2">
        {data.locationOptions.length > 0 ? (
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="branch-count-assignment-location">
              {INVENTORY_VI.warehouseShort}
            </Label>
            <Select
              value={String(data.selectedLocationId ?? "")}
              onValueChange={(value) =>
                replaceScope(Number(value), data.selectedShiftId)
              }
            >
              <SelectTrigger
                id="branch-count-assignment-location"
                size="touch"
                className="w-full"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {data.locationOptions.map((location) => (
                  <SelectItem key={location.id} value={String(location.id)}>
                    {location.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        {data.shiftOptions.length > 0 ? (
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="branch-count-assignment-shift">
              {INVENTORY_VI.countAssignShiftLabel}
            </Label>
            <Select
              value={
                data.selectedShiftId == null
                  ? ALL_SHIFTS_VALUE
                  : String(data.selectedShiftId)
              }
              onValueChange={(value) =>
                replaceScope(
                  data.selectedLocationId,
                  value === ALL_SHIFTS_VALUE ? null : Number(value),
                )
              }
            >
              <SelectTrigger
                id="branch-count-assignment-shift"
                size="touch"
                className="w-full"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_SHIFTS_VALUE}>
                  {INVENTORY_VI.countAssignAllShifts}
                </SelectItem>
                {data.shiftOptions.map((shift) => (
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

      {data.selectedLocationId == null ? (
        <AppEmptyState
          compact
          mode="no-data"
          icon={<IconClipboardCheck />}
          title={INVENTORY_VI.countAssignNoWarehouseTitle}
          description={INVENTORY_VI.countAssignNoWarehouseDescription}
        />
      ) : data.employees.length === 0 ? (
        <AppEmptyState
          compact
          mode="no-data"
          icon={<IconClipboardCheck />}
          title={INVENTORY_VI.countAssignNoEmployeesTitle}
          description={INVENTORY_VI.countAssignNoEmployeesDescription}
        />
      ) : (
        <ItemGroup className="grid gap-2 md:grid-cols-2">
          {orderedEmployees.map((employee) => {
            const selectedIds = selectionByEmployee[String(employee.id)] ?? [];
            return (
              <Item
                key={employee.id}
                asChild
                variant="outline"
                className="min-h-20 touch-manipulation"
              >
                <button type="button" onClick={() => openEmployee(employee)}>
                  <ItemContent className="min-w-0 gap-1 text-left">
                    <ItemTitle size="heading">{employee.name}</ItemTitle>
                    <ItemDescription className="line-clamp-none flex flex-wrap gap-1">
                      {selectedIds.slice(0, 4).map((ingredientId) => {
                        const ingredientName =
                          ingredientById.get(ingredientId)?.name ??
                          `#${ingredientId}`;
                        return (
                          <Badge
                            key={ingredientId}
                            variant="secondary"
                            className="min-w-0 max-w-full sm:max-w-48"
                            aria-label={ingredientName}
                            title={ingredientName}
                          >
                            <span className="min-w-0 truncate">
                              {ingredientName}
                            </span>
                          </Badge>
                        );
                      })}
                      {selectedIds.length > 4 ? (
                        <Badge variant="secondary">
                          +{selectedIds.length - 4}
                        </Badge>
                      ) : null}
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <Badge
                      variant={selectedIds.length > 0 ? "success" : "outline"}
                    >
                      {selectedIds.length}
                    </Badge>
                    <IconChevronRight className="size-4 text-muted-foreground" />
                  </ItemActions>
                </button>
              </Item>
            );
          })}
        </ItemGroup>
      )}
    </div>
  );

  const panel = (
    <BranchOperatorPanel
      title={INVENTORY_VI.countAssignTitle}
      description={INVENTORY_VI.countAssignDescription}
      icon={IconClipboardCheck}
      badge={{
        children: INVENTORY_VI.countAssignAssignedSummary(
          assignedEmployeeCount,
          data.employees.length,
        ),
      }}
      action={
        <Button asChild variant="outline" size="touch">
          <Link href={`/br/${data.branchId}/stock/count-slips`}>
            <IconFileText className="size-4" />
            {INVENTORY_VI.countSlipTitle}
          </Link>
        </Button>
      }
      size="sm"
    >
      {content}
    </BranchOperatorPanel>
  );

  const page = embeddedInTeam ? (
    panel
  ) : (
    <BranchOperatorPage
      title={INVENTORY_VI.countAssignTitle}
      description={data.branchName}
      hideHeaderOnMobile
    >
      {panel}
    </BranchOperatorPage>
  );

  return (
    <>
      {page}
      <Sheet
        open={activeEmployeeId != null}
        onOpenChange={(open) => {
          if (!open) closeEditor();
        }}
      >
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="max-h-dvh-95 overflow-hidden overscroll-contain bg-background p-0"
        >
          <SheetHeader>
            <SheetTitle>{activeEmployee?.name}</SheetTitle>
            <p className="text-sm text-muted-foreground">
              {INVENTORY_VI.countAssignEditDescription(
                activeEmployee?.name ?? "",
              )}
            </p>
          </SheetHeader>
          <div className="px-4 pb-3">
            <InputGroup className="h-12">
              <InputGroupAddon>
                <IconSearch />
              </InputGroupAddon>
              <InputGroupInput
                aria-label={INVENTORY_VI.countAssignSearchPlaceholder}
                name="branchCountAssignmentSearch"
                type="search"
                autoComplete="off"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={INVENTORY_VI.countAssignSearchPlaceholder}
                inputMode="search"
              />
            </InputGroup>
          </div>
          <ScrollArea className="min-h-0 flex-1 px-4">
            <div className="flex flex-col gap-2 pb-4 pr-2">
              {visibleIngredients.length === 0 ? (
                <AppEmptyState
                  compact
                  mode="no-results"
                  title={INVENTORY_VI.countAssignNoIngredientMatches}
                />
              ) : (
                visibleIngredients.map((ingredient) => {
                  const checked = draftIds.includes(ingredient.id);
                  const checkboxId = `branch-count-assignment-${activeEmployeeId}-${ingredient.id}`;
                  return (
                    <Item
                      key={ingredient.id}
                      asChild
                      variant={checked ? "muted" : "outline"}
                      className="min-h-14 cursor-pointer"
                    >
                      <Label htmlFor={checkboxId}>
                        <Checkbox
                          id={checkboxId}
                          size="touch"
                          checked={checked}
                          disabled={isPending}
                          onCheckedChange={() =>
                            toggleIngredient(ingredient.id)
                          }
                        />
                        <ItemContent className="min-w-0">
                          <span className="break-words font-medium">
                            {ingredient.name}
                          </span>
                          {ingredient.unit ? (
                            <ItemDescription>{ingredient.unit}</ItemDescription>
                          ) : null}
                        </ItemContent>
                      </Label>
                    </Item>
                  );
                })
              )}
            </div>
          </ScrollArea>
          <SheetFooter className="workflow-safe-pb">
            <Button
              type="button"
              variant="outline"
              size="touch"
              disabled={isPending}
              onClick={() => setDraftIds([])}
            >
              {INVENTORY_VI.countAssignRemoveAction}
            </Button>
            <Button
              type="button"
              size="touch-lg"
              disabled={isPending || data.ingredients.length === 0}
              onClick={saveAssignment}
            >
              {isPending ? <Spinner className="size-5" /> : null}
              {ACTIONS_VI.save}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
